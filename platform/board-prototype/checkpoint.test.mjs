import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {io} from 'socket.io-client';
import {openPostgresJournal} from './postgres.mjs';
import {startTestTransport} from './transport.mjs';
import {issuePermit} from './access.mjs';
import {png} from './file-fixtures.mjs';
const connection=process.env.BOARD_TEST_DATABASE_URL;
const scope=()=>({workspace:'test-'+randomUUID(),board:'checkpoint'});
const frame=i=>({messageId:'frame-'+i,user:'teacher',iv:Buffer.alloc(12,i),ciphertext:Buffer.from('encrypted-'+i)});
const snapshot=base=>({base,messageId:'checkpoint-'+base,user:'teacher',iv:Buffer.alloc(12,99),ciphertext:Buffer.from('opaque encrypted full scene including tombstones'),fileIds:['image']});
const until=async check=>{const end=Date.now()+5000;while(!check()){assert.ok(Date.now()<end);await new Promise(r=>setTimeout(r,10));}};
test('checkpoint transaction: stale base, rollback before commit, consistent read, exact receipts and new pool', {skip:!connection},async()=>{
  let fail=false,hold=false,release,entered=false;
  let a=await openPostgresJournal(connection,{beforeCheckpointCommit:async()=>{if(fail)throw new Error('synthetic pre-COMMIT failure');if(hold){entered=true;await new Promise(r=>release=r);}}}),b=await openPostgresJournal(connection);
  const s=scope();
  try{
    const rows=[];for(let i=1;i<=3;i++)rows.push(await a.append(s,frame(i)));
    await a.putFile(s,{id:'image',name:'image.png',mimeType:'image/png',data:png,user:'teacher'});
    assert.deepEqual(await a.checkpoint(s,snapshot(2)),{accepted:false,head:3});assert.equal((await a.replay(s)).length,3);
    await assert.rejects(a.checkpoint(s,{...snapshot(3),fileIds:['missing']}),/not durable/);
    await assert.rejects(a.checkpoint(s,{...snapshot(3),ciphertext:Buffer.alloc(2097153)}),/Invalid/);
    fail=true;await assert.rejects(a.checkpoint(s,snapshot(3)),/pre-COMMIT/);fail=false;
    assert.deepEqual(await b.replay(s),rows);assert.equal((await b.read(s)).checkpoint,null);
    hold=true;const pending=a.checkpoint(s,snapshot(3));await until(()=>entered);
    try{const during=await b.read(s);assert.equal(during.checkpoint,null);assert.deepEqual(during.frames,rows);}finally{release();}
    assert.equal((await pending).accepted,true);hold=false;
    assert.deepEqual(await a.replay(s),[]);assert.equal((await b.read(s)).checkpoint.seq,3);
    assert.deepEqual(await b.append(s,frame(1)),rows[0]);
    await assert.rejects(b.append(s,{...frame(1),ciphertext:Buffer.from('changed')}),/conflict/);
    assert.equal((await b.checkpoint(s,snapshot(3))).accepted,true);
    await assert.rejects(b.checkpoint(s,{...snapshot(3),ciphertext:Buffer.from('changed')}),/conflict/);
    assert.equal((await b.append(s,frame(4))).seq,4);
    const view=await a.read(s,0);assert.equal(view.checkpoint.seq,3);assert.deepEqual(view.frames.map(x=>x.seq),[4]);
    assert.equal((await a.read(s,3)).checkpoint,null);await assert.rejects(a.read(s,5),/beyond/);
    assert.deepEqual((await a.read({...s,workspace:'foreign'})).frames,[]);
    await a.close();await b.close();a=await openPostgresJournal(connection);b=await openPostgresJournal(connection);
    assert.deepEqual(await a.read(s),view);assert.ok((await a.getFile(s,'image')).data.equals(png));
    assert.equal((await a.checkpoint(s,{...snapshot(4),messageId:'new-checkpoint'})).accepted,true);
    assert.deepEqual(await a.append(s,frame(1)),rows[0]);assert.equal((await b.read(s)).checkpoint.seq,4);
  }finally{release?.();await a.close();await b.close();}
});
test('checkpoint race: serialized competing append cannot disappear', {skip:!connection},async()=>{
  const a=await openPostgresJournal(connection),b=await openPostgresJournal(connection),s=scope();
  try{
    await a.append(s,frame(1));await a.putFile(s,{id:'image',name:'image.png',mimeType:'image/png',data:png,user:'teacher'});
    const [cp,append]=await Promise.all([a.checkpoint(s,snapshot(1)),b.append(s,frame(2))]);
    const read=await a.read(s);assert.equal(append.seq,2);
    if(cp.accepted){assert.equal(read.checkpoint.seq,1);assert.deepEqual(read.frames.map(x=>x.seq),[2]);}
    else{assert.equal(read.checkpoint,null);assert.deepEqual(read.frames.map(x=>x.seq),[1,2]);}
  }finally{await a.close();await b.close();}
});
test('checkpoint wire: teacher only, viewer/student denied, foreign board cannot read snapshot', {skip:!connection},async()=>{
  const journal=await openPostgresJournal(connection),key=randomBytes(32),s=scope(),clients=[];
  const room=await startTestTransport({key,journal});
  async function client(user,role='editor',authRole='student',bound=s){const c=io(room.url,{auth:{...bound,token:issuePermit(key,{...bound,user,role,authRole,exp:Math.floor(Date.now()/1000)+120})},transports:['websocket'],reconnection:false});clients.push(c);await new Promise((a,b)=>{c.once('connect',a);c.once('connect_error',b);});return c;}
  const request=(c,e,p)=>c.timeout(3000).emitWithAck(e,p);
  try{
    await journal.append(s,frame(1));await journal.putFile(s,{id:'image',name:'image.png',mimeType:'image/png',data:png,user:'teacher'});
    const teacher=await client('teacher','editor','teacher'),student=await client('student'),viewer=await client('viewer','viewer');
    assert.equal((await request(student,'checkpoint',snapshot(1))).ok,false);
    assert.equal((await request(viewer,'checkpoint',snapshot(1))).ok,false);
    const {user,...payload}=snapshot(1);assert.equal((await request(teacher,'checkpoint',payload)).accepted,true);
    assert.equal((await request(student,'replay',{after:0})).checkpoint.seq,1);
    const foreign=await client('foreign','editor','teacher',{...s,board:'other'});
    assert.equal((await request(foreign,'replay',{after:0})).checkpoint,null);
  }finally{for(const c of clients)c.close();await room.close();await journal.close();}
});
