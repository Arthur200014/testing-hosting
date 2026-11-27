import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const source=await readFile(new URL('./drawing-transport.js',import.meta.url));
const api=await import('data:text/javascript;base64,'+source.toString('base64'));
async function regressionTests({createLiveInkStream,createInkPlayback,smoothInkPath},assert) {
  let time=0,n=0;const writes=[],callbacks={},timers=new Map(),changes=[],storage=new Map();
  const transport={newKey:()=>`s${++n}`,update:(path,patch)=>new Promise((resolve,reject)=>writes.push({path,patch,resolve,reject})),subscribeChildAdded:(p,f)=>{callbacks.add=f;return()=>{};},subscribeChildChanged:(p,f)=>{callbacks.change=f;return()=>{};},subscribeChildRemoved:(p,f)=>{callbacks.remove=f;return()=>{};}};
  const opts={transport,scope:'lesson1',now:()=>time,schedule:(fn,ms)=>{const id=Symbol();timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id),onChange:(r,x)=>changes.push([r,x]),storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},storageKey:'local'};
  const advance=ms=>{time+=ms;for(const [id,t] of [...timers])if(t.at<=time){timers.delete(id);t.fn();}};
  const settle=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
  const stream=createLiveInkStream(opts);
  const id=stream.startStroke('page-1',{author:'teacher'},[0,0]);
  stream.append(id,[[1,1],[2,2]]);advance(32);stream.append(id,[[3,3]]);advance(32);
  assert(writes.length===3,'packets do not wait for previous acknowledgments');
  assert(Object.keys(writes[1].patch).filter(k=>k.startsWith('points/')).join(',')==='points/1,points/2','delta only');
  assert(Object.keys(writes[2].patch).filter(k=>k.startsWith('points/')).join(',')==='points/3','next delta only');
  stream.finish(id);
  assert(writes.length===4&&writes[3].patch.done,'finish is immediate');
  const full=stream.getRecords()[0], snap=r=>({key:r.id,val:()=>r});
  callbacks.change(snap({...full,rev:1,count:1,points:[[0,0]],done:false}));
  assert(stream.getRecords()[0].points.length===4,'stale snapshot cannot shrink local stroke');
  const remote={...full,id:'remote',author:'student',rev:1,count:1,points:[[4,4]],done:false};
  callbacks.add(snap(remote));callbacks.change(snap({...remote,rev:2,count:2,points:[[4,4],[5,5]]}));
  assert(stream.getRecords().find(r=>r.id==='remote').points.length===2,'remote append');
  stream.erase('remote');callbacks.change(snap({...remote,rev:99,count:2,points:[[4,4],[5,5]],done:true}));
  assert(!stream.getRecords().some(r=>r.id==='remote'),'tombstone wins over late writes');
  callbacks.change(snap({...remote,id:'foreign',scope:'other'}));
  assert(!stream.getRecords().some(r=>r.id==='foreign'),'session isolation');
  writes[1].reject(Error('network'));for(const w of [writes[0],writes[2],writes[3],writes[4]])w.resolve();await settle();advance(250);
  assert(writes.length===6&&Object.keys(writes[5].patch).filter(k=>k.startsWith('points/')).length===4,'repair sends complete latest points after failure');
  stream.dispose();const restored=createLiveInkStream(opts);
  assert(restored.getRecords().some(r=>r.id===id&&r.done&&r.points.length===4),'unconfirmed stroke restores');
  restored.dispose();
  // A fresh stroke with fast ACKs must also keep the append cursor.
  const fast=createLiveInkStream({...opts,storage:null});const fastId=fast.startStroke('page-2',{author:'teacher'},[0,0]);
  writes.at(-1).resolve();await settle();const before=writes.length;
  fast.append(fastId,[[1,1]]);advance(32);
  assert(writes.length===before+1&&Object.keys(writes.at(-1).patch).filter(k=>k.startsWith('points/')).join(',')==='points/1','fast ACK preserves delta cursor');
  fast.finish(fastId);fast.dispose();
  const play=createInkPlayback(),r={id:'p',points:[[0,0]],done:false};play.push(r,0);const next={...r,points:[[0,0],[10,10],[20,0]]};play.push(next,32);
  const mid=play.sample(next,48);assert(mid.length>=2&&mid.at(-1)[0]>0&&mid.at(-1)[0]<20,'remote intermediate animation');
  assert(play.sample(next,250).at(-1)[0]===20,'remote ends at exact target');
  assert(smoothInkPath(next.points).includes(' Q'),'quadratic path');
  assert(changes.length>0,'change callbacks');
}
test('live ink: delta packets, latency, tombstones, restoration, playback',async()=>regressionTests(api,assert.ok));
test('legacy drawing API remains intact',()=>{const t={set:(p,v)=>[p,v]};const a=api.createDrawingTransport({transport:t,path:'legacy',encodeStroke:v=>({wrapped:v})});assert.deepEqual(a.set('a',1),['legacy/a',{wrapped:1}]);});

test('solo ink stores surfaces and recovers an interrupted local stroke without transport',()=>{
 let seq=0;const data=new Map(),opts={scope:'app',storage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},storageKey:'local',newId:()=>String(++seq),schedule:()=>1,cancel:()=>{}};
 const local=api.createDrawingTransport({...opts,mode:'solo'});const one=local.startStroke('p1',{author:'solo'},[1,2]);local.append(one,[[3,4]]);local.finish(one);local.startStroke('p2',{author:'solo'},[4,5]);local.flush();local.dispose();const restored=api.createDrawingTransport({...opts,mode:'solo'});assert.equal(restored.getRecords('p1')[0].points.length,2);assert.equal(restored.getRecords('p2')[0].done,true);restored.erase(one);assert.equal(restored.getRecords('p1').length,0);assert.equal(restored.getRecords('p2').length,1);restored.dispose();assert.equal(api.createDrawingTransport({...opts,mode:'solo',scope:'other'}).getRecords().length,0);
});
