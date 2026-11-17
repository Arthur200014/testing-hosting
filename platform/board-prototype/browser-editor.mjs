import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { openJournal } from './journal.mjs';
import { openPostgresJournal } from './postgres.mjs';
import { startTestTransport } from './transport.mjs';
import { issuePermit } from './access.mjs';
const pg = !!process.env.BOARD_TEST_DATABASE_URL;
const dir = await mkdtemp(join(tmpdir(),'tas-editor-'));
const open = () => pg ? openPostgresJournal(process.env.BOARD_TEST_DATABASE_URL) : openJournal(dir);
let journal = await open(), room = await startTestTransport({key:Buffer.alloc(32,17),journal});
const site = await createServer({server:{host:'127.0.0.1',port:0}});
await site.listen();
const origin = `http://127.0.0.1:${site.httpServer.address().port}`;
const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
const scope = {workspace:'synthetic-'+randomUUID(),board:'lesson-1'}, sceneKey = randomBytes(32).toString('base64');
const errors = [];
async function page(user, role='editor', expectedScope=scope) {
  const context = await browser.newContext({viewport:{width:1100,height:800}});
  // Fail any accidental vendor/CDN dependency; this entire scenario is loopback only.
  await context.route('**/*',route => {
    const u = new URL(route.request().url());
    return ['127.0.0.1','localhost'].includes(u.hostname) || ['data:','blob:'].includes(u.protocol) ? route.continue() : route.abort();
  });
  const p = await context.newPage();
  p.on('pageerror',e=>errors.push(e.message));
  const permit = {...expectedScope,token:issuePermit(Buffer.alloc(32,17),{...expectedScope,user,role,exp:Math.floor(Date.now()/1000)+120})};
  await p.addInitScript(config=>{window.__BOARD_TEST_CONFIG=config;},{url:room.url,permit,sceneKey});
  await p.goto(origin);
  await p.waitForFunction(()=>window.__BOARD_EDITOR && document.querySelector('#status')?.textContent==='Сохранено',{timeout:30000});
  return p;
}
async function draw(p,x,y) {
  await p.getByTitle(/Rectangle/).first().click(); await p.mouse.move(x,y); await p.mouse.down();
  await p.mouse.move(x+95,y+70,{steps:5}); await p.mouse.up();
}
const active = p => p.evaluate(()=>window.__BOARD_EDITOR.getSceneElements().map(e=>({id:e.id,type:e.type,x:e.x,y:e.y})).sort((a,b)=>a.id.localeCompare(b.id)));
async function count(p,n) { await p.waitForFunction(n=>window.__BOARD_EDITOR.getSceneElements().length===n,n,{timeout:15000}); }
try {
  const [teacher,a,b] = await Promise.all([page('teacher'),page('pupil-a'),page('pupil-b')]);
  await Promise.all([draw(teacher,300,220),draw(a,420,300),draw(b,650,420)]);
  for(const p of [teacher,a,b]) await count(p,3);
  assert.deepEqual(await active(a),await active(teacher)); assert.deepEqual(await active(b),await active(teacher));
  await teacher.getByTitle(/Selection/).first().click(); await teacher.mouse.click(300,250); await teacher.keyboard.press('Backspace');
  for(const p of [teacher,a,b]) await count(p,2);
  await teacher.getByTitle(/Undo/).first().click();
  for(const p of [teacher,a,b]) await count(p,3);
  const expected = await active(teacher);
  // Wait for durable ack and catch-up before stopping both the transport and storage pool.
  for(const p of [teacher,a,b]) await p.waitForFunction(()=>document.querySelector('#status')?.textContent==='Сохранено');
  await browser.contexts().reduce(async(prev,c)=>{await prev;await c.close();},Promise.resolve());
  await room.close(); await journal.close(); journal=await open();
  room=await startTestTransport({key:Buffer.alloc(32,17),journal});
  const fresh=await page('fresh-pupil'); await count(fresh,3);
  assert.deepEqual(await active(fresh),expected);
  const viewer=await page('viewer','viewer'); await count(viewer,3);
  await draw(viewer,800,500);
  await viewer.waitForFunction(()=>document.querySelector('#status')?.textContent.startsWith('Не сохранено'));
  const foreign=await page('foreign','editor',{...scope,workspace:'foreign-'+randomUUID()});
  assert.equal((await active(foreign)).length,0);
  const proof=await page('proof'); await count(proof,3); assert.deepEqual(await active(proof),expected);
  assert.deepEqual(errors,[]);
  console.log(`PASS: real Excalidraw, 3 distinct synthetic permit browsers, parallel draw/delete/undo, fresh browser after room/storage restart, viewer/foreign isolation; ${pg?'PostgreSQL':'FILESYSTEM TEST ADAPTER'}. .NET login/permits and P3/P4 acceptance NOT_RUN.`);
} finally {
  await browser.close(); await site.close(); await room.close(); await journal.close(); await rm(dir,{recursive:true,force:true});
}
