import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileScene,sceneFingerprint} from './editor/reconcile.mjs';
const element=i=>({id:'shape-'+String(i).padStart(2,'0'),type:'rectangle',version:1,versionNonce:100+i,index:'a0',updated:123,x:i,isDeleted:false});
test('21 competing fractional indices: immutable deterministic replay, no synthesized versions/nonces/timestamps',()=>{
  const frames=Array.from({length:21},(_,i)=>[element(i)]),copy=structuredClone(frames);
  const replicas=Array.from({length:21},()=>[]);
  for(const frame of frames)for(let i=0;i<replicas.length;i++)replicas[i]=reconcileScene(replicas[i],frame);
  for(const replica of replicas){
    assert.equal(sceneFingerprint(replica),sceneFingerprint(replicas[0]));assert.equal(new Set(replica.map(x=>x.index)).size,21);
    assert.ok(replica.every((x,i)=>i===0||replica[i-1].index<x.index));
    for(const x of replica){const original=copy.flat().find(e=>e.id===x.id);assert.equal(x.version,original.version);assert.equal(x.versionNonce,original.versionNonce);assert.equal(x.updated,original.updated);}
  }
  assert.deepEqual(frames,copy);
  const withPending=reconcileScene([element(20)],frames[0]);assert.ok(withPending.some(x=>x.id===element(20).id));
});
test('same-element edits use version/nonce, preserve active local edit, delete and explicit undo',()=>{
  const a=element(1),left={...a,version:2,versionNonce:20,x:0},right={...a,version:2,versionNonce:10,x:2};
  assert.equal(reconcileScene([left],[right])[0].x,2);assert.equal(reconcileScene([right],[left])[0].x,2);
  assert.equal(reconcileScene([left],[right],{resizingElement:left})[0].x,0);
  const deleted={...right,version:3,isDeleted:true};assert.ok(reconcileScene([deleted],[a])[0].isDeleted);
  assert.equal(reconcileScene([deleted],[{...deleted,version:4,isDeleted:false}])[0].isDeleted,false);
});
