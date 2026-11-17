import {editorSnapshot} from './browser-probes.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {openPostgresJournal} from './postgres.mjs';
import {startTestTransport} from './transport.mjs';
import {apiAccess} from './api-access.mjs';
import {png,pdf} from './file-fixtures.mjs';

// P3 only: actual API sessions + 21 separate Chromium contexts, never wire-only
// clients. The existing runner creates/tears down its disposable compose project.
export async function runApiBoardBrowser({api,accounts,group,beforeLessons,call}){
  assert.equal(process.env.TAS_BOARD_TEST_ONLY,'1');assert.equal(process.env.TAS_BOARD_GROUP_TEST_ONLY,'1');
  assert.match(process.env.TAS_REAL_COMPOSE_PROJECT,/^tas-calendar-browser-[a-zA-Z0-9-]+$/);
  assert.equal(new URL(api).hostname,'127.0.0.1');assert.ok(!process.env.JWT_SIGNING_KEY&&!process.env.TAS_BOARD_SCENE_ROOT_KEY);
  const key=Buffer.from(process.env.TAS_BOARD_SIGNING_KEY,'base64');assert.equal(key.length,32);
  const north=accounts.north;assert.equal(north.students.length,20);
  const lesson=beforeLessons.find(x=>x.groupClassId===group.id);assert.ok(lesson);
  const times={},start=performance.now(),errors=[],records=[],pages=[];
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const until=async(check,label,timeout=45000)=>{const end=performance.now()+timeout;while(!await check()){assert.ok(performance.now()<end,label);await wait(200);}};
  const phase=async(name,run)=>{const t=performance.now();await run();times[name]=Math.round(performance.now()-t);console.log('PASS P3: '+name);};
  // Respect the unchanged per-IP fixed-window login limit, including 429s.
  const learners=[];const loginStart=performance.now();
  for(const student of north.students){
    for(;;){
      const r=await fetch(api+'/api/v1/student-sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspace:north.workspace,code:student.inviteCode})});
      if(r.status===429){assert.ok(performance.now()-loginStart<300000,'Student login rate-limit wait exceeded');await wait(15000);continue;}
      assert.equal(r.status,200,'Actual student login');learners.push(await r.json());break;
    }
  }
  const actor=token=>JSON.parse(Buffer.from(token.split('.')[1],'base64url')).sub.replaceAll('-','');
  assert.equal(new Set(learners.map(x=>actor(x.accessToken))).size,20,'20 distinct student identities required');
  const groupPermit=await call('teacher/board-prototype/lessons/'+lesson.id+'/permit',north.token,{});
  const scope={workspace:groupPermit.workspace,board:groupPermit.board};
  let journal=await openPostgresJournal(process.env.BOARD_TEST_DATABASE_URL),room,dropActor,dropCount=0;
  const acknowledge=({event,claims})=>{if(event==='submit'&&claims.user===dropActor){dropActor=undefined;dropCount++;return false;}return true;};
  const openRoom=port=>startTestTransport({key,journal,authorize:apiAccess(api),acknowledge,...(port?{port}:{})});
  room=await openRoom();const port=Number(new URL(room.url).port);
  const cwd=process.cwd();process.chdir(new URL('.',import.meta.url).pathname);
  const site=await createServer({server:{host:'127.0.0.1',port:8768,strictPort:true}});await site.listen();
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const contextConfig={viewport:{width:1100,height:800}};
  async function page(token,role,lessonId=lesson.id,allowed=true){
    const c=await browser.newContext(contextConfig);
    await c.route('**/*',r=>{const u=new URL(r.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?r.continue():r.abort();});
    const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.addInitScript(config=>{window.__BOARD_TEST_CONFIG=config;},{url:room.url,session:{apiBase:api,accessToken:token,role,lessonId}});
    await p.goto('http://127.0.0.1:8768');
    await p.waitForFunction(t=>document.querySelector('#status')?.textContent===t,allowed?'Сохранено':'Нет доступа к занятию',{timeout:45000});
    if(!allowed){await c.close();return null;}
    // Synthetic input evidence distinguishes a missing native action from an
    // acknowledged edit later overwritten by replay. Keep assertions unchanged.
    await p.evaluate(()=>{
      window.__BOARD_KEY_TRACE=[];
      window.addEventListener('keydown',event=>{
        if(!['Backspace','ArrowLeft','ArrowRight'].includes(event.key))return;
        const api=window.__BOARD_EDITOR,ids=Object.keys(api.getAppState().selectedElementIds).filter(id=>api.getAppState().selectedElementIds[id]);
        const snapshot=()=>api.getSceneElementsIncludingDeleted().filter(e=>ids.includes(e.id)).map(e=>({id:e.id,version:e.version,nonce:e.versionNonce,deleted:e.isDeleted}));
        const row={key:event.key,target:event.target?.tagName,selected:ids,before:snapshot(),at:Date.now()};
        if(window.__BOARD_KEY_TRACE.length<16)window.__BOARD_KEY_TRACE.push(row);
        setTimeout(()=>{row.after=snapshot();row.prevented=event.defaultPrevented;},0);
        setTimeout(()=>{row.later=snapshot();},250);
      },true);
    });return p;
  }
  const at=i=>({x:260+(i%5)*110,y:150+Math.floor(i/5)*110});
  async function draw(p,x,y){await p.getByTitle(/Rectangle/).first().click();await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+95,y+70,{steps:5});await p.mouse.up();}
  const saved=p=>p.waitForFunction(()=>document.querySelector('#status')?.textContent==='Сохранено',null,{timeout:45000});
  const count=(p,n)=>p.waitForFunction(n=>window.__BOARD_EDITOR.getSceneElements().length===n,n,{timeout:45000});
  // Hash every serialized element field, including versions/nonces/order and
  // tombstones, plus exact binary contents. Never compare only shape counts.
  const state=p=>p.evaluate(editorSnapshot);
  async function converge(active,deleted,list=pages){
    let previous;
    try{await until(async()=>{
      const all=await Promise.all(list.map(state)),first=all[0];
      const ok=all.every(x=>x.status==='Сохранено'&&x.active===active&&x.deleted===deleted&&x.hash&&x.hash===first.hash);
      if(ok&&previous===first.hash){records.push({active,deleted,principals:list.length,hash:first.hash});return true;}
      previous=ok?first.hash:undefined;return false;
    },'Full group state divergence');}catch(e){console.error('P3 divergence summary',JSON.stringify(await Promise.all(list.map(state))));
      console.error('P3 native input evidence',JSON.stringify((await Promise.all(list.map((p,i)=>p.evaluate(i=>({i,keys:window.__BOARD_KEY_TRACE??[]}),i)))).filter(x=>x.keys.length)));
      const rows=await Promise.all(list.slice(0,3).map(p=>p.evaluate(()=>window.__BOARD_EDITOR.getSceneElementsIncludingDeleted()))),base=new Map(rows[0].map(e=>[e.id,e]));
      console.error('P3 differing fields',JSON.stringify(rows.slice(1).map(items=>items.flatMap(e=>{const a=base.get(e.id);return a?[{id:e.id,fields:Object.keys(e).filter(k=>JSON.stringify(e[k])!==JSON.stringify(a[k]))}]:[{missing:true}];}).filter(e=>e.missing||e.fields.length).slice(0,3))));throw e;}
  }
  async function select(p,id){
    const e=await p.evaluate(id=>window.__BOARD_EDITOR.getSceneElements().find(e=>e.id===id),id);assert.ok(e);
    await p.keyboard.press('Escape');await p.getByTitle(/Selection/).first().click({noWaitAfter:true});
    await p.waitForFunction(()=>window.__BOARD_EDITOR.getAppState().activeTool.type==='selection');
    // The synthetic grid leaves this canvas point empty. Clear the old selection
    // before touching a border: an existing selection exposes resize handles.
    await p.mouse.click(950,650);await p.waitForFunction(()=>!Object.values(window.__BOARD_EDITOR.getAppState().selectedElementIds).some(Boolean));
    await p.mouse.click(e.x+e.width/2,e.y);
    await p.waitForFunction(id=>{const s=window.__BOARD_EDITOR.getAppState().selectedElementIds;return s[id]&&Object.values(s).filter(Boolean).length===1&&window.__BOARD_EDITOR.getSceneElements().some(e=>e.id===id);},id);
  }
  try{
    await phase('21 actual principals and simultaneous draw',async()=>{
      pages.push(await page(north.token,'teacher'));
      // Bound startup CPU without reducing simultaneous connected editor count.
      for(let i=0;i<20;i+=3)pages.push(...await Promise.all(learners.slice(i,i+3).map(x=>page(x.accessToken,'student'))));
      assert.equal(pages.length,21);assert.equal(browser.contexts().length,21);
      await Promise.all(pages.map((p,i)=>{const pos=at(i);return draw(p,pos.x,pos.y);}));await converge(21,0);
    });
    const initial=await pages[0].evaluate(()=>window.__BOARD_EDITOR.getSceneElements().map(e=>({id:e.id,x:e.x,y:e.y,version:e.version})));
    const own=i=>initial.find(e=>e.x===at(i).x&&e.y===at(i).y).id;
    await phase('same-element conflict, simultaneous delete and undo',async()=>{
      const id=own(0),before=initial.find(e=>e.id===id);
      await Promise.all([select(pages[0],id),select(pages[1],id)]);
      await Promise.all([pages[0].keyboard.press('ArrowRight'),pages[1].keyboard.press('ArrowLeft')]);await converge(21,0);
      const after=await pages[0].evaluate(id=>window.__BOARD_EDITOR.getSceneElements().find(e=>e.id===id),id);
      assert.ok(after.version>before.version,'Shared element was not edited');
      await Promise.all([select(pages[3],own(3)),select(pages[4],own(4))]);
      await Promise.all([pages[3].keyboard.press('Backspace'),pages[4].keyboard.press('Backspace')]);await converge(19,2);
      await pages[3].getByRole('button',{name:'Undo',exact:true}).click();await converge(20,1);
      // Repeated native edits catch stale selections and accidental resize-handle
      // interaction; retain the original20/1 scene for the following phases.
      await pages[4].getByRole('button',{name:'Undo',exact:true}).click();await converge(21,0);
      for(let cycle=0;cycle<3;cycle++){
        await Promise.all([select(pages[3],own(3)),select(pages[4],own(4))]);
        await Promise.all([pages[3].keyboard.press('Backspace'),pages[4].keyboard.press('Backspace')]);await converge(19,2);
        await Promise.all([pages[3].getByRole('button',{name:'Undo',exact:true}).click(),pages[4].getByRole('button',{name:'Undo',exact:true}).click()]);await converge(21,0);
      }
      await select(pages[4],own(4));await pages[4].keyboard.press('Backspace');await converge(20,1);
    });
    await phase('offline pending edits, lost commit ack and late join',async()=>{
      await pages[20].context().close();pages.pop();
      const disconnected=[pages[5],pages[6]];
      for(let i=0;i<2;i++){await disconnected[i].context().setOffline(true);room.disconnectUser(actor(learners[4+i].accessToken));}
      for(const p of disconnected)await p.waitForFunction(()=>document.querySelector('#status')?.textContent!=='Сохранено');
      const before=(await journal.read(scope,0)).head,append=journal.append,attempts=[];
      journal.append=async(s,f)=>{if(f.user===actor(learners[4].accessToken))attempts.push({id:f.messageId,iv:Buffer.from(f.iv),ciphertext:Buffer.from(f.ciphertext),fileIds:f.fileIds});return append(s,f);};
      await Promise.all(disconnected.map((p,i)=>draw(p,650+110*i,650)));
      for(const p of disconnected){await count(p,21);assert.notEqual(await p.locator('#status').textContent(),'Сохранено');}
      assert.equal((await journal.read(scope,0)).head,before,'Offline edits reached storage');
      dropActor=actor(learners[4].accessToken);await Promise.all(disconnected.map(p=>p.context().setOffline(false)));
      await converge(22,1);
      assert.equal(dropCount,1);const retried=attempts.filter(x=>x.id===attempts[0]?.id);assert.ok(retried.length>=2);
      for(const r of retried)assert.deepEqual(r,retried[0],'Retry changed immutable bytes');
      const persisted=(await journal.replay(scope,before)).filter(x=>x.user===actor(learners[4].accessToken));
      assert.equal(persisted.length,new Set(attempts.map(x=>x.id)).size,'Lost acknowledgement duplicated a revision');journal.append=append;
      pages.push(await page(learners[19].accessToken,'student'));await converge(22,1);assert.equal(pages.length,21);
    });
    await phase('PNG/PDF and checkpoint interleaved with group edit',async()=>{
      await pages[0].getByTestId('board-file').setInputFiles({name:'group.png',mimeType:'image/png',buffer:png});await converge(23,1);
      await pages[0].getByTestId('board-file').setInputFiles({name:'group.pdf',mimeType:'application/pdf',buffer:pdf});
      await Promise.all(pages.map(p=>p.getByRole('button',{name:'group.pdf',exact:true}).waitFor()));await converge(23,1);
      const cp=journal.checkpoint;let release,stale=0;
      journal.checkpoint=async(s,p)=>{if(!release)await new Promise(r=>release=r);const result=await cp(s,p);if(!result.accepted)stale++;return result;};
      await pages[0].getByTestId('board-checkpoint').click();await until(()=>!!release,'Group checkpoint arrival');
      try{await draw(pages[7],540,650);await count(pages[7],24);await saved(pages[7]);}finally{release();}
      await pages[0].getByTestId('checkpoint-status').filter({hasText:/Контрольная точка: [0-9]+/}).waitFor({timeout:45000});
      journal.checkpoint=cp;assert.ok(stale>0);await converge(24,1);assert.ok((await journal.read(scope)).checkpoint);
    });
    await phase('room and storage pool restart while teacher has pending edit',async()=>{
      await room.close();await journal.close();
      await pages[0].waitForFunction(()=>document.querySelector('#status')?.textContent!=='Сохранено');
      await draw(pages[0],430,650);await count(pages[0],25);assert.notEqual(await pages[0].locator('#status').textContent(),'Сохранено');
      journal=await openPostgresJournal(process.env.BOARD_TEST_DATABASE_URL);room=await openRoom(port);await converge(25,1);
      // Every principal reloads its real editor from durable checkpoint + tail.
      for(let i=0;i<pages.length;i+=3)await Promise.all(pages.slice(i,i+3).map(async p=>{await p.reload();await saved(p);}));
      await converge(25,1);assert.equal(browser.contexts().length,21);
      const download=pages[20].waitForEvent('download');await pages[20].getByRole('button',{name:'group.pdf',exact:true}).click();
      const parts=[],stream=await(await download).createReadStream();for await(const b of stream)parts.push(b);assert.ok(Buffer.concat(parts).equals(pdf));
    });
    await phase('actual foreign/nonparticipant denial and connected revocation',async()=>{
      await page(accounts.south.token,'teacher',lesson.id,false);
      const solo=beforeLessons.find(x=>x.individualClassId===north.item.id);await page(learners[1].accessToken,'student',solo.id,false);
      const before=await journal.read(scope);await call('teacher/students/'+north.students[0].membershipId+'/archive',north.token,{});
      await pages[1].waitForFunction(()=>document.querySelector('#status')?.textContent!=='Сохранено');
      await draw(pages[1],320,650);await count(pages[1],26);
      await converge(25,1,pages.filter((_,i)=>i!==1));assert.deepEqual(await journal.read(scope),before);
    });
    assert.deepEqual(errors,[]);const result={status:'PASS',scenario:'P3 actual API 1 teacher + 20 pupils',principals:21,contexts:21,
      phases:times,convergence:records,durationMs:Math.round(performance.now()-start),p4:'NOT_RUN'};
    const output=new URL('../../test-results/',import.meta.url);await mkdir(output,{recursive:true});await writeFile(new URL('board-group-result.json',output),JSON.stringify(result,null,2));
    console.log('PASS P3: 21 distinct actual API principals/editors; full-field/tombstone/file convergence, conflicts/delete/undo, offline retry/late join, checkpoint, pool/room restart and reload, scope/revocation. P4 NOT_RUN.');
  }catch(e){
    const output=new URL('../../test-results/',import.meta.url);await mkdir(output,{recursive:true});
    const snapshots=await Promise.allSettled(pages.map(state));
    await writeFile(new URL('board-group-result.json',output),JSON.stringify({status:'FAIL',principals:pages.length,phases:times,durationMs:Math.round(performance.now()-start),error:e.name,summary:String(e.message).slice(0,160),states:snapshots.filter(x=>x.status==='fulfilled').map(x=>x.value),p4:'NOT_RUN'},null,2));throw e;
  }finally{await browser.close();await site.close();await room.close();await journal.close();process.chdir(cwd);}
}
