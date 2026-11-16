import test from 'node:test';
import assert from 'node:assert/strict';
import {pupilAllowedSources,pupilHistoryKey,pupilSourceUrl,pupilWorkFilters,renderPupilHistory} from './pupil-history.mjs';
import {studentHomeworkKey} from './student-card.mjs';
import {teacherResourcePath} from './teacher-data.mjs';
const safe=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const id='11111111-1111-1111-1111-111111111111',classId='22222222-2222-2222-2222-222222222222';
test('work sources, periods, classes and mock drill-down have distinct scoped cache paths',()=>{
 const card={membershipId:id,tab:'results',workPage:1,workMonth:'2026-11',workClass:'group~'+classId};
 assert.equal(teacherResourcePath(studentHomeworkKey(card)),'students/'+id+'/homework?page=1&results=true&month=2026-11&classKind=group&classId='+classId);
 card.workSource='mockTasks';card.workMock={id:'mock:/? & <1>',date:'2026-11-01'};
 const path=new URL('https://test.invalid/'+teacherResourcePath(studentHomeworkKey(card)));
 assert.equal(path.searchParams.get('mockId'),'mock:/? & <1>');assert.equal(path.searchParams.get('mockDate'),'2026-11-01');assert.equal(path.searchParams.get('source'),'mockTasks');
 assert.deepEqual(pupilAllowedSources('tasks'),['native','imported']);assert.ok(pupilAllowedSources('results').includes('liveTests'));
 assert.throws(()=>teacherResourcePath('studentHistory:../students:tests:results:0:all::all'));
 const filters=pupilWorkFilters({...card,workSource:'native'},[{id:classId,classKind:'group',title:'Owned',membershipId:id},{id:'foreign',classKind:'group',title:'Other learning',membershipId:'other'}],safe);
 assert.match(filters,/Owned/);assert.doesNotMatch(filters,/Other learning/);
});
test('history details preserve zero and missing values, escape content and reject active links',()=>{
 const card={membershipId:id,tab:'results',workSource:'imported',workId:'row'};
 const row={id:'row',membershipId:id,programId:'math',source:'imported',title:'<b>Work</b>',date:'2026-11-01',scorePercent:0,details:{url:'javascript:alert(1)',taskNumber:6},attempts:[{scorePercent:0,completedAt:'2026-11-01T12:00:00Z',durationSeconds:0,isLate:false}]};
 const data={students:[{membershipId:id,programId:'math'}],[pupilHistoryKey(card)]:{items:[row],total:1,page:0,pageSize:20}};
 const html=renderPupilHistory(data,card,safe);assert.match(html,/&lt;b&gt;Work/);assert.match(html,/0%/);assert.match(html,/Не сохранено/);assert.doesNotMatch(html,/href="javascript/);assert.doesNotMatch(html,/data-native-grade/);
 assert.equal(pupilSourceUrl('data:text/html,test'),null);assert.equal(pupilSourceUrl('https://user:password@test.invalid'),null);assert.equal(pupilSourceUrl('https://test.invalid/work'),'https://test.invalid/work');
 card.workId='';data[pupilHistoryKey(card)].items=[{...row,membershipId:'foreign'},{...row,programId:'other'},{...row,source:'tests'}];assert.doesNotMatch(renderPupilHistory(data,card,safe),/data-student-work="row"/);
});
test('mock summary offers exact drill-down; independent task records preserve unknown points',()=>{
 const card={membershipId:id,tab:'results',workSource:'mocks',workId:'mock'};
 const row={id:'mock',membershipId:id,programId:'math',source:'mocks',title:'Variant',date:'2026-11-01',scorePercent:60,details:{mockId:'variant-1',primaryScore:6,maxPrimaryScore:10}};
 const data={students:[{membershipId:id,programId:'math'}],[pupilHistoryKey(card)]:{items:[row],total:1,page:0,pageSize:20}};
 assert.match(renderPupilHistory(data,card,safe),/data-student-mock-parts="mock"/);
 card.workSource='mockTasks';data[pupilHistoryKey(card)]={items:[{...row,source:'mockTasks',scorePercent:null,details:{taskNumber:6,answered:true,isCorrect:false,earnedPoints:null,maxPoints:null}}],total:1,page:0,pageSize:20};
 const html=renderPupilHistory(data,card,safe);assert.match(html,/Не сохранено/);assert.doesNotMatch(html,/0 \/ 0|0%/);
});
