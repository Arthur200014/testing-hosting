import test from 'node:test';
import assert from 'node:assert/strict';
import { createAspNetApiClient, AspNetApiError, mapLegacyTestAttempt } from './aspnet-api-client.js';
import { browserDataProvider, createAspNetTestAttemptDataProvider } from './platform-data.js';
import { createAspNetTestAttemptApi, platformApi } from './platform-api.js';
import { createResultOutbox } from './result-outbox.js';

const session = {
  accessToken: 'access-token-value', tokenType: 'Bearer', expiresAt: '2030-01-02T03:04:05Z',
  student: { id: 'student-7', displayName: 'Ada Lovelace', programId: 'EGE_MATH', workspaceId: 'room-a' }
};

function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

test('posts student code as JSON and normalizes the issued session', async () => {
  let request;
  const client = createAspNetApiClient({
    baseUrl: 'https://api.example.test/', workspace: ' room-a ',
    fetchImpl: async (...args) => { request = args; return response(session); }
  });
  const result = await client.validateStudentCode('secret-code');

  assert.equal(request[0], 'https://api.example.test/api/v1/student-sessions');
  assert.equal(request[1].method, 'POST');
  assert.deepEqual(request[1].headers, { Accept: 'application/json', 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(request[1].body), { workspace: 'room-a', code: 'secret-code' });
  assert.equal(request[0].includes('secret-code'), false);
  assert.deepEqual(result, {
    ok: true, studentId: 'student-7', studentName: 'Ada Lovelace', programId: 'EGE_MATH', workspaceId: 'room-a',
    student: session.student, accessToken: session.accessToken, tokenType: 'Bearer', expiresAt: session.expiresAt
  });
});

test('rejects malformed successful response without exposing response contents', async () => {
  const client = createAspNetApiClient({ baseUrl: 'https://api.example.test', workspace: 'room-a', fetchImpl: async () => response({ code: 'secret-code' }) });
  await assert.rejects(client.validateStudentCode('secret-code'), error => {
    assert.ok(error instanceof AspNetApiError);
    assert.equal(error.code, 'INVALID_RESPONSE');
    assert.equal(error.message.includes('secret-code'), false);
    return true;
  });
});

test('401 is generic and 429 is a typed rate limit error', async () => {
  for (const [status, code] of [[401, 'UNAUTHORIZED'], [429, 'RATE_LIMITED']]) {
    const client = createAspNetApiClient({ baseUrl: 'https://api.example.test', workspace: 'room-a', fetchImpl: async () => response({ message: 'secret-code leaked' }, status) });
    await assert.rejects(client.validateStudentCode('secret-code'), error => {
      assert.ok(error instanceof AspNetApiError);
      assert.equal(error.status, status);
      assert.equal(error.code, code);
      assert.equal(error.message.includes('secret-code'), false);
      return true;
    });
  }
});

test('aborts a request at the configured timeout', async () => {
  let signal;
  const client = createAspNetApiClient({ baseUrl: 'https://api.example.test', workspace: 'room-a', timeoutMs: 5,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      signal = options.signal;
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })
  });
  await assert.rejects(client.validateStudentCode('secret-code'), error => error.code === 'TIMEOUT');
  assert.equal(signal.aborted, true);
});

test('validates configuration before creating a client', () => {
  assert.throws(() => createAspNetApiClient({ baseUrl: '/relative', workspace: 'room-a', fetchImpl: async () => {} }), TypeError);
  assert.throws(() => createAspNetApiClient({ baseUrl: 'https://api.example.test', workspace: ' ', fetchImpl: async () => {} }), TypeError);
});

test('the default data provider remains on the existing platform API', () => {
  assert.equal(browserDataProvider.api, platformApi);
  assert.equal(browserDataProvider.api.validateStudentCode, platformApi.validateStudentCode);
});


test('maps legacy test result aliases to the strict attempt contract without identity fields', () => {
  const mapped = mapLegacyTestAttempt({
    action: 'submitTest', eventId: 'evt-map-1', studentCode: 'SECRET', studentId: 'student-1',
    studentName: 'Synthetic', programId: 'EGE_MATH', testId: 'test-1', topicName: 'Topic',
    taskNumber: 6, correctCount: 2, totalCount: 3, scorePercent: 67,
    startedAt: '2026-10-05T10:00:00Z', finishedAt: '2026-10-05T10:01:00Z',
    completedAt: '2026-10-06T10:00:00Z', durationSeconds: 30, schemaVersion: 1
  });
  assert.deepEqual(mapped, {
    eventId: 'evt-map-1', testId: 'test-1', topic: 'Topic', taskNumber: 6,
    correct: 2, total: 3, percent: 66, startedAt: '2026-10-05T10:00:30.000Z',
    completedAt: '2026-10-05T10:01:00.000Z', durationSeconds: 30, schemaVersion: '1'
  });
  assert.equal('studentCode' in mapped, false);
  assert.equal('studentId' in mapped, false);
  assert.equal('programId' in mapped, false);
});

test('lazy student-session exchange is cached per code and test writes carry the matching bearer', async () => {
  const calls = [];
  const sessionFor = code => ({
    accessToken: 'token-' + code, tokenType: 'Bearer', expiresAt: '2030-01-02T03:04:05Z',
    student: { id: 'student-' + code, displayName: 'Student ' + code, programId: 'EGE_MATH', workspaceId: 'room-a' }
  });
  const attemptFor = body => ({
    attemptId: 'attempt-' + body.eventId, eventId: body.eventId, duplicate: false,
    createdAt: '2026-10-06T00:00:00Z',
    monthlyBest: { attemptId: 'attempt-' + body.eventId, percent: body.percent,
      durationSeconds: body.durationSeconds, completedAt: body.completedAt }
  });
  const client = createAspNetApiClient({
    baseUrl: 'https://api.example.test', workspace: 'room-a',
    now: () => Date.parse('2026-10-06T00:00:00Z'),
    fetchImpl: async (url, options) => {
      calls.push([url, options]);
      if (url.endsWith('/student-sessions')) {
        const code = JSON.parse(options.body).code.toUpperCase();
        return response(sessionFor(code));
      }
      return response(attemptFor(JSON.parse(options.body)), 201);
    }
  });
  const payload = code => ({ action: 'submitTest', eventId: 'evt-' + code, studentCode: code,
    testId: 'test', topicName: 'Topic', taskNumber: 6, correctCount: 8, totalCount: 10,
    durationSeconds: 30, finishedAt: '2026-10-05T23:59:30Z', schemaVersion: 1 });
  await client.submitResult(payload('a'));
  await client.submitResult({ ...payload('a'), eventId: 'evt-a-2' });
  await client.submitResult(payload('b'));

  assert.equal(calls.filter(([url]) => url.endsWith('/student-sessions')).length, 2);
  const posts = calls.filter(([url]) => url.endsWith('/test-attempts'));
  assert.equal(posts.length, 3);
  assert.equal(posts[0][1].headers.Authorization, 'Bearer token-A');
  assert.equal(posts[1][1].headers.Authorization, 'Bearer token-A');
  assert.equal(posts[2][1].headers.Authorization, 'Bearer token-B');
});

test('test attempt receipt is normalized for legacy callers and 409 is typed', async () => {
  let conflict = false;
  const client = createAspNetApiClient({
    baseUrl: 'https://api.example.test', workspace: 'room-a',
    getStudentCode: () => 'student-code',
    now: () => Date.parse('2026-10-06T00:00:00Z'),
    fetchImpl: async (url, options) => {
      if (url.endsWith('/student-sessions')) return response({
        accessToken: 'token', tokenType: 'Bearer', expiresAt: '2030-01-02T03:04:05Z',
        student: { id: 'student', displayName: 'Synthetic', programId: 'EGE_MATH', workspaceId: 'room-a' }
      });
      if (conflict) return response({}, 409);
      const body = JSON.parse(options.body);
      return response({
        attemptId: 'attempt-1', eventId: body.eventId, duplicate: true, createdAt: '2026-10-06T00:00:00Z',
        monthlyBest: { attemptId: 'attempt-1', percent: body.percent,
          durationSeconds: body.durationSeconds, completedAt: body.completedAt }
      });
    }
  });
  const payload = { action: 'submitTest', eventId: 'evt-receipt', testId: 'test', topicId: 'topic',
    taskNumber: 6, score: 8, maxScore: 10, durationSec: 12,
    finishedAt: '2026-10-05T23:59:30Z', schemaVersion: '1' };
  const receipt = await client.submitResult(payload);
  assert.equal(receipt.saved, true);
  assert.equal(receipt.duplicate, true);
  assert.equal(receipt.keptBest, true);
  assert.equal(receipt.scorePercent, 80);
  conflict = true;
  await assert.rejects(client.submitResult({ ...payload, eventId: 'evt-conflict' }),
    error => error instanceof AspNetApiError && error.code === 'CONFLICT');
});

test('exit delivery uses authenticated keepalive only after a live session exists', async () => {
  const calls = [];
  const client = createAspNetApiClient({
    baseUrl: 'https://api.example.test', workspace: 'room-a',
    now: () => Date.parse('2026-10-06T00:00:00Z'),
    fetchImpl: async (url, options) => {
      calls.push([url, options]);
      if (url.endsWith('/student-sessions')) return response({
        accessToken: 'exit-token', tokenType: 'Bearer', expiresAt: '2030-01-02T03:04:05Z',
        student: { id: 'student', displayName: 'Synthetic', programId: 'EGE_MATH', workspaceId: 'room-a' }
      });
      return response({});
    }
  });
  const payload = { action: 'submitTest', eventId: 'evt-exit', studentCode: 'exit-code',
    testId: 'test', topicName: 'Topic', taskNumber: 6, correctCount: 1, totalCount: 1,
    durationSeconds: 1, finishedAt: '2026-10-05T23:59:30Z', schemaVersion: 1 };
  assert.equal(client.sendResultOnExit(payload), false);
  await client.validateStudentCode('exit-code');
  assert.equal(client.sendResultOnExit(payload), true);
  await Promise.resolve();
  const [, options] = calls.at(-1);
  assert.equal(options.keepalive, true);
  assert.equal(options.headers.Authorization, 'Bearer exit-token');
});

test('opt-in ASP.NET test-attempt API keeps legacy auth URL and default provider unchanged', async () => {
  const legacy = {
    url: 'https://legacy.example.test/exec',
    verifyTeacher: async () => true,
    validateStudentCode: async () => ({ legacy: true })
  };
  const api = createAspNetTestAttemptApi({
    baseUrl: 'https://api.example.test', workspace: 'room-a', legacyApi: legacy,
    fetchImpl: async () => response({}, 500)
  });
  assert.equal(api.url, legacy.url);
  assert.equal(await api.verifyTeacher('x'), true);
  assert.deepEqual(await api.validateStudentCode('x'), { legacy: true });
  assert.equal(platformApi, browserDataProvider.api);
  const provider = createAspNetTestAttemptDataProvider({
    baseUrl: 'https://api.example.test', workspace: 'room-a', legacyApi: legacy,
    fetchImpl: async () => response({}, 500)
  });
  assert.notEqual(provider.api, platformApi);
  assert.equal(provider.api.url, legacy.url);
});


test('outbox retry after client recreation preserves eventId and completion instant', async () => {
  const memory = new Map();
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value)
  };
  const canonicalPosts = [];
  let failAttempt = true;
  const fetchImpl = async (url, options) => {
    if (url.endsWith('/student-sessions')) return response({
      accessToken: 'retry-token', tokenType: 'Bearer', expiresAt: '2030-01-02T03:04:05Z',
      student: { id: 'student', displayName: 'Synthetic', programId: 'EGE_MATH', workspaceId: 'room-a' }
    });
    const body = JSON.parse(options.body);
    canonicalPosts.push(body);
    if (failAttempt) {
      failAttempt = false;
      throw new Error('synthetic network failure');
    }
    return response({
      attemptId: 'attempt-retry', eventId: body.eventId, duplicate: false,
      createdAt: '2026-10-06T00:00:00Z',
      monthlyBest: { attemptId: 'attempt-retry', percent: body.percent,
        durationSeconds: body.durationSeconds, completedAt: body.completedAt }
    }, 201);
  };
  const payload = {
    action: 'submitTest', eventId: 'evt-offline-retry', studentCode: 'student-code',
    testId: 'test', topicName: 'Topic', taskNumber: 6, correctCount: 7, totalCount: 10,
    durationSeconds: 45, startedAt: '2026-10-05T23:58:30Z',
    finishedAt: '2026-10-05T23:59:15Z', completedAt: '2026-10-06T12:00:00Z', schemaVersion: 1
  };
  try {
    const firstClient = createAspNetApiClient({
      baseUrl: 'https://api.example.test', workspace: 'room-a', fetchImpl,
      now: () => Date.parse('2026-10-06T00:00:00Z')
    });
    const firstOutbox = createResultOutbox({ key: 'pending:test', api: firstClient, isOnline: () => true });
    firstOutbox.queue(payload, 'student-1');
    await firstOutbox.flush();
    assert.equal(firstOutbox.read().length, 1);

    // Simulate reload: the queue survives but the in-memory bearer cache does not.
    const secondClient = createAspNetApiClient({
      baseUrl: 'https://api.example.test', workspace: 'room-a', fetchImpl,
      now: () => Date.parse('2026-10-06T00:00:00Z')
    });
    const secondOutbox = createResultOutbox({ key: 'pending:test', api: secondClient, isOnline: () => true });
    await secondOutbox.flush();

    assert.equal(secondOutbox.read().length, 0);
    assert.equal(canonicalPosts.length, 2);
    assert.deepEqual(canonicalPosts[1], canonicalPosts[0]);
    assert.equal(canonicalPosts[1].eventId, 'evt-offline-retry');
    assert.equal(canonicalPosts[1].completedAt, '2026-10-05T23:59:15.000Z');
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});


test('expired cached session is skipped by exit delivery and refreshed by normal submit', async () => {
  let sessionCalls = 0;
  const attemptHeaders = [];
  const client = createAspNetApiClient({
    baseUrl: 'https://api.example.test', workspace: 'room-a',
    now: () => Date.parse('2026-10-06T00:00:00Z'),
    fetchImpl: async (url, options) => {
      if (url.endsWith('/student-sessions')) {
        sessionCalls++;
        return response({
          accessToken: 'token-' + sessionCalls, tokenType: 'Bearer',
          expiresAt: sessionCalls === 1 ? '2026-10-06T00:00:10Z' : '2030-01-02T03:04:05Z',
          student: { id: 'student', displayName: 'Synthetic', programId: 'EGE_MATH', workspaceId: 'room-a' }
        });
      }
      attemptHeaders.push(options.headers.Authorization);
      const body = JSON.parse(options.body);
      return response({
        attemptId: 'attempt-refresh', eventId: body.eventId, duplicate: false,
        createdAt: '2026-10-06T00:00:00Z',
        monthlyBest: { attemptId: 'attempt-refresh', percent: body.percent,
          durationSeconds: body.durationSeconds, completedAt: body.completedAt }
      }, 201);
    }
  });
  const payload = { action: 'submitTest', eventId: 'evt-refresh', studentCode: 'code',
    testId: 'test', topicName: 'Topic', taskNumber: 6, correctCount: 1, totalCount: 1,
    durationSeconds: 1, finishedAt: '2026-10-05T23:59:30Z', schemaVersion: 1 };

  await client.validateStudentCode('code');
  assert.equal(client.sendResultOnExit(payload), false);
  await client.submitResult(payload);
  assert.equal(sessionCalls, 2);
  assert.deepEqual(attemptHeaders, ['Bearer token-2']);
});

test('401 attempt response clears bearer cache so the next retry exchanges a new session', async () => {
  let sessionCalls = 0;
  let attemptCalls = 0;
  const client = createAspNetApiClient({
    baseUrl: 'https://api.example.test', workspace: 'room-a',
    now: () => Date.parse('2026-10-06T00:00:00Z'),
    fetchImpl: async (url, options) => {
      if (url.endsWith('/student-sessions')) {
        sessionCalls++;
        return response({
          accessToken: 'token-' + sessionCalls, tokenType: 'Bearer', expiresAt: '2030-01-02T03:04:05Z',
          student: { id: 'student', displayName: 'Synthetic', programId: 'EGE_MATH', workspaceId: 'room-a' }
        });
      }
      attemptCalls++;
      if (attemptCalls === 1) return response({}, 401);
      const body = JSON.parse(options.body);
      assert.equal(options.headers.Authorization, 'Bearer token-2');
      return response({
        attemptId: 'attempt-after-401', eventId: body.eventId, duplicate: false,
        createdAt: '2026-10-06T00:00:00Z',
        monthlyBest: { attemptId: 'attempt-after-401', percent: body.percent,
          durationSeconds: body.durationSeconds, completedAt: body.completedAt }
      }, 201);
    }
  });
  const payload = { action: 'submitTest', eventId: 'evt-401-retry', studentCode: 'code',
    testId: 'test', topicName: 'Topic', taskNumber: 6, correctCount: 1, totalCount: 1,
    durationSeconds: 1, finishedAt: '2026-10-05T23:59:30Z', schemaVersion: 1 };

  await assert.rejects(client.submitResult(payload),
    error => error instanceof AspNetApiError && error.code === 'UNAUTHORIZED');
  const receipt = await client.submitResult(payload);
  assert.equal(receipt.saved, true);
  assert.equal(sessionCalls, 2);
});
