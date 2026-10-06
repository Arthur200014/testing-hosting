import test from 'node:test';
import assert from 'node:assert/strict';
import { createAspNetHomeworkClient, mapLegacyHomeworkSubmission } from './homework-aspnet-client.js';

const sessionBody = {
  accessToken: 'token-1',
  tokenType: 'Bearer',
  expiresAt: '2030-01-01T00:00:00.000Z',
  student: {
    id: '11111111-1111-1111-1111-111111111111',
    displayName: 'Synthetic Student',
    programId: '22222222-2222-2222-2222-222222222222',
    workspaceId: '33333333-3333-3333-3333-333333333333'
  }
};

test('legacy homework mapper keeps only server-owned submission fields', () => {
  const mapped = mapLegacyHomeworkSubmission({
    action: 'submitHomework',
    studentId: 'ignored',
    studentName: 'Ignored',
    studentCode: 'ABCD',
    assignmentId: 'HW-6-1',
    eventId: 'event-1',
    scorePercent: 80,
    durationSeconds: 91,
    completedAt: '2026-10-06T12:00:00Z',
    schemaVersion: 2
  });
  assert.deepEqual(mapped, {
    assignmentId: 'HW-6-1',
    eventId: 'event-1',
    scorePercent: 80,
    durationSeconds: 91,
    completedAt: '2026-10-06T12:00:00.000Z',
    schemaVersion: '2'
  });
  assert.equal('studentId' in mapped, false);
  assert.equal('programId' in mapped, false);
  assert.equal('workspaceId' in mapped, false);
});

test('homework client reuses student session for list and submission', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/api/v1/student-sessions')) return Response.json(sessionBody);
    if (url.endsWith('/api/v1/homework-assignments')) return Response.json([{
      assignmentRecordId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      homeworkId: 'HW-6-1', taskNumber: 6, name: 'Synthetic', url: 'https://tests.invalid/hw',
      assignedAt: '2026-10-06T10:00:00Z', deadlineAt: '2026-10-07T10:00:00Z', submittedAt: null,
      status: 'assigned', scorePercent: null, schemaVersion: '2'
    }]);
    if (url.endsWith('/api/v1/homework-submissions')) return Response.json({
      submissionId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      assignmentRecordId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      homeworkId: 'HW-6-1', eventId: 'event-2', duplicate: false, late: false,
      status: 'submitted', scorePercent: 90, completedAt: '2026-10-06T12:00:00Z',
      createdAt: '2026-10-06T12:00:01Z'
    }, { status: 201 });
    throw new Error('unexpected request');
  };
  const client = createAspNetHomeworkClient({
    baseUrl: 'https://api.tests.invalid', workspace: 'school', fetchImpl,
    getStudentCode: () => 'abcd', now: () => Date.parse('2026-10-06T12:00:00Z')
  });

  const student = await client.validateStudentCode('abcd');
  const assignments = await client.listAssignments({ studentCode: 'ABCD' });
  const saved = await client.submitResult({
    action: 'submitHomework', studentCode: 'ABCD', assignmentId: 'HW-6-1', eventId: 'event-2',
    scorePercent: 90, durationSeconds: 30, completedAt: '2026-10-06T12:00:00Z', schemaVersion: 2
  });

  assert.equal(student.id, sessionBody.student.id);
  assert.equal(assignments.length, 1);
  assert.equal(saved.submitted, true);
  assert.equal(saved.eventId, 'event-2');
  assert.equal(calls.filter(call => call.url.endsWith('/api/v1/student-sessions')).length, 1);
  const authorized = calls.filter(call => call.url.includes('/homework-'));
  assert.equal(authorized.length, 2);
  assert.ok(authorized.every(call => call.options.headers.Authorization === 'Bearer token-1'));
});

test('conflicting replay surfaces a normalized conflict error', async () => {
  const fetchImpl = async url => {
    if (url.endsWith('/api/v1/student-sessions')) return Response.json(sessionBody);
    return Response.json({ title: 'conflict' }, { status: 409 });
  };
  const client = createAspNetHomeworkClient({
    baseUrl: 'https://api.tests.invalid', workspace: 'school', fetchImpl,
    getStudentCode: () => 'ABCD', now: () => Date.parse('2026-10-06T12:00:00Z')
  });
  await assert.rejects(
    () => client.submitResult({
      action: 'submitHomework', studentCode: 'ABCD', assignmentId: 'HW-6-1', eventId: 'event-conflict',
      scorePercent: 50, durationSeconds: 30, completedAt: '2026-10-06T11:59:00Z', schemaVersion: 2
    }),
    error => error?.code === 'CONFLICT' && error?.status === 409
  );
});
