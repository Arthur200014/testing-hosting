import test from 'node:test';
import assert from 'node:assert/strict';
import { createAspNetApiClient, AspNetApiError } from './aspnet-api-client.js';
import { browserDataProvider } from './platform-data.js';
import { platformApi } from './platform-api.js';

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
