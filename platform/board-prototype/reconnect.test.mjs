// Client protocol regression; actual editor/API acceptance stays in api-browser.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openJournal} from './journal.mjs';
import {issuePermit} from './access.mjs';
import {startTestTransport} from './transport.mjs';
import {connectScene} from './editor/scene-client.mjs';
const until=async check=>{const end=Date.now()+12000;while(!await check()){assert.ok(Date.now()<end,'Client protocol did not settle');await new Promise(r=>setTimeout(r,25));}};
async function fixture(t,{acknowledge,renew}={}){
  const dir=await mkdtemp(join(tmpdir(),'tas-board-reconnect-')),journal=await openJournal(dir);
  const key=randomBytes(32),sceneKey=randomBytes(32).toString('base64'),scope={workspace:'test-'+randomUUID(),board:'lesson'};
  const permit=()=>({...scope,sceneKey,keyVersion:1,expiresAt:Math.floor(Date.now()/1000)+120,
    token:issuePermit(key,{...scope,user:'teacher',role:'editor',exp:Math.floor(Date.now()/1000)+120})});
  const room=await startTestTransport({key,journal,acknowledge});let elements=[],client,text='',calls=0;
  const api={getFiles:()=>({}),getSceneElementsIncludingDeleted:()=>elements,getAppState:()=>({}),
    updateScene:({elements:next})=>{elements=next;client?.changed(next);}};
  const reconcileElements=(local,remote)=>{const map=new Map(local.map(e=>[e.id,e]));for(const e of remote){if(!map.has(e.id)||e.version>=map.get(e.id).version)map.set(e.id,e);}return [...map.values()];};
  client=connectScene({url:room.url,permit:permit(),sceneKey,api,reconcileElements,CaptureUpdateAction:{NEVER:0},
    status:s=>{text=s;},renewPermit:async()=>{calls++;return renew?renew(permit()):permit();}});
  t.after(async()=>{client.close();await room.close();await journal.close();await rm(dir,{recursive:true,force:true});});
  await until(()=>client.ready&&text==='Сохранено');
  return {journal,scope,sceneKey,get status(){return text;},get calls(){return calls;},
    change(version,notify=true){elements=[{id:'local',type:'rectangle',version,versionNonce:version,isDeleted:false}];if(notify)client.changed(elements);}};
}
for(const field of ['workspace','board','sceneKey','keyVersion'])test(`reconnect refuses changed ${field} and retains unsaved edit`,async t=>{
  let disconnect=false;
  const f=await fixture(t,{acknowledge:({event})=>!(disconnect&&event==='replay'),
    renew:p=>({...p,[field]:field==='keyVersion'?2:'foreign'})});
  disconnect=true;await until(()=>f.status.includes('Изменились область или ключ'));
  f.change(1);await until(()=>f.status.includes('Изменились область или ключ'));
  assert.equal(f.calls,1);assert.deepEqual(await f.journal.replay(f.scope),[]);
});
test('revoked renewal fails closed without repeated credential requests',async t=>{
  let disconnect=false;
  const f=await fixture(t,{acknowledge:({event})=>!(disconnect&&event==='replay'),renew:()=>{const e=new Error('Access revoked');e.denied=true;throw e;}});
  disconnect=true;await until(()=>f.status.includes('Access revoked'));
  f.change(1);await until(()=>f.status.includes('Access revoked'));
  assert.equal(f.calls,1);assert.deepEqual(await f.journal.replay(f.scope),[]);
});
test('lost ack plus renewal outage retains exact retry and local mutation before onChange',async t=>{
  let lose=true,failRenew=false,dropped=false;
  const f=await fixture(t,{acknowledge:({event})=>{if(event==='submit'&&lose){dropped=true;failRenew=true;return false;}return true;},
    renew:p=>{if(failRenew)throw new Error('API unavailable');return p;}});
  const original=f.journal.append,attempts=[];
  f.journal.append=async(s,frame)=>{attempts.push(structuredClone(frame));return original(s,frame);};
  f.change(1);await until(()=>dropped);f.change(2,false);await until(()=>f.status.includes('API unavailable'));
  assert.notEqual(f.status,'Сохранено');assert.equal((await f.journal.replay(f.scope)).length,1);
  lose=false;failRenew=false;await until(()=>f.status==='Сохранено');
  const retries=attempts.filter(x=>x.messageId===attempts[0].messageId);assert.ok(retries.length>=2);
  for(const retry of retries)assert.deepEqual(retry,retries[0]);
  const rows=await f.journal.replay(f.scope);assert.equal(rows.length,2);
  const key=await crypto.subtle.importKey('raw',Buffer.from(f.sceneKey,'base64'),'AES-GCM',false,['decrypt']);
  const last=rows.at(-1),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(last.iv,'base64')},key,Buffer.from(last.ciphertext,'base64'));
  assert.equal(JSON.parse(new TextDecoder().decode(plain)).elements[0].version,2);
});
