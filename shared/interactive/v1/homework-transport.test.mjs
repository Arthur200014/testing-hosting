import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createHomeworkIdentity, createHomeworkQueueAdapter, createHomeworkOutbox, createHomeworkTransport,
  decideHomeworkSubmission,
  parseDz1Student, parseDz23Student, parseSubmissionResponse, submissionState
} from './homework-transport.js';

test('homework submission policy allows partial work but rejects a fully blank attempt', () => {
  assert.deepEqual(decideHomeworkSubmission(['', '  ', null]), {
    answers: ['', '  ', null], totalCount: 3, filledCount: 0, emptyCount: 3,
    canSubmit: false, mode: 'official', shouldQueue: false
  });
  assert.deepEqual(decideHomeworkSubmission(['42', '', '  ']), {
    answers: ['42', '', '  '], totalCount: 3, filledCount: 1, emptyCount: 2,
    canSubmit: true, mode: 'official', shouldQueue: true
  });
});

test('a submitted assignment becomes training-only without blocking local grading', () => {
  assert.deepEqual(decideHomeworkSubmission(['0', ''], { officialSubmitted: true }), {
    answers: ['0', ''], totalCount: 2, filledCount: 1, emptyCount: 1,
    canSubmit: true, mode: 'training', shouldQueue: false
  });
});

test('homework transport stays on GAS by default and requires an explicit ASP.NET config', () => {
  const gas = createHomeworkTransport({ config: undefined, parseStudent: () => null });
  assert.equal(typeof gas.validateStudentCode, 'function');
  assert.equal('listAssignments' in gas, false);

  const aspNet = createHomeworkTransport({
    config: { provider: 'aspnet', baseUrl: 'https://api.tests.invalid', workspace: 'school' },
    fetchImpl: async () => { throw new Error('network should not run while constructing the provider'); }
  });
  assert.equal(typeof aspNet.listAssignments, 'function');
  assert.throws(() => createHomeworkTransport({ config: { provider: 'other' } }), /Unsupported homework provider/);
});

test('student parsers retain dz1 and dz2/3 response shape differences', () => {
  assert.deepEqual(parseDz1Student({ result: { student: { studentID: 17, fullName: 'Ada' } } }, 'AB'), {
    id: '17', name: 'Ada', code: 'AB', verified: true
  });
  assert.equal(parseDz1Student({ valid: false, id: 1, name: 'No' }, 'AB'), null);
  assert.deepEqual(parseDz23Student({ result: { student: { id: 18, name: 'Lin' } } }, 'CD'), {
    id: '18', name: 'Lin', code: 'CD'
  });
  assert.deepEqual(parseDz23Student({ data: { student: { id: 19, name: 'Mira' } } }, 'EF'), {
    id: '19', name: 'Mira', code: 'EF'
  });
  assert.deepEqual(parseDz23Student({ data: { requestId: 'meta' }, result: { student: { id: 20, name: 'Ilya' } } }, 'GH'), {
    id: '20', name: 'Ilya', code: 'GH'
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
  assert.deepEqual(submissionState({ data: { hasSubmitted: true } }), { submitted: true, error: false });
  assert.deepEqual(submissionState({ result: { submittedThisMonth: true } }), { submitted: true, error: false });
  assert.deepEqual(submissionState({ data: { result: { exists: true } } }), { submitted: true, error: false });
});

test('GAS transport rejects an HTML HTTP 200 so the outbox can retry it', async () => {
  const api = createHomeworkTransport({
    config: undefined,
    parseStudent: () => null,
    fetchImpl: async () => ({ ok: true, text: async () => '<!doctype html><title>Page Not Found</title>' })
  });
  await assert.rejects(
    api.submitResult({ action: 'submitHomework', eventId: 'event-123' }),
    /invalid-response/
  );
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
  assert.deepEqual(stored.a, { payload: { eventId: 'a', answer: 4, completedAt: new Date(40).toISOString() }, createdAt: 40, lastAttemptAt: 0 });
  queue.markAttempt('a');
  assert.equal(stored.a.lastAttemptAt, 50);
  queue.remove('a');
  assert.deepEqual(stored, {});
});

test('array adapter retains raw shape plus stable completion timestamp and duplicate replacement', () => {
  let stored = [];
  let time = 1000;
  const queue = createHomeworkQueueAdapter({ read: () => stored, write: value => { stored = structuredClone(value); }, shape: 'array', now: () => time });
  queue.enqueue({ eventId: 'a', studentId: 'provisional' });
  time = 2000;
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

test('reload retry preserves the originally queued event and completion instant', async () => {
  let stored = [];
  const firstQueue = createHomeworkQueueAdapter({
    read: () => stored, write: value => { stored = structuredClone(value); }, shape: 'array', now: () => 1234
  });
  firstQueue.enqueue({ eventId: 'historical-event', studentCode: 'ABCD' });
  const historical = structuredClone(stored[0]);
  const failing = createHomeworkOutbox({
    queue: firstQueue,
    api: { submitResult: async () => { throw new Error('offline'); }, sendResultOnExit() {} },
    acknowledge: () => true
  });
  await failing.flush();

  const retried = [];
  const reloadedQueue = createHomeworkQueueAdapter({
    read: () => stored, write: value => { stored = structuredClone(value); }, shape: 'array', now: () => 9999
  });
  const reloaded = createHomeworkOutbox({
    queue: reloadedQueue,
    api: { submitResult: async payload => { retried.push(payload); return { success: true }; }, sendResultOnExit() {} },
    acknowledge: () => true
  });
  await reloaded.flush();

  assert.deepEqual(retried, [historical]);
  assert.equal(retried[0].eventId, 'historical-event');
  assert.equal(retried[0].completedAt, new Date(1234).toISOString());
  assert.deepEqual(stored, []);
});

test('exit delivery visits queued results without acknowledging or removing them', () => {
  let stored = [{ eventId: 'exit-event', studentCode: 'ABCD', completedAt: '2026-10-06T12:00:00.000Z' }];
  const sent = [];
  const queue = createHomeworkQueueAdapter({ read: () => stored, write: value => { stored = structuredClone(value); }, shape: 'array' });
  const outbox = createHomeworkOutbox({
    queue,
    api: { submitResult() {}, sendResultOnExit: (payload, mode) => sent.push({ payload, mode }) },
    acknowledge: () => true
  });
  outbox.sendOnExit('fetch');
  assert.deepEqual(sent, [{ payload: stored[0], mode: 'fetch' }]);
  assert.equal(stored.length, 1);
});

test('all EGA/6 homework pages use the provider factory and create code-bound submissions', async () => {
  for (const page of ['dz1.html', 'dz2.html', 'dz3.html']) {
    const source = await readFile(new URL(`../../../EGA/6/${page}`, import.meta.url), 'utf8');
    assert.match(source, /createHomeworkTransport\(\{/);
    assert.doesNotMatch(source, /createHomeworkApi\(\{/);
    assert.match(source, /studentCode\s*:\s*student\.code/);
  }
});

test('EGA/7–10 homework pages use the canonical transport, identity, queue, and submit boundaries', async () => {
  const pages = [
    ...['dz1.html', 'dz2.html', 'dz3.html'].map(page => ['7', page]),
    ...['dz1.html', 'dz2.html'].map(page => ['8', page]),
    ...['dz1.html', 'dz2.html', 'dz3.html'].map(page => ['9', page]),
    ...['dz1.html', 'dz2.html', 'dz3.html'].map(page => ['10', page])
  ];

  assert.equal(pages.length, 11);
  for (const [grade, page] of pages) {
    const label = `EGA/${grade}/${page}`;
    const source = await readFile(new URL(`../../../EGA/${grade}/${page}`, import.meta.url), 'utf8');
    assert.match(source, /<script\s+type=["']module["']>/, `${label}: module script`);
    assert.match(source, /from\s+["']\.\.\/\.\.\/shared\/interactive\/v1\/homework-transport\.js["']/, `${label}: canonical import`);
    assert.match(source, /createHomeworkTransport\s*\(\s*\{/, `${label}: provider transport`);
    assert.match(source, /createHomeworkIdentity\s*\(\s*\{/, `${label}: shared identity adapter`);
    assert.match(source, /createHomeworkQueueAdapter\s*\(\s*\{[^}]*shape\s*:\s*["']array["']/s, `${label}: array queue adapter`);
    assert.match(source, /createHomeworkOutbox\s*\(\s*\{/, `${label}: shared outbox`);
    assert.match(source, /createHomeworkOutbox\s*\(\s*\{[^}]*api\s*:\s*homeworkApi/s, `${label}: outbox uses shared transport`);
    assert.match(source, /studentCode\s*:\s*(?:state\.)?student\.code/, `${label}: code-bound submit payload`);
    assert.match(source, /(?:enqueue(?:Result)?|homeworkQueue\.enqueue)\s*\(\s*payload\s*\)/, `${label}: submit payload enters shared queue`);
    assert.match(source, /(?:homeworkApi|postApi)\s*\.?(?:submitResult|\s*\()\s*\(?\s*\{\s*action\s*:\s*["']checkHomeworkSubmission["']/, `${label}: check uses shared submit boundary`);
    assert.match(source, /action\s*:\s*["']submitHomework["']/, `${label}: submission action exists`);
    assert.doesNotMatch(source, /https:\/\/script\.google\.com\/macros\/s\//i, `${label}: no embedded GAS URL`);
    assert.doesNotMatch(source, /(?:window\.)?JSONP\b|callback\s*[:=]\s*["']|script\.src\s*=|<script[^>]+src=["'][^"']*script\.google\.com/i, `${label}: no page-owned JSONP`);
    assert.doesNotMatch(source, /fetch\s*\([^)]*API_URL|fetch\s*\(\s*["'][^"']*\/result(?:\?|["'])/i, `${label}: no direct API result fetch`);
  }
});

test('EGA/4 and EGA/5 homework pages persist official attempts in the shared outbox before sending', async () => {
  const pages = [
    ['4', 'dz.html'],
    ['5', 'dz1.html'],
    ['5', 'dz2.html']
  ];
  for (const [task, page] of pages) {
    const label = `EGA/${task}/${page}`;
    const source = await readFile(new URL(`../../../EGA/${task}/${page}`, import.meta.url), 'utf8');
    assert.match(source, /createHomeworkQueueAdapter\s*\(\s*\{[^}]*shape\s*:\s*["']array["']/s, `${label}: array queue adapter`);
    assert.match(source, /createHomeworkOutbox\s*\(\s*\{[^}]*api\s*:\s*homeworkApi/s, `${label}: shared outbox`);
    assert.match(source, /homeworkQueue\.enqueue\s*\(\s*payload\s*\)/, `${label}: official payload is persisted before delivery`);
    assert.match(source, /pendingHomeworkResults:/, `${label}: durable per-assignment queue`);
    assert.match(source, /(?:await\s+)?flushQueue\s*\(\s*\)/, `${label}: persisted queue is flushed through the shared outbox`);
  }
});
