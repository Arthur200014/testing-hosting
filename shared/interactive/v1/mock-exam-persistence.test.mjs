import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MOCK_ATTEMPT_PHASES,
  confirmMockSubmissionResponse,
  createMockExamPersistence
} from './mock-exam-persistence.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

const base = {
  programId: 'EGE_MATH',
  studentId: 'student-1',
  variantId: 'variant-1',
  eventId: 'event-1',
  startedAt: 100,
  deadline: 7_300,
  answers: { 1: '12', 2: '' }
};

test('restores the exact current attempt after reload or reopen', () => {
  const storage = memoryStorage();
  createMockExamPersistence({ storage, now: () => 200 }).saveAttempt(base);
  const reopened = createMockExamPersistence({ storage, now: () => 300 });
  assert.deepEqual(reopened.loadCurrent(base), {
    ...base,
    studentKey: 'STUDENT-1',
    phase: MOCK_ATTEMPT_PHASES.IN_PROGRESS,
    updatedAt: 200
  });
});

test('keeps one stable eventId while answers change and after reopen', () => {
  const storage = memoryStorage();
  const first = createMockExamPersistence({ storage, now: () => 200 });
  first.saveAttempt(base);
  first.saveAttempt({ ...base, eventId: 'accidental-new-event', answers: { 1: '14', 2: '3' } });
  const saved = createMockExamPersistence({ storage }).loadAttempt(base);
  assert.equal(saved.eventId, 'event-1');
  assert.deepEqual(saved.answers, { 1: '14', 2: '3' });
});

test('queues before delivery and restores queued attempt state', () => {
  const storage = memoryStorage();
  const persistence = createMockExamPersistence({ storage, now: () => 250 });
  persistence.queueSubmission({
    snapshot: { ...base, result: { score: 1 } },
    payload: { action: 'submitAssignedMock', eventId: 'event-1', score: 1 }
  });
  const reopened = createMockExamPersistence({ storage });
  assert.equal(reopened.loadCurrent(base).phase, MOCK_ATTEMPT_PHASES.QUEUED);
  assert.equal(reopened.readOutbox().length, 1);
  assert.equal(reopened.readOutbox()[0].eventId, 'event-1');
});

test('keeps the retryable payload if saving attempt state fails afterwards', () => {
  const backing = memoryStorage();
  let writes = 0;
  const storage = {
    getItem: backing.getItem,
    setItem(key, value) {
      writes += 1;
      if (writes === 2) throw new Error('quota');
      backing.setItem(key, value);
    }
  };
  const persistence = createMockExamPersistence({ storage });
  assert.throws(() => persistence.queueSubmission({
    snapshot: base,
    payload: { eventId: 'event-1', score: 1 }
  }), /quota/);
  assert.equal(persistence.readOutbox().length, 1);
  assert.equal(persistence.readOutbox()[0].payload.score, 1);
});

test('outbox upserts the same event instead of creating duplicates', () => {
  const persistence = createMockExamPersistence({ storage: memoryStorage() });
  persistence.enqueue({ eventId: 'event-1', score: 1 });
  persistence.enqueue({ eventId: 'event-1', score: 2 });
  assert.equal(persistence.readOutbox().length, 1);
  assert.equal(persistence.readOutbox()[0].payload.score, 2);
});

test('does not dequeue malformed, rejected, incomplete, or mismatched receipts', async () => {
  const responses = [
    '<html>not json</html>',
    { ok: false, eventId: 'event-1' },
    { ok: true },
    { ok: true, eventId: 'another-event' }
  ];
  for (const response of responses) {
    const persistence = createMockExamPersistence({ storage: memoryStorage() });
    persistence.enqueue({ eventId: 'event-1' });
    const result = await persistence.flush({ submit: async () => response });
    assert.deepEqual(result, { confirmed: 0, failed: 1, pending: 1 });
    assert.equal(persistence.readOutbox()[0].attempts, 1);
  }
});

test('matching success or duplicate receipt confirms and dequeues the event', async () => {
  for (const response of [
    { ok: true, saved: true, eventId: 'event-1' },
    { ok: true, duplicate: true, result: { eventId: 'event-1' } }
  ]) {
    const storage = memoryStorage();
    const persistence = createMockExamPersistence({ storage, now: () => 500 });
    persistence.queueSubmission({ snapshot: base, payload: { eventId: 'event-1' } });
    const result = await persistence.flush({ submit: async () => response });
    assert.deepEqual(result, { confirmed: 1, failed: 0, pending: 0 });
    assert.equal(persistence.loadCurrent(base).phase, MOCK_ATTEMPT_PHASES.CONFIRMED);
    assert.equal(persistence.loadCurrent(base).confirmedAt, 500);
  }
});

test('offline flush keeps the event and a later flush delivers it once', async () => {
  const persistence = createMockExamPersistence({ storage: memoryStorage() });
  persistence.enqueue({ eventId: 'event-1' });
  let calls = 0;
  const submit = async payload => {
    calls += 1;
    return { ok: true, eventId: payload.eventId };
  };
  assert.deepEqual(await persistence.flush({ submit, isOnline: () => false }), {
    confirmed: 0, failed: 0, pending: 1
  });
  assert.equal(calls, 0);
  assert.deepEqual(await persistence.flush({ submit, isOnline: () => true }), {
    confirmed: 1, failed: 0, pending: 0
  });
  assert.equal(calls, 1);
});

test('isolates students, programs, and variants in local state', () => {
  const persistence = createMockExamPersistence({ storage: memoryStorage() });
  persistence.saveAttempt(base);
  persistence.saveAttempt({ ...base, studentId: 'student-2', eventId: 'event-2', answers: { 1: '99' } });
  persistence.saveAttempt({ ...base, variantId: 'variant-2', eventId: 'event-3', answers: { 1: '77' } });
  assert.equal(persistence.loadAttempt(base).answers[1], '12');
  assert.equal(persistence.loadAttempt({ ...base, studentId: 'student-2' }).answers[1], '99');
  assert.equal(persistence.loadAttempt({ ...base, variantId: 'variant-2' }).answers[1], '77');
});

test('completed result remains restorable after confirmation', async () => {
  const storage = memoryStorage();
  const persistence = createMockExamPersistence({ storage, now: () => 900 });
  persistence.queueSubmission({
    snapshot: { ...base, result: { score: 17, primary: 82 } },
    payload: { eventId: 'event-1' }
  });
  await persistence.flush({ submit: async () => ({ ok: true, eventId: 'event-1' }) });
  const reopened = createMockExamPersistence({ storage }).loadCurrent(base);
  assert.deepEqual(reopened.result, { score: 17, primary: 82 });
  assert.equal(reopened.phase, MOCK_ATTEMPT_PHASES.CONFIRMED);
});

test('ordinary autosave cannot downgrade a confirmed attempt', async () => {
  const storage = memoryStorage();
  const persistence = createMockExamPersistence({ storage, now: () => 900 });
  persistence.queueSubmission({ snapshot: base, payload: { eventId: 'event-1' } });
  await persistence.flush({ submit: async () => ({ ok: true, eventId: 'event-1' }) });
  const confirmed = persistence.loadCurrent(base);
  persistence.saveAttempt({ ...confirmed, answers: { 1: '12', 2: '' } });
  assert.equal(persistence.loadCurrent(base).phase, MOCK_ATTEMPT_PHASES.CONFIRMED);
});

test('receipt validation has no student-facing transport messages', () => {
  assert.throws(() => confirmMockSubmissionResponse({ ok: true }, { eventId: 'event-1' }));
  const source = confirmMockSubmissionResponse.toString();
  assert.doesNotMatch(source, /сохран|отправ|сервер|устройств/i);
});
