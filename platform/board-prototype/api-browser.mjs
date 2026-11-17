import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
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
  const key=Buffer.from(process.env.TAS_BOARD_SIGNING_KEY??'','base64');assert.equal(key.length,32);
  const connection=process.env.BOARD_TEST_DATABASE_URL;
  const north=accounts.north,south=accounts.south;
  const lesson=beforeLessons.find(x=>x.groupClassId===group.id);assert.ok(lesson);
  const solo=beforeLessons.find(x=>x.individualClassId===north.item.id);assert.ok(solo);
  const learners=await Promise.all(north.students.map(s=>call('student-sessions',null,{workspace:north.workspace,code:s.inviteCode})));
  let journal=await openPostgresJournal(connection),room=await startTestTransport({key,journal,authorize:apiAccess(api)});
  const cwd=process.cwd();process.chdir(new URL('.',import.meta.url).pathname);
  const site=await createServer({server:{host:'127.0.0.1',port:8768,strictPort:true}});await site.listen();
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const sceneKey=randomBytes(32).toString('base64'),errors=[];
  async function page(accessToken,role,lessonId=lesson.id,allowed=true){
    const context=await browser.newContext({viewport:{width:1100,height:800}});
    await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?route.continue():route.abort();});
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.addInitScript(config=>{window.__BOARD_TEST_CONFIG=config;},{url:room.url,sceneKey,session:{apiBase:api,accessToken,role,lessonId}});
    await p.goto('http://127.0.0.1:8768');
    await p.waitForFunction(text=>document.querySelector('#status')?.textContent===text,allowed?'Сохранено':'Нет доступа к занятию');return p;
  }
  const count=(p,n)=>p.waitForFunction(n=>window.__BOARD_EDITOR.getSceneElements().length===n,n,{timeout:15000});
  const active=p=>p.evaluate(()=>window.__BOARD_EDITOR.getSceneElements().map(e=>({id:e.id,x:e.x,y:e.y,type:e.type})).sort((a,b)=>a.id.localeCompare(b.id)));
  const saved=p=>p.waitForFunction(()=>document.querySelector('#status')?.textContent==='Сохранено');
  async function draw(p,x,y){await p.getByTitle(/Rectangle/).first().click();await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+95,y+70,{steps:5});await p.mouse.up();}
  const permitPath=(role,id=lesson.id)=>`${role}/board-prototype/lessons/${id}/permit`;
  try {
    const [teacher,a,b]=await Promise.all([page(north.token,'teacher'),page(learners[0].accessToken,'student'),page(learners[1].accessToken,'student')]);
    await Promise.all([draw(teacher,300,220),draw(a,420,300),draw(b,650,420)]);
    for(const p of [teacher,a,b]){await count(p,3);await saved(p);}
    const expected=await active(teacher);assert.deepEqual(await active(a),expected);assert.deepEqual(await active(b),expected);
    await page(south.token,'teacher',lesson.id,false);
    await page(learners[1].accessToken,'student',solo.id,false);
    const oldStudent=await call(permitPath('student'),learners[0].accessToken,{});
    await call('teacher/students/'+north.students[0].membershipId+'/archive',north.token,{});
    await call('board-prototype/access',null,{token:oldStudent.token},404);
    await a.waitForFunction(()=>document.querySelector('#status')?.textContent!=='Сохранено');
    const scope={workspace:oldStudent.workspace,board:oldStudent.board};
    const prior=await journal.replay(scope);await draw(a,800,500);
    // A fresh authorized read establishes a barrier after the attempted unauthorized edit.
    const proof=await page(learners[1].accessToken,'student');await count(proof,3);assert.deepEqual(await active(proof),expected);
    assert.deepEqual(await journal.replay(scope),prior);
    const oldTeacher=await call(permitPath('teacher'),north.token,{});
    await call('teacher-sessions/logout',north.token,{},204);
    await call('board-prototype/access',null,{token:oldTeacher.token},404);
    await teacher.waitForFunction(()=>document.querySelector('#status')?.textContent!=='Сохранено');
    await call(permitPath('teacher'),north.token,{},403);
    await Promise.all(browser.contexts().map(c=>c.close()));
    await room.close();await journal.close();
    // Existing disposable compose project only, never a production container name.
    const id=execFileSync('docker',['ps','--filter','label=com.docker.compose.project='+project,'--filter','label=com.docker.compose.service=api','--format','{{.ID}}'],{encoding:'utf8'}).trim();
    assert.match(id,/^[a-f0-9]{12,64}$/);execFileSync('docker',['restart',id],{stdio:'pipe'});
    let ready=false;for(let i=0;i<45;i++){try{if((await fetch(api+'/health/ready',{signal:AbortSignal.timeout(2000)})).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert.ok(ready);
    journal=await openPostgresJournal(connection);room=await startTestTransport({key,journal,authorize:apiAccess(api)});
    const fresh=await page(learners[1].accessToken,'student');await count(fresh,3);assert.deepEqual(await active(fresh),expected);
    await page(learners[0].accessToken,'student',lesson.id,false);
    await call('board-prototype/access',null,{token:oldTeacher.token},404);
    assert.deepEqual(errors,[]);
    console.log('PASS: real .NET teacher/student sessions -> browser-issued permits -> Excalidraw/PostgreSQL; foreign/nonparticipant denial; connected membership archive and teacher logout deny reads/writes; API/room/pool restart with fresh-browser replay. No production data.');
  }finally{await browser.close();await site.close();await room.close();await journal.close();process.chdir(cwd);}
}
