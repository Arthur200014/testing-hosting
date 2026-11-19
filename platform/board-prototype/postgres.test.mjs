import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openPostgresJournal, assertTestDatabase, hostedPostgresSsl } from './postgres.mjs';
const connection = process.env.BOARD_TEST_DATABASE_URL;
test('hosted TLS accepts private VPC self-signed certificates only for non-verifying SSL modes',()=>{
  assert.deepEqual(hostedPostgresSsl('192.168.0.4','Prefer'), {rejectUnauthorized:false});
  assert.deepEqual(hostedPostgresSsl('10.20.0.4','Require'), {rejectUnauthorized:false});
  assert.deepEqual(hostedPostgresSsl('172.31.4.1','Allow'), {rejectUnauthorized:false});
  for(const host of ['172.32.4.1','203.0.113.8','postgres.example.org','127.0.0.1'])
    assert.deepEqual(hostedPostgresSsl(host,'Prefer'),{rejectUnauthorized:true});
  for(const mode of ['VerifyCA','VerifyFull'])
    assert.deepEqual(hostedPostgresSsl('192.168.0.4',mode),{rejectUnauthorized:true});
  assert.deepEqual(hostedPostgresSsl('192.168.0.4','Prefer','trusted-ca'),{rejectUnauthorized:true,ca:'trusted-ca'});
  assert.equal(hostedPostgresSsl('192.168.0.4','Disable'),false);
  assert.throws(()=>hostedPostgresSsl('203.0.113.8','Disable'),/private IPv4/);
  assert.throws(()=>hostedPostgresSsl('192.168.0.4','unknown'),/Unsupported/);
});
test('test storage refuses external, production and injected connection options',()=>{
  for(const url of ['postgres://localhost/platform','postgres://example.org/tas_board_test','postgres://localhost/tas_board_test?host=foreign','postgres://localhost/tas_board_test#x'])
    assert.throws(()=>assertTestDatabase(url));
});
test('PostgreSQL transactional replay: competing writers, retries, rollback and new pool recovery', {skip:!connection}, async()=>{
  const scope={workspace:'synthetic-'+randomUUID(),board:'lesson-1'};
  let a=await openPostgresJournal(connection),b=await openPostgresJournal(connection);
  const frame=i=>({user:'pupil-'+i,messageId:'message-'+i,ciphertext:Buffer.from('scene-'+i),iv:Buffer.alloc(12,1)});
  try {
    const rows=await Promise.all(Array.from({length:21},(_,i)=>(i%2?a:b).append(scope,frame(i))));
    assert.deepEqual(rows.map(x=>x.seq).sort((x,y)=>x-y),Array.from({length:21},(_,i)=>i+1));
    const original=rows[0];
    assert.deepEqual(await b.append(scope,frame(0)),original);
    await assert.rejects(a.append(scope,{...frame(0),ciphertext:Buffer.from('stale overwrite')}),/conflict/);
    assert.deepEqual(await a.replay({...scope,workspace:'foreign'}),[]);
    await a.close();await b.close();a=await openPostgresJournal(connection);b=await openPostgresJournal(connection);
    const restored=await a.replay(scope);
    assert.equal(restored.length,21);
    assert.deepEqual(restored,[...rows].sort((x,y)=>x.seq-y.seq));
    assert.equal((await b.replay(scope,20)).length,1);
    assert.equal((await a.append(scope,frame(21))).seq,22);
  } finally { await a.close();await b.close(); }
});
