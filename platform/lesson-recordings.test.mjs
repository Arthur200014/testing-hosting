import test from 'node:test';
import assert from 'node:assert/strict';
import {safeRecordingSource,recordingWriteAction,recordingLessonOptions,renderRecordingLibrary,renderStudentRecordings,recordingSourceLink} from './lesson-recordings.mjs';
const safe=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
test('recordings accept only credential-free HTTPS sources and convert explicit Moscow expiry',()=>{
 for(const url of ['javascript:alert(1)','http://example.org/x','https://user:pass@example.org','https://127.0.0.1/x','https://localhost/x','https://a.local./x','https://example.org:8443/x']) assert.equal(safeRecordingSource(url),null,url);
 const action=recordingWriteAction({id:'r'},{title:' Record ',sourceUrl:'https://example.org/video',lessonId:'lesson',revision:'2',accessUntil:'2026-11-17T13:20',isAvailable:false});
 assert.deepEqual(action,{path:'recordings/r/edit',body:{lessonId:'lesson',title:'Record',sourceUrl:'https://example.org/video',expectedRevision:2,accessUntil:'2026-11-17T10:20:00.000Z',isAvailable:false},keys:['recordings']});
 assert.equal(recordingWriteAction(null,{title:'Record',sourceUrl:'https://example.org/video',lessonId:'lesson'}).body.accessUntil,null);
 assert.throws(()=>recordingWriteAction({id:'r'},{title:'Record',sourceUrl:'https://example.org/video',lessonId:'lesson'}));
});
test('recordings group both class formats, filter metadata, escape content and never preload external media',()=>{
 const data={classes:[{id:'c',title:'Individual'},{id:'old',title:'Archive',isArchived:true}],groups:[{id:'g',title:'Pair'}],lessons:[{id:'l',individualClassId:'c',lessonAt:'2026-11-16T09:00:00Z'},{id:'grouped',groupClassId:'g',lessonAt:'2026-11-17T09:00:00Z'},{id:'oldl',individualClassId:'old'}],recordings:[{id:'r',title:'<img src=x>',sourceUrl:'https://example.org/private',lessonId:'grouped',groupClassId:'g',lessonAt:'2026-11-17T09:00:00Z',revision:3,isAvailable:true}]};
 assert.deepEqual(recordingLessonOptions(data).map(x=>x.id),['l','grouped']);
 let html=renderRecordingLibrary(data,{recordingQuery:'',recordingClass:''},safe);
 assert.match(html,/Pair/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|<video|<iframe|href="https:|example.org\/private/);
 html=renderRecordingLibrary(data,{recordingEditor:'r'},safe);assert.match(html,/data-revision="3"/);assert.match(html,/https:\/\/example.org\/private/);
 assert.match(renderRecordingLibrary(data,{recordingClass:'individual:c'},safe),/Записей не найдено/);
 assert.match(renderStudentRecordings([{id:'r',title:'<script>',classTitle:'Pair',lessonAt:'2026-11-17T09:00:00Z'}],safe),/&lt;script&gt;/);
 assert.match(recordingSourceLink('https://example.org/video',safe),/rel="noopener noreferrer"/);assert.throws(()=>recordingSourceLink('javascript:alert(1)',safe));
});
