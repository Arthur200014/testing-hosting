// Fresh process: no old browser, crypto key, API JWT, room objects or pools survive.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { openPostgresJournal } from './postgres.mjs';
import { startTestTransport } from './transport.mjs';
import { apiAccess } from './api-access.mjs';

assert.equal(process.env.TAS_BOARD_TEST_ONLY,'1');
assert.ok(process.env.TAS_BOARD_SCENE_ROOT_KEY===undefined,'Scene root must not reach the harness');
assert.ok(process.env.JWT_SIGNING_KEY===undefined,'API signing key must not reach the harness');
const file=resolve(process.argv[2]);
assert.equal(dirname(dirname(file)),resolve(tmpdir()));
assert.match(basename(dirname(file)),/^tas-board-recovery-/);
assert.equal((await stat(file)).mode & 0o077,0);
const fixture=JSON.parse(await readFile(file,'utf8'));
assert.deepEqual(Object.keys(fixture).sort(),['api','checkpointBase','code','expected','expectedDeleted','files','lessonId','revokedCode','workspace']);
const api=new URL(fixture.api);assert.equal(api.protocol,'http:');assert.equal(api.hostname,'127.0.0.1');
const key=Buffer.from(process.env.TAS_BOARD_SIGNING_KEY??'','base64');assert.equal(key.length,32);
const journal=await openPostgresJournal(process.env.BOARD_TEST_DATABASE_URL);
const room=await startTestTransport({key,journal,authorize:apiAccess(fixture.api)});
process.chdir(new URL('.',import.meta.url).pathname);
const site=await createServer({server:{host:'127.0.0.1',port:8768,strictPort:true}});await site.listen();
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
  const response=await fetch(api.origin+'/api/v1/student-sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspace:fixture.workspace,code:fixture.code})});
  assert.equal(response.status,200,'Fresh student session required');
  const {accessToken}=await response.json();
  const scopeReply=await fetch(api.origin+'/api/v1/student/board-prototype/lessons/'+fixture.lessonId+'/permit',{method:'POST',headers:{Authorization:'Bearer '+accessToken}});assert.ok(scopeReply.ok);
  const authorized=await scopeReply.json(),stored=await journal.read({workspace:authorized.workspace,board:authorized.board});
  assert.equal(stored.checkpoint?.seq,fixture.checkpointBase);assert.ok(stored.frames.length>0,'Restored checkpoint tail required');
  const context=await browser.newContext({viewport:{width:1100,height:800}});
  await context.route('**/*',r=>{const u=new URL(r.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?r.continue():r.abort();});
  const p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  p.on('websocket',ws=>ws.on('framesent',({payload})=>{
    if(typeof payload==='string'&&payload.startsWith('40{')){
      const fields=Object.keys(JSON.parse(payload.slice(2))).sort();
      if(JSON.stringify(fields)!==JSON.stringify(['board','token','workspace']))errors.push('Unexpected room handshake fields');
    }
  }));
  // No scene key or original bearer token in this fresh-process fixture.
  await p.addInitScript(config=>{window.__BOARD_TEST_CONFIG=config;},{url:room.url,session:{apiBase:fixture.api,accessToken,role:'student',lessonId:fixture.lessonId}});
  await p.goto('http://127.0.0.1:8768');
  await p.waitForFunction(n=>document.querySelector('#status')?.textContent==='Сохранено'&&window.__BOARD_EDITOR.getSceneElements().length===n,fixture.expected.length,{timeout:20000});
  const restored=await p.evaluate(()=>window.__BOARD_EDITOR.getSceneElements().map(e=>({id:e.id,x:e.x,y:e.y,type:e.type})).sort((a,b)=>a.id.localeCompare(b.id)));
  assert.deepEqual(restored,fixture.expected);
  const deleted=await p.evaluate(()=>window.__BOARD_EDITOR.getSceneElementsIncludingDeleted().filter(e=>e.isDeleted).map(e=>({id:e.id,version:e.version})));
  assert.deepEqual(deleted.sort((a,b)=>a.id.localeCompare(b.id)),fixture.expectedDeleted.sort((a,b)=>a.id.localeCompare(b.id)));
  const images=await p.evaluate(async()=>{
    const a=window.__BOARD_EDITOR,files=a.getFiles(),out=[];
    for(const e of a.getSceneElements().filter(e=>e.type==='image')){
      const f=files[e.fileId],raw=Uint8Array.from(atob(f.dataURL.split(',')[1]),x=>x.charCodeAt(0));
      out.push(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),x=>x.toString(16).padStart(2,'0')).join(''));
    }return out.sort();
  });
  assert.deepEqual(images,fixture.files.imageHashes.sort());
  const download=p.waitForEvent('download');await p.getByRole('button',{name:fixture.files.pdfName,exact:true}).click();
  const parts=[],stream=await(await download).createReadStream();for await(const part of stream)parts.push(part);
  assert.equal(createHash('sha256').update(Buffer.concat(parts)).digest('hex'),fixture.files.pdfHash,'Restored PDF differs');
  const revoked=await fetch(api.origin+'/api/v1/student-sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspace:fixture.workspace,code:fixture.revokedCode})});
  assert.ok(!revoked.ok,'Archived pupil cannot obtain a fresh session');
  assert.deepEqual(errors,[]);
  console.log('PASS: fresh harness process and browser obtain an authorized scene key after API/room/pool restart; checkpoint, post-checkpoint tail, deletion tombstones and PNG/PDF bytes restored from separate backup database without an old key/token; room handshake contains permit scope only.');
}finally{await browser.close();await site.close();await room.close();await journal.close();}
