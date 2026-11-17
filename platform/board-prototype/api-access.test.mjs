import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { apiAccess } from './api-access.mjs';
test('online access sends only permit and fails closed on denial/outage/redirect',async t=>{
  for(const u of ['https://example.org','http://127.0.0.1/foreign','http://user:secret@127.0.0.1'])assert.throws(()=>apiAccess(u));
  let status=204;
  const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;
    assert.equal(req.url,'/api/v1/board-prototype/access');assert.equal(req.method,'POST');assert.deepEqual(JSON.parse(body),{token:'synthetic-permit'});
    assert.equal(req.headers.authorization,undefined);res.writeHead(status,{Location:'https://example.invalid'});res.end();});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>server.close());const check=apiAccess(`http://127.0.0.1:${server.address().port}`);
  assert.equal(await check({token:'synthetic-permit'}),true);
  for(status of [404,500,302])assert.equal(await check({token:'synthetic-permit'}),false);
  await new Promise(r=>server.close(r));assert.equal(await check({token:'synthetic-permit'}),false);
});
