import test from 'node:test';
import assert from 'node:assert/strict';
import {materialAction,fetchProtectedFile,uploadProtectedFile,newFileUploadState,MAX_FILE_BYTES} from './material-file.mjs';
const safe=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
test('file actions expose no public bearer URL and escape names; links stay links',()=>{
 const html=materialAction({fileId:'own',fileName:'<notes>.txt'},safe);
 assert.match(html,/data-file-download="own"/);assert.doesNotMatch(html,/href=|Bearer|<notes>/);
 assert.match(materialAction({url:'https://example.org'},safe),/rel="noopener noreferrer"/);
 assert.equal(materialAction({url:'javascript:alert(1)'},safe),'');
});
test('download uses authorized no-store fetch on the correct role route',async()=>{
 let call;const request=async(url,options)=>{call={url,options};return new Response('file');};
 assert.equal(await (await fetchProtectedFile('https://api.invalid','secret','own',true,request)).text(),'file');
 assert.equal(call.url,'https://api.invalid/api/v1/files/own/content');
 assert.deepEqual(call.options.headers,{Authorization:'Bearer secret'});assert.equal(call.options.cache,'no-store');
 await fetchProtectedFile('https://api.invalid','secret','own',false,request);
 assert.equal(call.url,'https://api.invalid/api/v1/teacher/files/own/content');
 await assert.rejects(fetchProtectedFile('https://api.invalid','secret','own',true,async()=>new Response('',{status:404})),/недоступен/);
});
test('upload keeps retry identity and raw bytes, rejects oversized input before a request',async()=>{
 const file=new Blob(['content']);file.name='notes.txt';const state={...newFileUploadState(),file,title:'Notes',requestId:'retry-id'};let count=0;
 const request=async(url,options)=>{count++;assert.match(url,/retry-id\?fileName=notes.txt/);assert.equal(options.body,file);return new Response('{"id":"material"}',{headers:{'Content-Type':'application/json'}});};
 await uploadProtectedFile('https://api.invalid','secret',state,request);await uploadProtectedFile('https://api.invalid','secret',state,request);
 assert.equal(count,2);assert.equal(state.requestId,'retry-id');
 await assert.rejects(uploadProtectedFile('https://api.invalid','secret',{...state,file:{size:MAX_FILE_BYTES+1}},request),/до 5 МБ/);assert.equal(count,2);
});
