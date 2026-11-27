// Browser acceptance against an isolated Realtime Database emulator and synthetic pupils.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const guidePath='/EGA/17/formula.html';
const root='sharedInteractives/ege-task17-planimetry-kitchen-v1/currentSession';
const emulator='http://127.0.0.1:9000';
const database=path=>emulator+'/'+root+(path?'/'+path:'')+'.json?ns=demo-guide17';
const source=await readFile('.'+guidePath,'utf8');
const teacherCode='isolated-teacher';
const guide=source.replace(/(j-code'\)\.value\.trim\(\)!==)'[^']+'/, "$1'"+teacherCode+"'");
assert.notEqual(guide,source);
const {outputFiles:[sdk]}=await build({stdin:{contents:`
  export {initializeApp} from "firebase/app";
  export * from "firebase/database";
  import {getDatabase as db,connectDatabaseEmulator,goOffline,goOnline} from "firebase/database";
  export function getDatabase(app) {
    const instance=db(app,${JSON.stringify(emulator+'?ns=demo-guide17')});
    connectDatabaseEmulator(instance,'127.0.0.1',9000);
    window.setTestConnection=connected=>connected?goOnline(instance):goOffline(instance);
    return instance;
  }`,resolveDir:process.cwd()},format:'esm',bundle:true,write:false});
const modules=new Map([
  ['firebase-app','export {initializeApp} from "./firebase-database.js";'],
  ['firebase-database',sdk.text]
]);
const server=createServer(async(req,res)=>{
  try{
    if(req.url===guidePath){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(guide);return;}
    if(req.url.startsWith('/shared/interactive/v1/')&&/\/[a-z-]+\.js$/.test(req.url)){
      res.setHeader('Content-Type','text/javascript');res.end(await readFile('.'+req.url));return;
    }
    res.writeHead(404).end();
  }catch{res.writeHead(500).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch();
const errors=[],posts=[],pages=[];
const pathSelector='#joint-ink path[data-ink-id]';
const url='http://127.0.0.1:'+server.address().port+guidePath;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function page(name,{oldSolo=false}={}){
  const ctx=await browser.newContext({viewport:{width:1360,height:900},acceptDownloads:true});
  await ctx.route('https://www.gstatic.com/firebasejs/12.18.0/firebase-*.js',route=>{
    const id=new URL(route.request().url()).pathname.split('/').at(-1).replace('.js','');
    return route.fulfill({contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:modules.get(id)});
  });
  await ctx.route('https://script.google.com/**',route=>{
    if(route.request().method()==='POST'){
      posts.push(route.request().postDataJSON());return route.fulfill({json:{ok:true},headers:{'access-control-allow-origin':'*'}});
    }
    const callback=new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({contentType:'text/javascript',body:callback+'('+JSON.stringify({studentId:name,studentName:name,ok:true})+')'});
  });
  if(oldSolo)await ctx.addInitScript(()=>{
    if(sessionStorage.getItem('seeded'))return;
    sessionStorage.setItem('seeded','1');
    localStorage.setItem('ege-task17-planimetry-kitchen-v1:soloBoard-v4',JSON.stringify({
      p1:{old:{by:'solo',at:1,color:'#963f4f',width:4,pts:[{x:110,y:110},{x:200,y:180}]}}
    }));
  });
  const p=await ctx.newPage();pages.push(p);
  p.on('pageerror',error=>errors.push(String(error)));
  await p.goto(url);
  return p;
}
const click=(p,id)=>p.locator('#'+id).click({timeout:7000});
const tool=(p,mode)=>p.locator('#joint-tools [data-jtool='+mode+']').click({timeout:7000});
async function signIn(p,role,code){
  await click(p,'shared-launch');await click(p,'j-'+role);
  await p.locator('#j-code').evaluate((input,value)=>{input.value=value;},code);
  await click(p,role==='teacher'?'j-enter':'j-join');
}
const count=(p,n,selector=pathSelector)=>p.waitForFunction(([s,size])=>document.querySelectorAll(s).length===size,[selector,n],{timeout:8000});
async function coords(p,x,y){const r=await p.locator('#joint-ink').boundingBox();return [r.x+x*r.width,r.y+y*r.height];}
async function draw(p,y,{hold=false}={}){
  await tool(p,'pen');
  await p.mouse.move(...await coords(p,.2,y));await p.mouse.down();
  for(let i=1;i<=14;i++){
    await p.mouse.move(...await coords(p,.2+i*.022,y+i*.007));
    if(hold)await sleep(22);
  }
  if(!hold)await p.mouse.up();
}
async function download(p,id){
  const [file]=await Promise.all([p.waitForEvent('download',{timeout:55000}),click(p,id)]);
  const bytes=await readFile(await file.path());
  assert.match(bytes.toString('latin1',0,8),/^%PDF-1\./);
  return Number(bytes.toString('latin1').match(/\/Type \/Pages \/Count (\d+)/)[1]);
}
async function readDb(path){const res=await fetch(database(path));assert.ok(res.ok);return res.json();}
try{
  const t=await page('Teacher',{oldSolo:true}),a=await page('Pupil A'),b=await page('Pupil B');
  // Annotations from the old guide and new handwriting survive refreshing.
  await count(t,1);
  await draw(t,.35);await count(t,2);
  await t.reload();await count(t,2);
  assert.equal(await download(t,'export-pdf'),1);
  await signIn(t,'teacher',teacherCode);await click(t,'j-new');await click(t,'j-two');
  await t.locator('#j-start').waitFor({timeout:8000});
  await Promise.all([signIn(a,'student','synthetic-a'),signIn(b,'student','synthetic-b')]);
  await click(t,'j-start');
  await Promise.all([t,a,b].map(p=>p.locator('#joint-theory-hud.active').waitFor({timeout:8000})));
  assert.equal((await readDb('state')).inkProtocol,'live-v2');
  await draw(t,.24,{hold:true});
  await Promise.all([count(a,1),count(b,1)]);
  const before=await a.locator(pathSelector).getAttribute('d');
  assert.ok(before.includes('Q'),'remote curve before pointer-up');
  await t.mouse.move(...await coords(t,.7,.38));
  await a.waitForFunction(old=>document.querySelector('#joint-ink path[data-ink-id]')?.getAttribute('d')!==old,before);
  await t.mouse.up();
  await Promise.all([draw(a,.44),draw(b,.6)]);
  await Promise.all([t,a,b].map(p=>count(p,3)));
  await a.keyboard.press('Control+z');
  await Promise.all([t,a,b].map(p=>count(p,2)));
  await tool(t,'eraser');await t.mouse.click(...await coords(t,.2,.6));
  await Promise.all([t,a,b].map(p=>count(p,1)));
  await tool(t,'cursor');
  await click(t,'next');
  await Promise.all([t,a,b].map(p=>count(p,0)));
  await draw(b,.42);await count(t,1);
  await click(t,'prev');await count(t,1);
  await click(t,'next');await count(t,1);
  assert.equal(await a.locator('.teacher-export-all:visible').count(),0);
  assert.equal(await download(a,'joint-export-theory'),2);
  const sheets=await t.locator('.slide').count();
  assert.equal(await download(t,'export-all-hud'),sheets);
  assert.equal((await readDb('state')).page,2,'export does not switch the shared page');

  // Pending points survive a disconnected student reload and are sent on reconnect.
  await b.evaluate(()=>window.setTestConnection(false));
  await draw(b,.66);await count(b,2);await count(t,1);
  await b.reload();await signIn(b,'student','synthetic-b');
  await Promise.all([t,a,b].map(p=>count(p,2)));
  await click(t,'joint-back-kitchen');await click(t,'j-recipe-start');
  await t.locator('#fq.open').waitFor({timeout:8000});
  await draw(t,.43);await count(a,1);
  const kitchenRecords=Object.values(await readDb('ink-v2/'+(await readDb('state')).sessionId));
  assert.ok(kitchenRecords.some(r=>r.surface.startsWith('k_')&&r.meta?.options?.length===4),'kitchen annotation saves card context');
  const activePupil=await a.locator('#k-options .k-option').first().isEnabled()?a:b;
  await tool(activePupil,'cursor');
  await activePupil.locator('#k-options .k-option').first().click({timeout:7000});
  t.on('dialog',d=>d.accept());
  await tool(t,'cursor');
  await click(t,'j-finish');
  for(let i=0;i<30&&!posts.length;i++)await sleep(100);
  assert.ok(posts.some(p=>p.action==='submitTest'&&p.taskNumber===17),'synthetic result reaches the GAS adapter');

  // Restore a pre-update room, with a stroke in the original namespace.
  const legacy=await readDb('');
  const sid=legacy.state.sessionId;
  delete legacy.state.inkProtocol;
  Object.assign(legacy.state,{view:'theory',page:1});
  legacy.ink={[sid]:{previous:{id:'previous',key:'p1',session:sid,rev:1,
    stroke:{by:'teacher',at:1,color:'#963f4f',width:4,pts:[{x:130,y:150},{x:230,y:250}]}}}};
  const legacyPage=await page('Legacy restore');
  const seed=await fetch(database(''),{method:'PUT',body:JSON.stringify(legacy)});
  assert.ok(seed.ok);
  await signIn(legacyPage,'teacher',teacherCode);await click(legacyPage,'j-restore');
  await count(legacyPage,1,'#joint-ink path[data-stroke]');
  await draw(legacyPage,.5);
  await count(legacyPage,2,'#joint-ink path[data-stroke]');
  assert.equal(Object.keys(await readDb('ink/'+sid)).length,2);
  assert.deepEqual(errors,[]);
  console.log('PASS: guide 17, three Chromium contexts + Firebase emulator; live playback, erase/undo, worksheet navigation, reconnect/reload, legacy room, PDF, and result outbox.');
}catch(error){console.error('Browser errors:',errors);
  for(const p of pages)console.error(await p.locator('#joint-dialog h2,#j-status').allTextContents());
  throw error;}finally{
  await browser.close();server.close();
}
