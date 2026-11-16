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

test('lesson recording navigation isolates exact class and lesson, locks editor and restores library preferences',async()=>{
 const {resolveRecordingContext,beginLessonRecordings,leaveLessonRecordings,renderLessonRecordings}=await import('./lesson-recordings.mjs');
 const data={classes:[{id:'c',title:'Individual'}],groups:[{id:'g',title:'Pair'}],lessons:[{id:'a',individualClassId:'c',title:'Lesson A',lessonAt:'2026-11-16T09:00:00Z'},{id:'b',individualClassId:'c',title:'Lesson B',lessonAt:'2026-11-17T09:00:00Z'},{id:'pair',groupClassId:'g',title:'Pair lesson',lessonAt:'2026-11-18T09:00:00Z'}],recordings:[{id:'r',lessonId:'a',individualClassId:'c',title:'Only A',sourceUrl:'https://example.org/a',revision:3,isAvailable:true,lessonAt:'2026-11-16T09:00:00Z'},{id:'other',lessonId:'b',individualClassId:'c',title:'Only B',lessonAt:'2026-11-17T09:00:00Z'}]};
 const preferences={section:'materials',query:'Existing search',folderId:'folder',recordingClass:'group:g',recordingQuery:'Previous',recordingEditor:''};
 const ctx=beginLessonRecordings(data,preferences,{id:'c',kind:'individual'},'a','new');
 assert.equal(ctx.recordingLessonId,'a');assert.equal(ctx.recordingEditor,'new');assert.equal(ctx.section,'recordings');assert.equal(preferences.section,'materials');
 assert.equal(resolveRecordingContext(data,ctx.recordingContext).lesson.id,'a');
 assert.equal(resolveRecordingContext(data,{classId:'g',classKind:'group',lessonId:'a'}),null);
 assert.throws(()=>beginLessonRecordings(data,preferences,{id:'g',kind:'group'},'a'));
 assert.throws(()=>beginLessonRecordings(data,preferences,{id:'c',kind:'individual'},'a','edit','other'));
 assert.equal(beginLessonRecordings(data,preferences,{id:'g',kind:'group'},'pair').recordingLessonId,'pair');
 const html=renderRecordingLibrary(data,ctx,safe);
 assert.match(html,/data-recording-context="a"/);assert.match(html,/<select name="lessonId" required disabled>/);assert.match(html,/<option value="a" selected>/);assert.doesNotMatch(html,/<option value="b"|Only B/);
 const values={title:'Record',sourceUrl:'https://example.org/video',lessonId:'b'};
 assert.throws(()=>recordingWriteAction(null,values,ctx.recordingContext));
 assert.throws(()=>recordingWriteAction(data.recordings[1],{...values,lessonId:'a',revision:3},ctx.recordingContext));
 assert.equal(recordingWriteAction(null,{...values,lessonId:'a'},ctx.recordingContext).body.lessonId,'a');
 const restored=leaveLessonRecordings(ctx);assert.equal(restored.query,'Existing search');assert.equal(restored.folderId,'folder');assert.equal(restored.section,'materials');assert.equal(restored.recordingContext,null);
 const card=renderLessonRecordings(data.lessons[0],{id:'c',kind:'individual'},data,safe);assert.match(card,/Only A/);assert.doesNotMatch(card,/Only B|href="https:|example.org\/a/);
 assert.match(renderLessonRecordings(data.lessons[0],{id:'c',kind:'individual'},{...data,recordings:undefined},safe),/Загружаем записи/);
 data.classes[0].isArchived=true;assert.throws(()=>beginLessonRecordings(data,preferences,{id:'c',kind:'individual'},'a','new'));
 assert.equal(resolveRecordingContext(data,ctx.recordingContext).canWrite,false);
 const archived=renderLessonRecordings(data.lessons[0],{id:'c',kind:'individual'},data,safe);assert.doesNotMatch(archived,/data-lesson-recording-new|data-lesson-recording-edit/);assert.match(archived,/data-recording-open/);
});
