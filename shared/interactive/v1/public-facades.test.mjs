import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

async function moduleWithMocks(name, mocks) {
  let source = await readFile(new URL(`./${name}.js`, import.meta.url), 'utf8');
  for (const [specifier, mockSource] of Object.entries(mocks)) {
    source = source
      .replaceAll(`'${specifier}'`, `'${dataUrl(mockSource)}'`)
      .replaceAll(`"${specifier}"`, `"${dataUrl(mockSource)}"`);
  }
  return import(dataUrl(source));
}

test('data facade injects an API, centralizes auth/identity, and selects legacy queue shapes', async () => {
  const calls = [];
  const module = await moduleWithMocks('platform-data', {
    './platform-api.js': `export const platformApi = { url: 'default' }; export const createAspNetTestAttemptApi = options => ({ url: 'legacy', marker: 'aspnet', options });`,
    './realtime-auth.js': `export const createStudentJsonpTransport = options => ({ kind: 'auth', options });`,
    './identity-store.js': `export const createRealtimeIdentityAdapter = options => ({ kind: 'identity', options });`,
    './result-outbox.js': `export const createResultOutbox = options => ({ kind: 'outbox', options });`,
    './realtime-result-queue.js': `export const createRealtimeResultQueue = options => ({ kind: 'flat', options });
      export const createRealtimeNestedResultQueue = options => ({ kind: 'nested', options });`
  });
  const aspNetProvider = module.createAspNetTestAttemptDataProvider({ baseUrl: 'https://api.invalid', workspace: 'room-a' });
  assert.equal(aspNetProvider.api.marker, 'aspnet');
  assert.equal(aspNetProvider.api.options.workspace, 'room-a');
  const fakeApi = {
    url: 'https://api.invalid', marker: 'api',
    submitResult(payload) { calls.push([this.marker, payload]); return payload; },
    verifyTeacher: async () => true
  };
  const data = module.createPlatformData({ api: fakeApi, studentAuth: { timeoutMs: 12 },
    identity: { key: 'student' }, resultQueue: { format: 'nested', key: 'pending' } });
  assert.equal(data.url, fakeApi.url);
  assert.equal(data.studentAuth.kind, 'auth');
  assert.equal(data.studentAuth.options.api, fakeApi);
  assert.equal(data.identity.kind, 'identity');
  assert.equal(data.results.kind, 'nested');
  assert.equal(data.createResultQueue({ format: 'flat', key: 'flat' }).kind, 'flat');
  const outbox = data.createResultQueue({ format: 'outbox', key: 'old' });
  assert.equal(outbox.kind, 'outbox');
  assert.equal(outbox.options.api, fakeApi);
  assert.throws(() => data.createResultQueue({ format: 'unknown' }), /Unknown result queue format/);
  data.submitResult({ eventId: 'e1' });
  assert.deepEqual(calls, [['api', { eventId: 'e1' }]]);
});

test('realtime facade composes an injected provider and disposes tracked resources once', async () => {
  const emptyMocks = {
    './realtime-lifecycle.js': `export const createRealtimeLifecycle = () => ({});`,
    './firebase-transport.js': `export const createFirebaseTransport = () => ({});`,
    './realtime-session-adapter.js': `export const createRealtimeSessionAdapter = () => ({});`,
    './drawing-transport.js': `export const createDrawingTransport = () => ({});`,
    './shared-board.js': `export const createSharedBoard = () => ({});`,
    './teacher-cursor.js': `export const createTeacherCursor = () => ({});`
  };
  const { createPlatformRealtime } = await moduleWithMocks('platform-realtime', emptyMocks);
  const disposed = [], factoryOptions = [];
  let subscribedPath = null;
  const resource = name => ({ dispose: () => disposed.push(name) });
  const transportMethods = Object.fromEntries(['get', 'set', 'update', 'remove', 'newKey', 'transaction', 'subscribe',
    'subscribeChildAdded', 'subscribeChildChanged', 'subscribeChildRemoved', 'subscribeConnection'].map(name => [name, () => name]));
  transportMethods.subscribeChildAdded = (path, callback) => {
    subscribedPath = path;
    return () => disposed.push('child-subscription');
  };
  const provider = {
    createLifecycle: options => ({ ...resource('lifecycle'), options }),
    createTransport: lifecycle => ({ lifecycle, ...transportMethods, timestamp: () => 'timestamp' }),
    createSession: ({ lifecycle, transport, onReconnect }) => ({
      ...resource('session'), lifecycle, transport, onReconnect,
      subscribe: (...args) => ['subscription', ...args]
    }),
    createPresence: ({ memberId }) => ({ ...resource(`presence:${memberId}`), afterWrite: async () => {} }),
    createDrawing: options => (factoryOptions.push(['drawing', options]), resource('drawing')),
    createBoard: options => (factoryOptions.push(['board', options]), resource('board')),
    createTeacherCursor: options => (factoryOptions.push(['cursor', options]), resource('cursor'))
  };
  const facade = createPlatformRealtime({ provider, config: { project: 'fake' }, namespace: 'n', appId: 'a', sessionId: 's' });
  assert.deepEqual(facade.lifecycle.options, { config: { project: 'fake' }, namespace: 'n', appId: 'a', sessionId: 's' });
  assert.deepEqual(facade.subscribe('state', 'callback'), ['subscription', 'state', 'callback']);
  facade.createDrawing({ path: 'strokes', transport: { wrong: true } });
  facade.createBoard({ anchorId: 'content-v2' });
  facade.createTeacherCursor({ path: 'messages/teacherCursor' });
  facade.createPresence('browser-1');
  const childUnsubscribe = facade.subscribeChildAdded('messages', () => {});
  assert.ok(factoryOptions.every(([, options]) => options.transport === facade.transport));
  assert.equal(facade.timestamp(), 'timestamp');
  facade.dispose();
  facade.dispose();
  childUnsubscribe();
  assert.deepEqual(disposed, ['child-subscription', 'presence:browser-1', 'cursor', 'board', 'drawing', 'session', 'lifecycle']);
  assert.equal(subscribedPath, 'messages');
});

test('Firebase transport maps every relative operation and child subscription without leaking refs', async () => {
  const calls = [];
  globalThis.__firebaseTransportCalls = calls;
  try {
    const sdk = `
      const call = (name, ...args) => (globalThis.__firebaseTransportCalls.push([name, ...args]), name);
      export const ref = (database, path) => ({ database, path });
      export const get = target => call('get', target);
      export const set = (target, value) => call('set', target, value);
      export const update = (target, value) => call('update', target, value);
      export const remove = target => call('remove', target);
      export const push = target => (call('push', target), { key: 'key-1' });
      export const runTransaction = (target, change, options) => call('transaction', target, change, options);
      export const onValue = (target, callback) => call('connection', target, callback);
      export const onChildAdded = (target, callback, onError) => call('child-added', target, callback, onError);
      export const onChildChanged = (target, callback, onError) => call('child-changed', target, callback, onError);
      export const onChildRemoved = (target, callback, onError) => call('child-removed', target, callback, onError);
      export const serverTimestamp = () => ({ '.sv': 'timestamp' });`;
    const { createFirebaseTransport } = await moduleWithMocks('firebase-transport', {
      'https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js': sdk
    });
    const realtime = {
      database: 'db',
      ref: path => ({ database: 'db', path: `root/${path}` }),
      subscribeValue(path, callback, onError) { calls.push(['value', path, callback, onError]); return 'value'; }
    };
    const transport = createFirebaseTransport(realtime), callback = () => {}, onError = () => {};
    transport.get('state'); transport.set('', { state: 1 }); transport.update('members/a', { online: true });
    transport.remove('strokes'); assert.equal(transport.newKey('strokes'), 'key-1');
    transport.transaction('state/game', callback, { applyLocally: false });
    transport.subscribe('members', callback, onError);
    transport.subscribeChildAdded('messages', callback, onError);
    transport.subscribeChildChanged('messages', callback, onError);
    transport.subscribeChildRemoved('messages', callback, onError);
    transport.subscribeConnection(callback);
    assert.deepEqual(transport.timestamp(), { '.sv': 'timestamp' });
    assert.deepEqual(calls.map(call => [call[0], call[1]?.path ?? call[1]]), [
      ['get', 'root/state'], ['set', 'root/'], ['update', 'root/members/a'], ['remove', 'root/strokes'],
      ['push', 'root/strokes'], ['transaction', 'root/state/game'], ['value', 'members'],
      ['child-added', 'root/messages'], ['child-changed', 'root/messages'], ['child-removed', 'root/messages'],
      ['connection', '.info/connected']
    ]);
  } finally {
    delete globalThis.__firebaseTransportCalls;
  }
});

test('realtime lifecycle supports the shared emulator hook and preserves the EGA/6 fallback', async () => {
  const calls = [];
  globalThis.__realtimeLifecycleCalls = calls;
  const { createRealtimeLifecycle } = await moduleWithMocks('realtime-lifecycle', {
    'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js': `
      export const initializeApp = config => ({ config });`,
    'https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js': `
      const calls = globalThis.__realtimeLifecycleCalls;
      export const getDatabase = app => ({ app });
      export const ref = (database, path) => ({ database, path });
      export const onValue = () => () => {};
      export const onDisconnect = () => ({ update: async () => {}, cancel: async () => {} });
      export const set = async () => {};
      export const update = async () => {};
      export const serverTimestamp = () => ({ '.sv': 'timestamp' });
      export const connectDatabaseEmulator = (database, host, port) => calls.push([database, host, port]);`
  });

  try {
    globalThis.__INTERACTIVE_RTDB_EMULATOR__ = { host: 'shared-host', port: 9100 };
    globalThis.__EGA6_RTDB_EMULATOR__ = { host: 'legacy-host', port: 9200 };
    createRealtimeLifecycle({ config: {}, namespace: 'n', appId: 'a', sessionId: 's' });
    assert.deepEqual(calls.at(-1).slice(1), ['shared-host', 9100]);

    delete globalThis.__INTERACTIVE_RTDB_EMULATOR__;
    createRealtimeLifecycle({ config: {}, namespace: 'n', appId: 'a', sessionId: 's' });
    assert.deepEqual(calls.at(-1).slice(1), ['legacy-host', 9200]);
  } finally {
    delete globalThis.__INTERACTIVE_RTDB_EMULATOR__;
    delete globalThis.__EGA6_RTDB_EMULATOR__;
    delete globalThis.__realtimeLifecycleCalls;
  }
});

test('default Firebase provider composes lifecycle, transport, session, presence, and child operations', async () => {
  const calls = [], noop = () => {};
  const methods = Object.fromEntries(['get', 'set', 'update', 'remove', 'newKey', 'transaction', 'subscribe',
    'subscribeChildChanged', 'subscribeChildRemoved', 'subscribeConnection'].map(name => [name, noop]));
  const transport = { ...methods, subscribeChildAdded: path => `child:${path}`, timestamp: () => 'server-time' };
  const lifecycle = {
    presence: (memberId, heartbeatMs) => ({ afterWrite: noop,
      stop: () => calls.push(['presence-stop', memberId, heartbeatMs]) }),
    dispose: () => calls.push(['lifecycle-dispose'])
  };
  const session = { subscribe: (...args) => args, dispose: () => calls.push(['session-dispose']) };
  globalThis.__defaultRealtimeMocks = { calls, lifecycle, transport, session };
  try {
    const { createPlatformRealtime } = await moduleWithMocks('platform-realtime', {
      './realtime-lifecycle.js': `export const createRealtimeLifecycle = options =>
        (globalThis.__defaultRealtimeMocks.calls.push(['lifecycle', options]), globalThis.__defaultRealtimeMocks.lifecycle);`,
      './firebase-transport.js': `export const createFirebaseTransport = lifecycle =>
        (globalThis.__defaultRealtimeMocks.calls.push(['transport', lifecycle]), globalThis.__defaultRealtimeMocks.transport);`,
      './realtime-session-adapter.js': `export const createRealtimeSessionAdapter = options =>
        (globalThis.__defaultRealtimeMocks.calls.push(['session', options]), globalThis.__defaultRealtimeMocks.session);`,
      './drawing-transport.js': `export const createDrawingTransport = options => ({ options });`,
      './shared-board.js': `export const createSharedBoard = options => ({ options });`,
      './teacher-cursor.js': `export const createTeacherCursor = options => ({ options });`
    });
    const facade = createPlatformRealtime({ config: { projectId: 'fake' }, namespace: 'n', appId: 'a', sessionId: 's' });
    assert.equal(facade.transport.subscribeChildAdded('messages'), 'child:messages');
    assert.equal(facade.timestamp(), 'server-time');
    const presence = facade.createPresence('browser-7', 5000);
    assert.equal(typeof presence.afterWrite, 'function');
    assert.equal(facade.createDrawing({ path: 'strokes' }).options.transport, transport);
    assert.equal(facade.createBoard({ anchorId: 'content-v2' }).options.transport, transport);
    assert.equal(facade.createTeacherCursor({ path: 'messages/teacherCursor' }).options.transport, transport);
    facade.dispose();
    facade.dispose();
    assert.deepEqual(calls.at(0), ['lifecycle', { config: { projectId: 'fake' }, namespace: 'n', appId: 'a', sessionId: 's' }]);
    assert.deepEqual(calls.slice(-3), [
      ['presence-stop', 'browser-7', 5000], ['session-dispose'], ['lifecycle-dispose']
    ]);
  } finally {
    delete globalThis.__defaultRealtimeMocks;
  }
});

test('realtime facade reports incomplete provider contracts clearly', async () => {
  const mocks = {
    './realtime-lifecycle.js': `export const createRealtimeLifecycle = () => ({});`,
    './firebase-transport.js': `export const createFirebaseTransport = () => ({});`,
    './realtime-session-adapter.js': `export const createRealtimeSessionAdapter = () => ({});`,
    './drawing-transport.js': `export const createDrawingTransport = () => ({});`,
    './shared-board.js': `export const createSharedBoard = () => ({});`,
    './teacher-cursor.js': `export const createTeacherCursor = () => ({});`
  };
  const { createPlatformRealtime } = await moduleWithMocks('platform-realtime', mocks);
  assert.throws(() => createPlatformRealtime({ provider: {} }), /Realtime provider must implement createLifecycle/);
  const provider = {
    createLifecycle: () => ({}), createTransport: () => ({}), createSession: () => ({ subscribe() {} }),
    createPresence() {}, createDrawing() {}, createBoard() {}, createTeacherCursor() {}
  };
  assert.throws(() => createPlatformRealtime({ provider }), /Realtime transport must implement get\(\)/);
});

test('interactive runtime passes providers through and exposes one idempotent disposal boundary', async () => {
  const calls = [];
  const { createInteractiveRuntime } = await moduleWithMocks('interactive-runtime', {
    './platform-data.js': `export const createPlatformData = options => ({ options, dispose: () => globalThis.__facadeCalls.push('data') });`,
    './platform-realtime.js': `export const createPlatformRealtime = options => ({ options, dispose: () => globalThis.__facadeCalls.push('realtime') });`
  });
  globalThis.__facadeCalls = calls;
  try {
    const dataProvider = { name: 'data' }, realtimeProvider = { name: 'realtime' };
    const runtime = createInteractiveRuntime({ data: { api: { name: 'api' } }, realtime: { appId: 'app' },
      dataProvider, realtimeProvider });
    assert.equal(runtime.data.options.provider, dataProvider);
    assert.equal(runtime.realtime.options.provider, realtimeProvider);
    runtime.dispose();
    runtime.dispose();
    assert.deepEqual(calls, ['realtime', 'data']);
  } finally {
    delete globalThis.__facadeCalls;
  }
});
