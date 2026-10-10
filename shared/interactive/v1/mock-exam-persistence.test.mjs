import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MOCK_ATTEMPT_PHASES,
  confirmMockSubmissionResponse,
  createMockExamPersistence,
  createMockSubmissionLookup,
  installOgeMockPersistenceBridge,
  stableMockSubmissionEventId
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

test('rekeys only an in-progress saved attempt', async () => {
  const persistence = createMockExamPersistence({ storage: memoryStorage() });
  persistence.saveAttempt(base);
  assert.equal(persistence.rekeyAttempt(base, 'stable-slot-id').eventId, 'stable-slot-id');
  persistence.queueSubmission({ snapshot: { ...base, eventId: 'stable-slot-id' }, payload: { eventId: 'stable-slot-id' } });
  assert.equal(persistence.rekeyAttempt(base, 'must-not-change').eventId, 'stable-slot-id');
  await persistence.flush({ submit: async () => ({ ok: true, eventId: 'stable-slot-id' }) });
  assert.equal(persistence.rekeyAttempt(base, 'must-not-change').eventId, 'stable-slot-id');
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

test('stable event IDs use the same normalized student, program, and mock slot', () => {
  const first = stableMockSubmissionEventId({ studentCode: ' ab-12 ', programId: 'OGE_MATH', mockId: 'mock-7' });
  assert.equal(first, stableMockSubmissionEventId({ studentId: 'AB-12', programId: 'OGE_MATH', mockId: 'mock-7' }));
  assert.notEqual(first, stableMockSubmissionEventId({ studentId: 'AB-12', programId: 'EGE_MATH', mockId: 'mock-7' }));
  assert.ok(first.length >= 8 && first.length <= 120);
  assert.match(first, /^[A-Za-z0-9_-]+$/);
});

test('canonical student ID gives one event across alternate accepted login credentials', () => {
  const byInviteCode = stableMockSubmissionEventId({
    studentId: 'canonical-student-uuid',
    studentCode: 'invite-19',
    programId: 'OGE_MATH',
    mockId: 'mock-7'
  });
  const byStudentId = stableMockSubmissionEventId({
    studentId: 'canonical-student-uuid',
    studentCode: 'canonical-student-uuid',
    programId: 'OGE_MATH',
    mockId: 'mock-7'
  });
  assert.equal(byStudentId, byInviteCode);
});

test('explicit already-submitted receipts require matching student and mock identity', () => {
  const payload = { eventId: 'event-1', studentId: 'S-1', programId: 'OGE_MATH', mockId: 'm-1' };
  assert.equal(confirmMockSubmissionResponse({ ok: true, alreadySubmitted: true, studentId: 'S-1', mockId: 'm-1' }, payload).alreadySubmitted, true);
  assert.throws(() => confirmMockSubmissionResponse({ ok: true, alreadySubmitted: true, studentId: 'S-2', mockId: 'm-1' }, payload), /identity/);
  assert.throws(() => confirmMockSubmissionResponse({ ok: true, alreadySubmitted: true, studentId: 'S-1', mockId: 'm-2' }, payload), /identity/);
  assert.throws(() => confirmMockSubmissionResponse({ ok: true, alreadySubmitted: true, studentId: 'S-1', mockId: 'm-1', programId: 'OTHER' }, payload), /identity/);
});

function fakeJsonpRoot() {
  const scripts = [];
  const root = {
    setTimeout,
    clearTimeout,
    URLSearchParams,
    scripts,
    document: {
      head: { appendChild(script) { scripts.push(script); script.parentNode = this; } },
      createElement() { return { remove() { this.removed = true; }, setAttribute() {} }; }
    }
  };
  return root;
}

test('JSONP lookup targets Пробники and cleans the callback and script on success', async () => {
  const root = fakeJsonpRoot();
  const lookup = createMockSubmissionLookup({ url: 'https://example.test/api', root, timeoutMs: 100 });
  const pending = lookup({ studentId: 'S 1', programId: 'OGE_MATH', mockId: 'M/1' });
  const script = root.scripts[0];
  const query = new URL(script.src).searchParams;
  assert.equal(query.get('sheet'), 'Пробники');
  assert.match(query.get('tq'), /^select A,B,C,K,F,G,L,M,N,I,O /);
  assert.match(query.get('tq'), /B='S 1'.*C='M\/1'.*K='OGE_MATH'.*order by I desc/);
  const callback = query.get('tqx').split('responseHandler:')[1];
  root[callback]({
    status: 'ok',
    table: { rows: [{ c: [
      { v: 'event-1' }, { v: 'S 1' }, { v: 'M/1' }, { v: 'OGE_MATH' },
      { v: '' }, { v: 22 }, { v: 5 }, { v: 31 }, { v: 71 },
      { v: '2026-10-10T12:00:00.000Z' }, { v: '{"1":"7","2":""}' }
    ] }] }
  });
  assert.deepEqual(await pending, {
    submitted: true,
    eventId: 'event-1',
    studentId: 'S 1',
    mockId: 'M/1',
    programId: 'OGE_MATH',
    testScore: null,
    primaryScore: 22,
    gradeMark: 5,
    maxPrimaryScore: 31,
    scorePercent: 71,
    submittedAt: '2026-10-10T12:00:00.000Z',
    answers: { 1: '7', 2: '' }
  });
  assert.equal(script.removed, true);
  assert.equal(root[callback], undefined);
});

test('JSONP lookup keeps legacy submission blocking before answersJson column exists', async () => {
  const root = fakeJsonpRoot();
  const lookup = createMockSubmissionLookup({ url: 'https://example.test/api', root, timeoutMs: 100 });
  const pending = lookup({ studentId: 'S1', programId: 'EGE_MATH', mockId: 'M1' });
  const firstScript = root.scripts[0];
  const firstQuery = new URL(firstScript.src).searchParams;
  const firstCallback = firstQuery.get('tqx').split('responseHandler:')[1];
  root[firstCallback]({
    status: 'error',
    errors: [{ reason: 'invalid_query', detailed_message: 'Invalid query: NO_COLUMN: O' }]
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  const fallbackScript = root.scripts[1];
  assert.ok(fallbackScript, 'legacy lookup should be requested');
  const fallbackQuery = new URL(fallbackScript.src).searchParams;
  assert.match(fallbackQuery.get('tq'), /^select A,B,C,K,F,G,L,M,N /);
  const fallbackCallback = fallbackQuery.get('tqx').split('responseHandler:')[1];
  root[fallbackCallback]({
    status: 'ok',
    table: { rows: [{ c: [
      { v: 'event-legacy' }, { v: 'S1' }, { v: 'M1' }, { v: 'EGE_MATH' },
      { v: 78 }, { v: 18 }, { v: '' }, { v: 33 }, { v: 55 }
    ] }] }
  });
  assert.deepEqual(await pending, {
    submitted: true,
    eventId: 'event-legacy',
    studentId: 'S1',
    mockId: 'M1',
    programId: 'EGE_MATH',
    testScore: 78,
    primaryScore: 18,
    gradeMark: null,
    maxPrimaryScore: 33,
    scorePercent: 55,
    submittedAt: '',
    answers: null
  });
  assert.equal(firstScript.removed, true);
  assert.equal(fallbackScript.removed, true);
});

test('JSONP lookup times out and cleans the callback and script', async () => {
  const root = fakeJsonpRoot();
  const lookup = createMockSubmissionLookup({ url: 'https://example.test/api', root, timeoutMs: 5 });
  const pending = lookup({ studentId: 'S1', programId: 'OGE_MATH', mockId: 'M1' });
  const script = root.scripts[0];
  const callback = new URL(script.src).searchParams.get('tqx').split('responseHandler:')[1];
  await assert.rejects(pending, /timed out/);
  assert.equal(script.removed, true);
  assert.equal(root[callback], undefined);
});

function fakeOgeRoot({
  online = true,
  lookup = async () => false,
  postResult = { ok: true },
  canonicalStudentId = 'S-1',
  validateResult = code => ({ studentId: code })
} = {}) {
  const listeners = new Map();
  const storage = memoryStorage();
  const docListeners = new Map();
  const root = {
    localStorage: storage,
    navigator: { onLine: online },
    document: {
      visibilityState: 'visible',
      getElementById: () => null,
      addEventListener: (name, fn) => docListeners.set(name, fn),
      removeEventListener: name => docListeners.delete(name)
    },
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name),
    setInterval: () => 1,
    clearInterval() {},
    __OGE2027_MOCK_DIAGNOSTICS__: {
      mockId: 'MOCK-7',
      getState: () => ({
        student: { studentId: canonicalStudentId, code: 'S-1' },
        programId: 'OGE_MATH',
        mockId: 'MOCK-7',
        variantId: 'VAR-7',
        answers: ['A'],
        startedAt: 10
      })
    },
    async loadLocal() { return null; },
    saveLocal() {},
    async apiPost(payload) {
      root.posts.push(payload);
      return { ...postResult, eventId: payload.eventId };
    },
    startAttempt() {},
    finish() {},
    async validateStudent(code) { return validateResult(code); },
    posts: [],
    lookups: [],
    _lookup: lookup
  };
  root.__lookup = async input => { root.lookups.push(input); return root._lookup(input); };
  return { root, listeners, docListeners };
}

test('OGE bridge queues offline submission and retries on online with stable receipt', async () => {
  const { root, listeners } = fakeOgeRoot({ online: false });
  const bridge = installOgeMockPersistenceBridge({ root, lookup: root.__lookup, programId: 'OGE_MATH' });
  await root.validateStudent('S-1');
  const payload = { action: 'submitAssignedMock', studentId: 'S-1', programId: 'OGE_MATH', mockId: 'MOCK-7', variantId: 'VAR-7' };
  await assert.rejects(root.apiPost(payload), /remains queued/);
  assert.equal(bridge.persistence.readOutbox().length, 1);
  assert.equal(root.posts.length, 0);
  root.navigator.onLine = true;
  await listeners.get('online')();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(root.posts.length, 1);
  assert.equal(bridge.persistence.readOutbox().length, 0);
  assert.equal(root.posts[0].eventId, stableMockSubmissionEventId(payload));
  bridge.dispose();
});

test('OGE bridge adds the converted grade to the durable spreadsheet payload', async () => {
  const { root } = fakeOgeRoot();
  const bridge = installOgeMockPersistenceBridge({ root, lookup: root.__lookup, programId: 'OGE_MATH' });
  await root.validateStudent('S-1');
  await root.apiPost({
    action: 'submitAssignedMock',
    studentId: 'S-1',
    programId: 'OGE_MATH',
    mockId: 'MOCK-7',
    variantId: 'VAR-7',
    primaryScore: 15,
    maxPrimaryScore: 19,
    scorePercent: 79,
    durationSeconds: 60
  });
  assert.equal(root.posts.length, 1);
  assert.equal(root.posts[0].gradeMark, 4);
  const saved = bridge.persistence.loadCurrent({ programId: 'OGE_MATH', studentCode: 'S-1' });
  assert.equal(saved.result.gradeMark, 4);
  assert.equal(saved.result.finalized, false);
  bridge.dispose();
});

test('OGE lookup hit synthesizes an identity receipt and suppresses POST', async () => {
  const { root } = fakeOgeRoot({ lookup: async () => true });
  const bridge = installOgeMockPersistenceBridge({ root, lookup: root.__lookup });
  await root.validateStudent('S-1');
  const payload = { action: 'submitAssignedMock', studentId: 'S-1', programId: 'OGE_MATH', mockId: 'MOCK-7', variantId: 'VAR-7' };
  const receipt = await root.apiPost(payload);
  assert.equal(receipt.alreadySubmitted, true);
  assert.equal(root.posts.length, 0);
  assert.equal(bridge.persistence.readOutbox().length, 0);
  assert.equal(bridge.isLocked(), true);
  bridge.dispose();
});

test('OGE lookup failure preserves queued submission for a later retry', async () => {
  let fail = true;
  const { root } = fakeOgeRoot({ lookup: async () => { if (fail) throw new Error('lookup unavailable'); return false; } });
  const bridge = installOgeMockPersistenceBridge({ root, lookup: root.__lookup });
  fail = false;
  await root.validateStudent('S-1');
  fail = true;
  const payload = { action: 'submitAssignedMock', studentId: 'S-1', programId: 'OGE_MATH', mockId: 'MOCK-7', variantId: 'VAR-7' };
  await assert.rejects(root.apiPost(payload), /remains queued/);
  assert.equal(bridge.persistence.readOutbox().length, 1);
  fail = false;
  await bridge.flush();
  assert.equal(bridge.persistence.readOutbox().length, 0);
  assert.equal(root.posts.length, 1);
  bridge.dispose();
});

test('OGE submission waits durably for canonical identity and delivers after validation recovers', async () => {
  let validationAvailable = false;
  const { root } = fakeOgeRoot({
    canonicalStudentId: '',
    validateResult: () => validationAvailable ? { studentId: 'CANONICAL-S-1' } : null
  });
  const bridge = installOgeMockPersistenceBridge({ root, lookup: root.__lookup });
  await assert.rejects(root.apiPost({
    action: 'submitAssignedMock',
    studentCode: 'S-1',
    programId: 'OGE_MATH',
    mockId: 'MOCK-7',
    variantId: 'VAR-7'
  }), /remains queued/);
  assert.equal(root.posts.length, 0);
  assert.equal(bridge.persistence.readOutbox().length, 1);
  assert.equal(bridge.persistence.readOutbox()[0].payload.awaitingCanonicalIdentity, true);
  validationAvailable = true;
  await bridge.flush();
  assert.equal(bridge.persistence.readOutbox().length, 0);
  assert.equal(root.posts.length, 1);
  assert.equal(root.posts[0].studentId, 'CANONICAL-S-1');
  assert.equal(root.posts[0].eventId, stableMockSubmissionEventId({
    studentId: 'CANONICAL-S-1',
    programId: 'OGE_MATH',
    mockId: 'MOCK-7'
  }));
  bridge.dispose();
});
