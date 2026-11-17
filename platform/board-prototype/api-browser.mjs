import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { png,pdf,jpeg } from './file-fixtures.mjs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { openPostgresJournal } from './postgres.mjs';
import { startTestTransport } from './transport.mjs';
import { apiAccess } from './api-access.mjs';

export async function runApiBoardBrowser({api,accounts,group,beforeLessons,call}) {
  const project=process.env.TAS_REAL_COMPOSE_PROJECT;
  assert.match(project,/^tas-calendar-browser-[a-zA-Z0-9-]+$/);
  assert.equal(process.env.TAS_BOARD_TEST_ONLY,'1');
  assert.ok(process.env.TAS_BOARD_SCENE_ROOT_KEY===undefined,'Scene root must not reach the harness');
  assert.ok(process.env.JWT_SIGNING_KEY===undefined,'API signing key must not reach the harness');
  const key=Buffer.from(process.env.TAS_BOARD_SIGNING_KEY??'','base64');assert.equal(key.length,32);
  const connection=process.env.BOARD_TEST_DATABASE_URL;
  const north=accounts.north,south=accounts.south;
  const lesson=beforeLessons.find(x=>x.groupClassId===group.id);assert.ok(lesson);
  const solo=beforeLessons.find(x=>x.individualClassId===north.item.id);assert.ok(solo);
  const learners=await Promise.all(north.students.map(s=>call('student-sessions',null,{workspace:north.workspace,code:s.inviteCode})));
  let dropAcks=false,dropped=0;
  // Identity selects this isolated fault target; authorization stays server-side.
  const teacherId=JSON.parse(Buffer.from(north.token.split('.')[1],'base64url').toString()).sub.replaceAll('-','');
  let journal=await openPostgresJournal(connection),room=await startTestTransport({key,journal,authorize:apiAccess(api),
    acknowledge:({event,claims})=>{if(dropAcks&&event==='submit'&&claims.user===teacherId){dropped++;return false;}return true;}});
  const container=execFileSync('docker',['ps','--filter','label=com.docker.compose.project='+project,'--filter','label=com.docker.compose.service=api','--format','{{.ID}}'],{encoding:'utf8'}).trim();
  assert.match(container,/^[a-f0-9]{12,64}$/);let apiStopped=false;
  const until=async(check,label,timeout=20000)=>{const end=Date.now()+timeout;while(!await check()){assert.ok(Date.now()<end,label);await new Promise(r=>setTimeout(r,100));}};
  async function apiReady(){await until(async()=>{try{return(await fetch(api+'/health/ready',{signal:AbortSignal.timeout(2000)})).ok;}catch{return false;}},'API recovery',45000);}
  const cwd=process.cwd();process.chdir(new URL('.',import.meta.url).pathname);
  const site=await createServer({server:{host:'127.0.0.1',port:8768,strictPort:true}});await site.listen();
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const errors=[];
  let stopped=false,recoveryDir;
  async function stop(){if(stopped)return;stopped=true;await browser.close();await site.close();await room.close();await journal.close();}
  async function page(accessToken,role,lessonId=lesson.id,allowed=true){
    const context=await browser.newContext({viewport:{width:1100,height:800}});
    await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?route.continue():route.abort();});
    const p=await context.newPage();p.permits=[];p.on('response',async r=>{if(r.url().endsWith('/permit')&&r.ok()){try{p.permits.push(await r.json());}catch{}}});p.on('pageerror',e=>errors.push(e.message));
    p.on('websocket',ws=>ws.on('framesent',({payload})=>{
      if(typeof payload==='string'&&payload.startsWith('40{')){
        const fields=Object.keys(JSON.parse(payload.slice(2))).sort();
        if(JSON.stringify(fields)!==JSON.stringify(['board','token','workspace']))errors.push('Unexpected room handshake fields');
      }
    }));
    await p.addInitScript(config=>{window.__BOARD_TEST_CONFIG=config;},{url:room.url,session:{apiBase:api,accessToken,role,lessonId}});
    await p.goto('http://127.0.0.1:8768');
    await p.waitForFunction(text=>document.querySelector('#status')?.textContent===text,allowed?'Сохранено':'Нет доступа к занятию');return p;
  }
  const count=(p,n)=>p.waitForFunction(n=>window.__BOARD_EDITOR.getSceneElements().length===n,n,{timeout:15000});
  const active=p=>p.evaluate(()=>window.__BOARD_EDITOR.getSceneElements().map(e=>({id:e.id,x:e.x,y:e.y,type:e.type})).sort((a,b)=>a.id.localeCompare(b.id)));
  const saved=p=>p.waitForFunction(()=>document.querySelector('#status')?.textContent==='Сохранено');
  async function draw(p,x,y){await p.getByTitle(/Rectangle/).first().click();await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+95,y+70,{steps:5});await p.mouse.up();}
  const permitPath=(role,id=lesson.id)=>`${role}/board-prototype/lessons/${id}/permit`;
  try {
    const groupPermit=await call(permitPath('teacher'),north.token,{});
    const soloPermit=await call(permitPath('teacher',solo.id),north.token,{});
    const [southLesson]=await call('teacher/lessons',south.token);
    const southPermit=await call(permitPath('teacher',southLesson.id),south.token,{});
    assert.ok(groupPermit.sceneKey!==soloPermit.sceneKey,'Different lessons require distinct keys');
    assert.ok(groupPermit.sceneKey!==southPermit.sceneKey,'Different workspaces require distinct keys');
    assert.ok(!JSON.parse(Buffer.from(groupPermit.token.split('.')[0],'base64url')).sceneKey,'No scene key in room permit');
    const [teacher,a,b]=await Promise.all([page(north.token,'teacher'),page(learners[0].accessToken,'student'),page(learners[1].accessToken,'student')]);
    await Promise.all([draw(teacher,300,220),draw(a,420,300),draw(b,650,420)]);
    for(const p of [teacher,a,b]){await count(p,3);await saved(p);}
    const scope={workspace:groupPermit.workspace,board:groupPermit.board};
    const input=teacher.getByTestId('board-file');
    await input.setInputFiles({name:'picture.png',mimeType:'image/png',buffer:png});
    for(const p of [teacher,a,b]){await count(p,4);await saved(p);}
    await input.setInputFiles({name:'lesson.pdf',mimeType:'application/pdf',buffer:pdf});
    for(const p of [teacher,a,b]){await p.getByRole('button',{name:'lesson.pdf',exact:true}).waitFor();await saved(p);}
    const download=teacher.waitForEvent('download');await teacher.getByRole('button',{name:'lesson.pdf',exact:true}).click();
    const stream=await(await download).createReadStream(),parts=[];for await(const part of stream)parts.push(part);
    assert.ok(Buffer.concat(parts).equals(pdf),'PDF bytes differ');
    // A failed file write must neither advance the scene revision nor claim saved.
    const beforeFailure=await journal.replay(scope),originalPut=journal.putFile;
    let outage=true,failures=0;journal.putFile=async(s,f)=>{if(outage){failures++;throw new Error('synthetic file-store outage');}return originalPut(s,f);};
    await input.setInputFiles({name:'retry.jpg',mimeType:'image/jpeg',buffer:jpeg});
    await count(teacher,5);
    for(let i=0;i<100&&!failures;i++)await new Promise(r=>setTimeout(r,50));
    assert.ok(failures>0,'Injected file-store failure must be reached');
    await teacher.waitForFunction(()=>document.querySelector('#status')?.textContent.startsWith('Не сохранено'));
    assert.equal((await active(b)).length,4);assert.deepEqual(await journal.replay(scope),beforeFailure);
    outage=false;journal.putFile=originalPut;
    for(const p of [teacher,a,b]){await count(p,5);await saved(p);}
    // Removing an image must retain its bytes for undo and previous revisions.
    await teacher.getByTitle(/Selection/).first().click();await teacher.mouse.click(320,480);
    await teacher.waitForFunction(()=>{const x=window.__BOARD_EDITOR,e=x.getSceneElements().find(e=>e.type==='image'&&e.x===280);return e&&x.getAppState().selectedElementIds[e.id];});
    await teacher.keyboard.press('Backspace');for(const p of [teacher,a,b])await count(p,4);
    await teacher.getByRole('button',{name:'Undo',exact:true}).click();for(const p of [teacher,a,b]){await count(p,5);await saved(p);}
    // Dedicated runner uses real 12-second API permits, no forged credentials.
    await until(()=>[teacher,a,b].every(p=>p.permits.length>=2),'Actual-session permit renewal');
    await until(()=>Date.now()>=groupPermit.expiresAt*1000,'Original permit expiry');
    await call('board-prototype/access',null,{token:groupPermit.token},404);
    for(const p of [teacher,a,b]){
      assert.ok(p.permits.length>=2);assert.equal(p.permits.at(-1).sceneKey,groupPermit.sceneKey);
      assert.notEqual(p.permits[0].token,p.permits.at(-1).token);await saved(p);
    }
    console.log('PASS: expired original API permit denied; same browsers renew actual sessions with stable keys.');

    // Commit succeeds but no success acknowledgement reaches this browser.
    const beforeLost=await journal.replay(scope),originalAppend=journal.append,attempts=[];
    journal.append=async(s,f)=>{if(s.workspace===scope.workspace&&s.board===scope.board&&f.user===teacherId)attempts.push({id:f.messageId,iv:Buffer.from(f.iv),ciphertext:Buffer.from(f.ciphertext),fileIds:f.fileIds});return originalAppend(s,f);};
    dropAcks=true;await draw(teacher,800,200);
    await until(()=>dropped>0,'Durable append with lost ack');
    await teacher.waitForFunction(()=>document.querySelector('#status')?.textContent!=='Сохранено');
    assert.equal((await journal.replay(scope)).length,beforeLost.length+1);
    dropAcks=false;
    for(const p of [teacher,a,b]){await count(p,6);await saved(p);}
    const retries=attempts.filter(x=>x.id===attempts[0].id);
    assert.ok(retries.length>=2,'Lost acknowledgement must cause retry');
    for(const attempt of retries)assert.deepEqual(attempt,retries[0],'Retry changed immutable frame bytes/ID');
    assert.equal((await journal.replay(scope)).length,beforeLost.length+new Set(attempts.map(x=>x.id)).size,'Retry duplicated durable frame');
    journal.append=originalAppend;
    console.log('PASS: lost commit acknowledgement reconnects and retries exact frame without duplicate revision.');

    // Stop actual disposable API: introspection and renewal fail. Keep editor open.
    const beforeOffline=await journal.replay(scope);
    execFileSync('docker',['stop','--time','2',container],{stdio:'pipe'});apiStopped=true;
    await teacher.waitForFunction(()=>document.querySelector('#status')?.textContent!=='Сохранено');
    await input.setInputFiles({name:'offline.png',mimeType:'image/png',buffer:png});await count(teacher,7);
    await until(()=>Date.now()>Math.max(...teacher.permits.map(p=>p.expiresAt))*1000,'Permit expires while API offline');
    assert.deepEqual(await journal.replay(scope),beforeOffline);assert.equal((await active(b)).length,6);
    assert.notEqual(await teacher.locator('#status').textContent(),'Сохранено');
    execFileSync('docker',['start',container],{stdio:'pipe'});apiStopped=false;await apiReady();
    for(const p of [teacher,a,b]){await count(p,7);await saved(p);}
    console.log('PASS: actual API stop/expired permits, pending PNG/scene retained, restart and automatic recovery without page reload.');
    const expected=await active(teacher);assert.deepEqual(await active(a),expected);assert.deepEqual(await active(b),expected);
    const expectedFiles={imageHashes:[createHash('sha256').update(png).digest('hex'),createHash('sha256').update(jpeg).digest('hex'),createHash('sha256').update(png).digest('hex')],pdfHash:createHash('sha256').update(pdf).digest('hex'),pdfName:'lesson.pdf'};

    await page(south.token,'teacher',lesson.id,false);
    await page(learners[1].accessToken,'student',solo.id,false);
    const oldStudent=await call(permitPath('student'),learners[0].accessToken,{});
    await call('teacher/students/'+north.students[0].membershipId+'/archive',north.token,{});
    await call('board-prototype/access',null,{token:oldStudent.token},404);
    await a.waitForFunction(()=>document.querySelector('#status')?.textContent!=='Сохранено');
    await a.getByRole('button',{name:'lesson.pdf',exact:true}).click();await a.getByRole('alert').filter({hasText:'Нет доступа к файлу'}).waitFor();
    const prior=await journal.replay(scope);await draw(a,800,500);
    // A fresh authorized read establishes a barrier after the attempted unauthorized edit.
    const proof=await page(learners[1].accessToken,'student');await count(proof,expected.length);assert.deepEqual(await active(proof),expected);
    assert.deepEqual(await journal.replay(scope),prior);
    const oldTeacher=await call(permitPath('teacher'),north.token,{});
    await call('teacher-sessions/logout',north.token,{},204);
    await call('board-prototype/access',null,{token:oldTeacher.token},404);
    await teacher.waitForFunction(()=>document.querySelector('#status')?.textContent!=='Сохранено');
    await call(permitPath('teacher'),north.token,{},403);
    assert.deepEqual(errors,[]);
    await stop();
    // Existing disposable compose project only, never a production container name.
    execFileSync('docker',['restart',container],{stdio:'pipe'});
    let ready=false;for(let i=0;i<45;i++){try{if((await fetch(api+'/health/ready',{signal:AbortSignal.timeout(2000)})).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert.ok(ready);
    await call('board-prototype/access',null,{token:oldTeacher.token},404);
    recoveryDir=await mkdtemp(join(tmpdir(),'tas-board-recovery-'));
    const fixture=join(recoveryDir,'fixture.json');
    await writeFile(fixture,JSON.stringify({api,lessonId:lesson.id,workspace:north.workspace,code:north.students[1].inviteCode,revokedCode:north.students[0].inviteCode,expected,files:expectedFiles}),{mode:0o600,flag:'wx'});
    const result=execFileSync(process.execPath,[new URL('./api-browser-recovery.mjs',import.meta.url).pathname,fixture],{encoding:'utf8',timeout:60000});
    assert.ok(result.includes('PASS: fresh harness process'),'Recovery worker did not finish');
    console.log(result.trim());
    console.log('PASS: real .NET sessions, authorized scope-separated scene keys, connected revocation, API restart and durable PNG/PDF, file outage/no false save, image undo and full harness-process/browser/room/pool recovery. No production data.');
  }finally{if(apiStopped)execFileSync('docker',['start',container],{stdio:'pipe'});await stop();if(recoveryDir)await rm(recoveryDir,{recursive:true,force:true});process.chdir(cwd);}
}
