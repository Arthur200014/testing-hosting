import test from 'node:test';
import assert from 'node:assert/strict';
import {studentMemberships,studentClassRelations,studentLessonRows,studentLessonTarget,resolveStudentOrigin,beginStudentCard,studentEditAction,renderStudentCard} from './student-card.mjs';
const safe=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const fixture=()=>({students:[{membershipId:'a',studentId:'same-person',studentName:'Same name',programName:'Math',grade:'11',notes:'Original',parentName:'Parent'},{membershipId:'b',studentId:'other-person',studentName:'Same name',programName:'Math'},{membershipId:'second-program',studentId:'same-person',studentName:'Same name',programName:'Language',grade:'9',notes:'Other profile'}],classes:[{id:'individual',studentMembershipId:'a',title:'Individual'},{id:'language',studentMembershipId:'second-program',title:'Language class'}],groups:[{id:'pair',title:'Pair',members:[{membershipId:'a',isApproved:true},{membershipId:'b',isApproved:false}]}],lessons:[{id:'lesson',groupClassId:'pair',lessonAt:'2026-11-16T09:00:00Z',title:'Pair lesson',participants:[{membershipId:'a',attendanceStatus:'Absent',durationMinutes:60},{membershipId:'b',attendanceStatus:'Present',durationMinutes:90}]},{id:'language-lesson',individualClassId:'language',lessonAt:'2026-11-17T09:00:00Z',participants:[{membershipId:'second-program',attendanceStatus:'Unknown',durationMinutes:45}]}]});
test('student identity uses membership and StudentId, not duplicate names; attendance stays per participant',()=>{
 const d=fixture();assert.deepEqual(studentMemberships(d,'a').map(s=>s.membershipId),['a','second-program']);
 assert.deepEqual(studentMemberships(d,'b').map(s=>s.membershipId),['b']);
 assert.equal(studentMemberships(d,'foreign').length,0);assert.throws(()=>beginStudentCard(d,'foreign'));
 assert.equal(studentClassRelations(d,'a').length,3);assert.equal(studentClassRelations(d,'b')[0].isApproved,false);
 const a=studentLessonRows(d,'a'),b=studentLessonRows(d,'b');assert.equal(a.length,2);assert.equal(b.length,1);assert.equal(a.find(r=>r.lesson.id==='lesson').participant.attendanceStatus,'Absent');assert.equal(b[0].participant.attendanceStatus,'Present');
 assert.deepEqual(studentLessonTarget(d,b[0]),{classId:'pair',classKind:'group',lessonId:'lesson',isArchived:false});
 const legacy={lesson:{id:'legacy'},participant:{membershipId:'a'}};assert.equal(studentLessonTarget(d,legacy).classId,'individual');
});
test('origin return requires actual class relationship or participation and supports archive and other study of same person',()=>{
 const d=fixture(),origin={classId:'pair',classKind:'group',lessonId:'lesson',tab:'schedule'};
 const card=beginStudentCard(d,'a',origin);assert.equal(resolveStudentOrigin(d,card.origin,'second-program').lessonId,'lesson');
 assert.equal(resolveStudentOrigin(d,card.origin,'b'),null);
 assert.throws(()=>beginStudentCard(d,'b',{classId:'individual',classKind:'individual'}));
 assert.throws(()=>beginStudentCard(d,'a',{...origin,lessonId:'foreign'}));
 d.groups[0].isArchived=true;assert.equal(resolveStudentOrigin(d,card.origin,'a').isArchived,true);
 const old={id:'old',lessonAt:'2026-11-16T09:00:00Z',participants:[{membershipId:'a'}]};d.lessons.push(old);d.classes.push({id:'second-individual',studentMembershipId:'a'});
 assert.equal(resolveStudentOrigin(d,{classId:'second-individual',classKind:'individual',membershipId:'a',lessonId:'old'},'a').classId,'second-individual');
 d.lessons[0].participants=[];assert.equal(resolveStudentOrigin(d,card.origin,'a'),null);
});
test('profile edits preserve original concurrency snapshot and all unrelated fields for exact membership',()=>{
 const d=fixture(),snapshot={...d.students[0]},values={...snapshot,studentName:'Renamed',notes:'Changed',grade:'10'};
 const action=studentEditAction(snapshot,values);assert.equal(action.path,'students/a/edit');assert.equal(action.body.expectedStudentName,'Same name');assert.equal(action.body.expectedProfile.notes,'Original');assert.equal(action.body.profile.parentName,'Parent');assert.equal(action.body.profile.notes,'Changed');assert.deepEqual(action.keys,['students','classes','groups']);
 assert.equal(studentEditAction(snapshot,{studentName:snapshot.studentName,grade:'10'}).body.profile.parentName,'Parent');
 assert.equal(d.students[2].notes,'Other profile');assert.equal(snapshot.notes,'Original');assert.throws(()=>studentEditAction(snapshot,{studentName:' '}));assert.throws(()=>studentEditAction(null,values));
});
test('card renders verified data, independent attendance, unavailable state and escaped info without invented contacts',()=>{
 const d=fixture(),card={...beginStudentCard(d,'a'),month:'2026-11',tab:'attendance'};
 let html=renderStudentCard(d,card,safe);assert.match(html,/Отсутствовал: 1/);assert.match(html,/Присутствовал: 0/);assert.match(html,/Не отмечено: 1/);assert.doesNotMatch(html,/Присутствовал: 1/);
 d.students[0].notes='<script>bad</script>';html=renderStudentCard(d,{...card,tab:'profile',infoOpen:true},safe);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|Онлайн|mailto:|tel:/);assert.match(html,/data-student-info-dialog/);
 assert.match(renderStudentCard({...d,classes:undefined},card,safe),/Загружаем классы/);
 assert.match(renderStudentCard(d,{...card,membershipId:'foreign'},safe),/Ученик больше недоступен/);
 assert.match(renderStudentCard(d,{...card,membershipId:'b',tab:'classes'},safe),/Ожидает подтверждения/);
});
