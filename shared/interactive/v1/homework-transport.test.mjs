import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHomeworkIdentity, createHomeworkQueueAdapter, createHomeworkOutbox,
  parseDz1Student, parseDz23Student, parseSubmissionResponse, submissionState
} from './homework-transport.js';

test('student parsers retain dz1 and dz2/3 response shape differences', () => {
  assert.deepEqual(parseDz1Student({ result: { student: { studentID: 17, fullName: 'Ada' } } }, 'AB'), {
    id: '17', name: 'Ada', code: 'AB', verified: true
  });
  assert.equal(parseDz1Student({ valid: false, id: 1, name: 'No' }, 'AB'), null);
  assert.deepEqual(parseDz23Student({ result: { student: { id: 18, name: 'Lin' } } }, 'CD'), {
    id: '18', name: 'Lin', code: 'CD'
  });
  assert.equal(parseDz23Student({ student: { id: 18 } }, 'CD'), null);
});

test('identity adapter preserves legacy keys and dz1 verification inference', () => {
  const storage = new Map([['egeStudentCode', ' ab '], ['egeStudentId', '12'], ['egeStudentName', 'Ada']]);
  const io = { get: key => storage.get(key) || null, set: (key, value) => storage.set(key, String(value)), remove: key => storage.delete(key) };
  const dz1 = createHomeworkIdentity({ ...io, dz1: true });
  assert.deepEqual(dz1.read(), { id: '12', name: 'Ada', code: 'AB', verified: true });
  const dz23 = createHomeworkIdentity(io);
  assert.deepEqual(dz23.read(), { id: '12', name: 'Ada', code: 'AB' });
  dz23.store({ id: 'AB', name: '', code: 'AB' });
  assert.equal(storage.get('egeStudentName'), 'Ученик');
  dz1.clear();
  assert.equal(storage.has('egeStudentCode'), false);
});

test('submission parser preserves ambiguous HTTP 200 acknowledgments and error rules', () => {
  assert.deepEqual(parseSubmissionResponse('not-json', true), { success: true, message: 'not-json' });
  assert.deepEqual(submissionState({ success: true }), { submitted: false, error: false });
  assert.deepEqual(submissionState({ result: { alreadySubmitted: true, error: 'duplicate' } }), { submitted: true, error: true });
  assert.deepEqual(submissionState({ ok: false }), { submitted: false, error: true });
  assert.deepEqual(submissionState({ status: 'submitted_late' }), { submitted: true, error: false });
});

test('object adapter retains dz1 envelope, completion timestamps, attempts, and event dedupe', () => {
  let stored = {};
  let time = 40;
  const queue = createHomeworkQueueAdapter({ read: () => stored, write: value => { stored = structuredClone(value); }, shape: 'object', now: () => time });
  const payload = { eventId: 'a', answer: 3 };
  queue.enqueue(payload);
  assert.deepEqual(stored, { a: { payload: { ...payload, completedAt: new Date(40).toISOString() }, createdAt: 40, lastAttemptAt: 0 } });
  time = 50;
  queue.enqueue({ eventId: 'a', answer: 4 });
  assert.deepEqual(stored.a, { payload: { eventId: 'a', answer: 4, completedAt: new Date(50).toISOString() }, createdAt: 50, lastAttemptAt: 0 });
  queue.markAttempt('a');
  assert.equal(stored.a.lastAttemptAt, 50);
  queue.remove('a');
  assert.deepEqual(stored, {});
});

test('array adapter retains raw shape plus stable completion timestamp and duplicate replacement', () => {
  let stored = [];
  const queue = createHomeworkQueueAdapter({ read: () => stored, write: value => { stored = structuredClone(value); }, shape: 'array', now: () => 1000 });
  queue.enqueue({ eventId: 'a', studentId: 'provisional' });
  queue.enqueue({ eventId: 'a', studentId: 'verified' });
  assert.deepEqual(stored, [{ eventId: 'a', studentId: 'verified', completedAt: new Date(1000).toISOString() }]);
  queue.replacePayload('a', payload => ({ ...payload, score: 100 }));
  assert.deepEqual(stored, [{ eventId: 'a', studentId: 'verified', completedAt: new Date(1000).toISOString(), score: 100 }]);
  queue.remove('a');
  assert.deepEqual(stored, []);
});

test('outbox backfills legacy dz1 createdAt before sending but keeps array history uninvented', async () => {
  let stored = { legacy: { payload: { eventId: 'legacy' }, createdAt: 1234, lastAttemptAt: 0 } };
  const sent = [];
  const queue = createHomeworkQueueAdapter({ read: () => stored, write: value => { stored = structuredClone(value); }, shape: 'object', now: () => 2000 });
  const api = { submitResult: async payload => { sent.push(payload); return { success: true }; }, sendResultOnExit() {} };
  const outbox = createHomeworkOutbox({ queue, api, acknowledge: () => true });
  await outbox.flush();
  assert.equal(sent[0].completedAt, new Date(1234).toISOString());
  assert.deepEqual(stored, {});
});

test('outbox removes successful and duplicate acknowledgments but keeps explicit failures', async () => {
  let stored = [{ eventId: 'ok', completedAt: '2026-01-01T00:00:00.000Z' }, { eventId: 'duplicate', completedAt: '2026-01-01T00:00:00.000Z' }, { eventId: 'fail', completedAt: '2026-01-01T00:00:00.000Z' }];
  const queue = createHomeworkQueueAdapter({ read: () => stored, write: value => { stored = structuredClone(value); }, shape: 'array' });
  const api = { submitResult: async payload => {
    if (payload.eventId === 'ok') return { success: true };
    if (payload.eventId === 'duplicate') return { error: 'already', exists: true };
    return { success: false };
  }, sendResultOnExit() {} };
  const outbox = createHomeworkOutbox({ queue, api, acknowledge: answer => { const state = submissionState(answer); return !state.error || state.submitted; } });
  await outbox.flush({ keepFailed: true });
  assert.deepEqual(stored, [{ eventId: 'fail', completedAt: '2026-01-01T00:00:00.000Z' }]);
});
