import test from 'node:test';
import assert from 'node:assert/strict';
import { individualClassNativeHomework, taskMatchesClass } from './class-native-homework.mjs';

test('class homework shows reusable program templates but assignments for this member only', () => {
  const data = {
    nativeTasks: [
      { id: 'a', programId: 'math' }, { id: 'b', programId: 'english' },
      { id: 'c', programId: 'math' }
    ],
    nativeAssignments: [
      { id: 'old', membershipId: 'own', assignedAt: '2026-10-01T12:00:00Z' },
      { id: 'foreign', membershipId: 'other', assignedAt: '2026-10-03T12:00:00Z' },
      { id: 'new', membershipId: 'own', assignedAt: '2026-11-02T12:00:00Z' }
    ]
  };
  const result = individualClassNativeHomework(data, 'own', 'math');
  assert.deepEqual(result.tasks.map(x => x.id), ['a', 'c']);
  assert.deepEqual(result.assignments.map(x => x.id), ['new', 'old']);
  assert.equal(data.nativeAssignments.length, 3, 'view must never mutate fetched data');
});

test('empty class keeps an empty task and history state', () => {
  assert.deepEqual(individualClassNativeHomework({}, 'missing', 'math'), { tasks: [], assignments: [] });
});

test('assignment selection cannot use a template from another program', () => {
  assert.equal(taskMatchesClass({ id: 'a', programId: 'math' }, 'math'), true);
  assert.equal(taskMatchesClass({ id: 'b', programId: 'english' }, 'math'), false);
  assert.equal(taskMatchesClass(null, 'math'), false);
  assert.equal(taskMatchesClass({ programId: 'math' }, ''), false);
});

test('group choices use approved members and assignments keep explicit class context',async()=>{
  const {groupClassNativeHomework,renderGroupHomework}=await import('./class-native-homework.mjs');
  const item={id:'g',members:[{membershipId:'a',isApproved:true},{membershipId:'b',isApproved:false}]};
  const data={students:[{membershipId:'a',programId:'p',studentName:'<A>'},{membershipId:'b',programId:'q',studentName:'Pending'}],
    nativeTasks:[{id:'t',programId:'p',title:'Task'},{id:'bad',programId:'q',title:'Other'}],
    'groupHomework:g':[{id:'one',groupClassId:'g',membershipId:'a',title:'Task'},{id:'unrelated',groupClassId:null,membershipId:'a'}]};
  const view=groupClassNativeHomework(data,item);
  assert.deepEqual(view.members.map(x=>x.membershipId),['a']);
  assert.deepEqual(view.tasks.map(x=>x.id),['t']);
  assert.deepEqual(view.assignments.map(x=>x.id),['one']);
  const safe=x=>String(x??'').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const list=(xs,empty,f)=>xs.length?xs.map(f).join(''):empty;
  assert.match(renderGroupHomework(item,data,safe,()=>'',list),/&lt;A&gt;/);
  assert.doesNotMatch(renderGroupHomework({...item,isArchived:true},data,safe,()=>'',list),/groupNativeAssignForm/);
});


test('group history never falls back to workspace feed; status handles zero grades', async () => {
  const { groupClassNativeHomework, groupHomeworkStatus } = await import('./class-native-homework.mjs');
  assert.deepEqual(groupClassNativeHomework({nativeAssignments:[{groupClassId:'g'}]}, {id:'g'}).assignments, []);
  assert.equal(groupHomeworkStatus({scorePercent:0,submittedAt:'2026-01-01'}),'graded');
  assert.equal(groupHomeworkStatus({submittedAt:'2026-01-01'}),'submitted');
  assert.equal(groupHomeworkStatus({deadlineAt:'2000-01-01'}),'overdue');
  assert.equal(groupHomeworkStatus({deadlineAt:'2100-01-01'}),'awaiting');
});
