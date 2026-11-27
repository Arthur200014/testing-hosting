// Isolated three-client test: no production Firebase, GAS, or student data.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const moduleSource=await readFile(new URL('./drawing-transport.js',import.meta.url),'utf8');
const html=`<!doctype html><html><body style="margin:0"><svg id="ink" style="display:block;width:900px;height:600px;background:#fff;border:1px solid #ccc"></svg><script type="module">
import {createDrawingTransport,createSvgInkLayer,createInkPointerController} from '/drawing.js';
const svg=document.querySelector('#ink');let surface='p1',counter=0;
const layer=createSvgInkLayer({svg,surface});
const callbacks={add:[],change:[],remove:[]};
const subscribe=(type,cb)=>{callbacks[type].push(cb);return()=>{const i=callbacks[type].indexOf(cb);if(i>=0)callbacks[type].splice(i,1);}};
const transport={newKey:()=>window.clientId+'-'+(++counter),update:(path,patch)=>window.wireSend(path,patch),subscribeChildAdded:(_,cb)=>subscribe('add',cb),subscribeChildChanged:(_,cb)=>subscribe('change',cb),subscribeChildRemoved:(_,cb)=>subscribe('remove',cb)};
window.recv=(type,id,record)=>callbacks[type].forEach(cb=>cb({key:id,val:()=>record}));
const stream=createDrawingTransport({transport,mode:'live-v2',scope:'synthetic',onChange:(r,o)=>layer.apply(r,o),storage:localStorage,storageKey:'synthetic-'+window.clientId});
const pointer=createInkPointerController({svg,stream,getSurface:()=>surface,getAuthor:()=>window.clientId,initialTool:'pen'});
window.pageSurface=next=>{pointer.flush();surface=next;layer.setSurface(next);};
window.ink=stream;window.controller=pointer;window.ready=true;
</script></body></html>`;
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/drawing.js'?'text/javascript':'text/html');res.end(req.url==='/drawing.js'?moduleSource:html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});const pages=[],records=new Map(),writes=[],errs=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const copy=x=>JSON.parse(JSON.stringify(x));
function applyPatch(record,patch){for(const [key,v] of Object.entries(patch)){const parts=key.split('/');let dest=record;for(const part of parts.slice(0,-1)){dest[part]??={};dest=dest[part];}dest[parts.at(-1)]=copy(v);}return record;}
try{
  for(const id of ['teacher','student1','student2']){
    const ctx=await browser.newContext({viewport:{width:1000,height:700}});
    const page=await ctx.newPage();pages.push(page);page.on('pageerror',e=>errs.push(String(e)));
    await page.addInitScript(x=>window.clientId=x,id);
    await page.exposeFunction('wireSend',async(path,patch)=>{
      assert.ok(path.startsWith('ink-v2/synthetic/'));const id=path.split('/').at(-1),type=records.has(id)?'change':'add';
      const record=applyPatch(records.get(id)||{},patch);records.set(id,record);const snapshot=copy(record);writes.push({id,patch:copy(patch),time:Date.now()});
      await sleep(85);await Promise.all(pages.map(p=>p.evaluate(({type,id,snapshot})=>window.recv?.(type,id,snapshot),{type,id,snapshot})));
      await sleep(220); // Delay ACK long after next packets have been sent.
    });
    await page.goto(url);await page.waitForFunction(()=>window.ready);
  }
  const [teacher,a,b]=pages;
  await teacher.mouse.move(80,80);await teacher.mouse.down();
  for(let i=1;i<=28;i++){await teacher.mouse.move(80+i*15,80+Math.sin(i/4)*35+i*7);await sleep(18);}
  const remoteBeforeUp=await a.locator('path[data-ink-id]').count();assert.equal(remoteBeforeUp,1,'remote stroke visible before pen-up');
  assert.ok(writes.filter(x=>x.id.startsWith('teacher')).length>=4,'multiple writes before slow ACK');
  const shape=await a.locator('path[data-ink-id]').getAttribute('d');assert.ok(shape.includes('Q'),'remote curve, not just line');
  await teacher.mouse.up();await sleep(600);
  const all=await Promise.all(pages.map(p=>p.evaluate(()=>window.ink.getRecords('p1')[0].points)));
  assert.deepEqual(all[0],all[1]);assert.deepEqual(all[1],all[2]);
  assert.ok(writes.slice(1).some(w=>Object.keys(w.patch).filter(k=>k.startsWith('points/')).length<all[0].length),'incremental points');
  const paths=await Promise.all(pages.map(p=>p.locator('path[data-ink-id]').getAttribute('d')));assert.equal(paths[0],paths[1]);assert.equal(paths[1],paths[2]);
  await Promise.all([a,b].map((p,i)=>p.mouse.move(100,350+i*70)));await Promise.all([a,b].map(p=>p.mouse.down()));
  await Promise.all([a,b].map((p,i)=>p.mouse.move(300,400+i*70,{steps:18})));await Promise.all([a,b].map(p=>p.mouse.up()));await sleep(600);
  assert.equal(await teacher.locator('path[data-ink-id]').count(),3,'simultaneous distinct authors');
  await a.keyboard.press('Control+z');await sleep(600);assert.equal(await teacher.locator('path[data-ink-id]').count(),2,'undo own only');
  await Promise.all(pages.map(p=>p.evaluate(()=>window.pageSurface('p2'))));assert.equal(await teacher.locator('path[data-ink-id]').count(),0);
  await Promise.all(pages.map(p=>p.evaluate(()=>window.pageSurface('p1'))));assert.equal(await teacher.locator('path[data-ink-id]').count(),2,'surface persistence');
  assert.deepEqual(errs,[]);console.log('PASS: three Chromium contexts, 85ms propagation, 220ms ACK delay, remote before pointer-up, concurrent authors, undo, page restore');
}finally{await browser.close();await new Promise(r=>server.close(r));}
