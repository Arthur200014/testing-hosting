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
