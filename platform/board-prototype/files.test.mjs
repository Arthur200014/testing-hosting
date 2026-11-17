import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validateFile,references } from './files.mjs';
import { png,pdf,jpeg } from './file-fixtures.mjs';
import { openPostgresJournal } from './postgres.mjs';
const image=(id='picture')=>({id,name:'picture.png',mimeType:'image/png',data:png,user:'teacher'});
test('file policy validates PNG pixels/CRC, PDF, type, size, ids and names',()=>{
  assert.equal(validateFile(image()).pixels,4);
  assert.equal(validateFile({...image(),mimeType:"image/jpeg",data:jpeg}).pixels,4);
  assert.equal(validateFile({id:'pdf',name:'lesson.pdf',mimeType:'application/pdf',data:pdf}).size,pdf.length);
  for(const f of [{...image(),mimeType:'image/jpeg'},{...image(),name:'../escape.png'},{...image(),id:'foreign/id'},{...image(),data:Buffer.alloc(2*1024*1024+1)},{...image(),mimeType:'image/svg+xml',data:Buffer.from('<svg/>')}])assert.throws(()=>validateFile(f));
  const corrupt=Buffer.from(png);corrupt[45]^=1;assert.throws(()=>validateFile({...image(),data:corrupt}));
  assert.deepEqual(references(['b','a','a']),['a','b']);assert.throws(()=>references(['../foreign']));assert.throws(()=>references(Array(65).fill('x')));
});
test('PostgreSQL durable immutable files, scoped refs, quotas and fresh-pool recovery',{skip:!process.env.BOARD_TEST_DATABASE_URL},async()=>{
  const s={workspace:'synthetic-files-'+randomUUID(),board:'lesson-1'};let db=await openPostgresJournal(process.env.BOARD_TEST_DATABASE_URL);
  const f={messageId:'scene-1',user:'teacher',ciphertext:Buffer.from('encrypted'),iv:Buffer.alloc(12,1),fileIds:['picture']};
  try{
    await assert.rejects(db.append(s,f),/not durable/);assert.deepEqual(await db.replay(s),[]);
    const stored=await db.putFile(s,image());assert.deepEqual((await db.putFile(s,image())).data,png);
    await assert.rejects(db.putFile(s,{...image(),name:'renamed.png'}),/conflict/);
    const row=await db.append(s,f);assert.deepEqual(row.fileIds,['picture']);
    await assert.rejects(db.append(s,{...f,fileIds:[]}),/conflict/);
    assert.equal(await db.getFile({...s,workspace:'foreign'},'picture'),null);
    assert.equal(await db.getFile({...s,board:'other'},'picture'),null);
    await db.close();db=await openPostgresJournal(process.env.BOARD_TEST_DATABASE_URL);
    assert.deepEqual((await db.getFile(s,'picture')).data,png);assert.deepEqual((await db.replay(s))[0],row);
    await db.append(s,{...f,messageId:'delete',fileIds:[]});assert.deepEqual((await db.getFile(s,'picture')).data,png);
    await Promise.all(Array.from({length:63},(_,i)=>db.putFile(s,image('file-'+i))));
    await assert.rejects(db.putFile(s,image('over-quota')),/quota/);
    assert.equal((await db.getFile(s,'picture')).sha256,stored.sha256);
  }finally{await db.close();}
});

test('PostgreSQL byte and decoded-pixel budgets are enforced independently',{skip:!process.env.BOARD_TEST_DATABASE_URL},async()=>{
 const db=await openPostgresJournal(process.env.BOARD_TEST_DATABASE_URL),run=randomUUID();
 try{
  const large=Buffer.alloc(2*1024*1024,32);large.write('%PDF-1.4\n');large.write('%%EOF\n',large.length-6);
  const scope={workspace:'synthetic-budget-'+run,board:'pdf'};
  for(let i=0;i<8;i++)await db.putFile(scope,{id:'pdf-'+i,name:'large.pdf',mimeType:'application/pdf',data:large,user:'teacher'});
  await assert.rejects(db.putFile(scope,{id:'pdf-over',name:'large.pdf',mimeType:'application/pdf',data:large,user:'teacher'}),/quota/);
  const {solidPng}=await import('./file-fixtures.mjs');const dense=solidPng(2048,2048),pixels={...scope,board:'pixels'};
  for(let i=0;i<4;i++)await db.putFile(pixels,{...image('pixel-'+i),data:dense});
  await assert.rejects(db.putFile(pixels,{...image('pixel-over'),data:dense}),/quota/);
 }finally{await db.close();}
});
