import test from 'node:test';
import assert from 'node:assert/strict';
import {feedbackEditor,feedbackSave,feedbackText,pupilFeedbackKey,renderPupilFeedback} from './pupil-feedback.mjs';
import {teacherResourcePath} from './teacher-data.mjs';
const member='11111111-1111-1111-1111-111111111111';
const safe=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const input=()=>({generatedAt:'2026-11-17T12:00:00Z',membershipId:member,studentName:'Pupil',programName:'Math',data:{
 lessons:[{id:'pair',lessonAt:'2026-11-17T10:00:00Z',participants:[{membershipId:member,attendanceStatus:'Absent',durationMinutes:60},{membershipId:'other',attendanceStatus:'Present',durationMinutes:90}]}],
 assignments:[],nativeAssignments:Array.from({length:301},(_,i)=>({id:'work'+i,membershipId:member,title:'Native',assignedAt:'2026-11-17T09:00:00Z',deadlineAt:'2026-11-18T09:00:00Z',submittedAt:'2026-11-17T09:30:00Z',scorePercent:0})),
 tests:[{membershipId:member,testId:'test',taskNumber:6,testDate:'2026-11-17',scorePercent:50},{membershipId:member,testId:'test',taskNumber:6,testDate:'2026-11-17',scorePercent:100}],liveTests:[],mocks:[]}});
test('feedback uses complete pupil report policy, valid zero and best attempts',()=>{
 const current=input(),text=feedbackText(current);assert.match(text,/301 из 301/);assert.match(text,/1 лучших попыток/);assert.match(text,/80% ДЗ \/ 20% тесты: 20%/);assert.match(text,/0 присутствий, 1 пропусков/);
 current.data.tests=[];assert.match(feedbackText(current),/Итог по правилу 80% ДЗ \/ 20% тесты: не рассчитано/);
});
test('draft revision and original source timestamp survive text editing; empty reports rejected',()=>{
 const current=input(),saved={title:'Saved',body:'Original',revision:7,snapshot:current};
 const editor=feedbackEditor({current:{...current,generatedAt:'2026-11-18T12:00:00Z'},draft:saved},'edit');editor.body='Edited';editor.preview=true;
 assert.deepEqual(feedbackSave(editor),{expectedRevision:7,generatedAt:current.generatedAt,title:'Saved',body:'Edited'});
 const next=feedbackEditor({current,draft:saved});assert.equal(next.expectedRevision,7);assert.match(next.body,/301 из 301/);
 assert.throws(()=>feedbackSave({...editor,body:''}));assert.throws(()=>feedbackSave({...editor,body:'x'.repeat(20001)}));
 current.data.lessons=[];assert.throws(()=>feedbackText(current));
});
test('feedback cache path is pupil-scoped and preview escapes editable text',()=>{
 const current=input(),card={membershipId:member,tab:'feedback'};
 assert.equal(teacherResourcePath(pupilFeedbackKey(card)),'students/'+member+'/feedback');assert.throws(()=>teacherResourcePath('pupilFeedback:../students'));
 card.feedbackEditor={...feedbackEditor({current,draft:null}),body:'<script>alert(1)</script>',preview:true};
 const html=renderPupilFeedback({[pupilFeedbackKey(card)]:{current,draft:null}},card,safe);
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/data-feedback-preview/);
 const foreign={...current,membershipId:'foreign',studentName:'Private other pupil'};
 assert.doesNotMatch(renderPupilFeedback({[pupilFeedbackKey(card)]:{current:foreign,draft:null}},{...card,feedbackEditor:null},safe),/Private other pupil/);
});
