import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// В репозитории нет package.json с type: module; загружаем браузерный ES-модуль
// как data URL, не меняя правила загрузки рабочих HTML.
async function browserModule(name) {
  const source = await readFile(new URL(`./${name}.js`, import.meta.url));
  return import(`data:text/javascript;base64,${source.toString('base64')}`);
}

test('очередь: дедупликация, офлайн и повторная отправка', async () => {
  const { createResultOutbox } = await browserModule('result-outbox');
  const memory = new Map();
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value)
  };
  try {
    let online = false, attempts = 0, saved = 0;
    const api = {
      submitResult: async () => { attempts++; if (attempts === 1) throw Error('network'); },
      sendResultOnExit: () => {}
    };
    const outbox = createResultOutbox({ key: 'pilot:pending', api, isOnline: () => online });
    outbox.queue({ eventId: 'event-1', score: 1 }, 'student_1');
    outbox.queue({ eventId: 'event-1', score: 2 }, 'student_1');
    assert.equal(outbox.read().length, 1);
    assert.equal(outbox.read()[0].payload.score, 2);
    await outbox.flush(() => saved++);
    assert.equal(attempts, 0);
    online = true;
    await outbox.flush(() => saved++);
    assert.equal(outbox.read().length, 1);
    await outbox.flush(() => saved++);
    assert.equal(outbox.read().length, 0);
    assert.equal(saved, 1);
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});

test('подписки: восстановление присутствия только после переподключения', async () => {
  const { createSessionRuntime } = await browserModule('session-runtime');
  const callbacks = new Map();
  let reconnects = 0, starts = 0, unsubscriptions = 0;
  const transport = {
    subscribe: (path, callback) => {
      callbacks.set(path, callback);
      return () => { callbacks.delete(path); unsubscriptions++; };
    },
    subscribeConnection: callback => {
      callbacks.set('connection', callback);
      return () => { callbacks.delete('connection'); unsubscriptions++; };
    }
  };
  const runtime = createSessionRuntime({
    transport, onState: () => {}, onMembers: () => {},
    onStart: () => starts++, onReconnect: () => reconnects++
  });
  runtime.start();
  assert.equal(starts, 1);
  assert.equal(callbacks.size, 3);
  const connected = value => callbacks.get('connection')({ val: () => value });
  connected(false); connected(true);
  await Promise.resolve();
  assert.equal(reconnects, 0);
  connected(false); connected(true);
  await Promise.resolve();
  assert.equal(reconnects, 1);
  runtime.stop();
  assert.equal(callbacks.size, 0);
  assert.equal(unsubscriptions, 3);
});

test('клиент GAS централизует адрес и проверяет код учителя без сетевого вызова', async () => {
  const { createLegacyApiClient } = await browserModule('legacy-api-client');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('teacher-code'));
  const hash = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
  const client = createLegacyApiClient({
    url: 'https://example.invalid/exec',
    teacherCodeHash: hash
  });
  assert.equal(client.url, 'https://example.invalid/exec');
  assert.equal(await client.verifyTeacher('teacher-code'), true);
  assert.equal(await client.verifyTeacher('wrong'), false);
});

test('очередь correct сохраняет плоскую legacy-форму и ключ ученика', async () => {
  const { createRealtimeResultQueue } = await browserModule('realtime-result-queue');
  const memory = new Map(), originalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value)
  };
  try {
    const queue = createRealtimeResultQueue({ key: 'correct:pendingResults', limit: 2 });
    queue.queue({ eventId: 'evt-1', scorePercent: 70 }, 'student-1');
    queue.queue({ eventId: 'evt-1', scorePercent: 80 }, 'student-1');
    assert.deepEqual(queue.read(), [{ eventId: 'evt-1', scorePercent: 80, _playerKey: 'student-1' }]);
    queue.remove('evt-1');
    assert.deepEqual(queue.read(), []);
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});

test('identity adapter keeps page codecs and shared legacy key projection', async () => {
  const { createRealtimeIdentityAdapter } = await browserModule('identity-store');
  const memory = new Map(), originalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: key => memory.delete(key)
  };
  try {
    const mix = createRealtimeIdentityAdapter({ key: 'mix:student', decode: saved => saved,
      encode: value => value, legacyProjection: value => ({ egeStudentId: value.id, egeStudentCode: value.code }) });
    mix.save({ id: 'verified-9', code: 'AB12', name: 'Ученик', verified: true });
    assert.deepEqual(mix.load(), { id: 'verified-9', code: 'AB12', name: 'Ученик', verified: true });
    assert.equal(memory.get('egeStudentId'), 'verified-9');
    const correct = createRealtimeIdentityAdapter({ decode: (_saved, legacy) => ({ ...legacy,
      programId: memory.get('egeStudentProgramId'), verified: memory.get('egeStudentVerified') === '1' }),
      legacyProjection: value => ({ egeStudentId: value.studentId, egeStudentCode: value.code,
        egeStudentProgramId: value.programId, egeStudentVerified: value.verified ? '1' : '0' }) });
    correct.save({ studentId: 's-4', code: 'CD34', programId: 'EGE_MATH', verified: true });
    assert.equal(correct.load().programId, 'EGE_MATH');
    assert.equal(correct.load().verified, true);
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});

test('realtime session adapter preserves subscription paths and reconnect callback', async () => {
  const { createRealtimeSessionAdapter } = await browserModule('realtime-session-adapter');
  const callbacks = new Map(), paths = [], connection = [];
  const realtime = { subscribeValue: (path, callback) => {
    paths.push(path); callbacks.set(path, callback); return () => callbacks.delete(path);
  } };
  const legacySubscribe = realtime.subscribeValue.bind(realtime);
  const transport = {
    subscribe: (path, callback) => legacySubscribe(path, callback),
    subscribeConnection: callback => { connection.push(callback); return () => connection.splice(0); }
  };
  let reconnected = 0;
  const adapter = createRealtimeSessionAdapter({ realtime, transport, onReconnect: () => reconnected++ });
  const offState = realtime.subscribeValue('state', () => {}), offMembers = realtime.subscribeValue('members', () => {});
  assert.deepEqual(paths, ['state', 'members']);
  connection[0]({ val: () => true }); connection[0]({ val: () => false }); connection[0]({ val: () => true });
  await Promise.resolve();
  assert.equal(reconnected, 1);
  offState(); offMembers(); adapter.stop();
  assert.equal(callbacks.size, 0);
});

test('drawing transport keeps configured paths and page stroke codecs', async () => {
  const { createDrawingTransport } = await browserModule('drawing-transport');
  const calls = [], callbacks = new Map();
  const transport = {
    subscribe: (path, callback) => { callbacks.set(path, callback); return () => callbacks.delete(path); },
    newKey: path => (calls.push(['newKey', path]), 'k-1'),
    set: (path, value) => calls.push(['set', path, value]),
    update: (path, value) => calls.push(['update', path, value]),
    remove: path => calls.push(['remove', path])
  };
  const guide = createDrawingTransport({ transport, path: 'strokes',
    encodeStroke: stroke => ({ ...stroke, rev: Number(stroke.rev) || 0 }) });
  assert.equal(guide.newKey(), 'k-1');
  guide.set('k-1', { points: [[0.2, 0.3]], rev: 4 });
  guide.updateMany({ 'k-1': null });
  assert.deepEqual(calls, [['newKey', 'strokes'], ['set', 'strokes/k-1', { points: [[0.2, 0.3]], rev: 4 }], ['update', 'strokes', { 'k-1': null }]]);
  const game = createDrawingTransport({ transport, path: 'state/strokes' });
  game.set('stroke-2', { points: [{ x: 4, y: 5 }], anchorKey: 'task-card' });
  assert.deepEqual(calls.at(-1), ['set', 'state/strokes/stroke-2', { points: [{ x: 4, y: 5 }], anchorKey: 'task-card' }]);
});

test('JSONP adapter builds configured validateStudent request and cleans callback', async () => {
  const { createStudentJsonpTransport } = await browserModule('realtime-auth');
  const callbacks = {}, scripts = [];
  const windowRef = {};
  const documentRef = { createElement: () => { const script = { remove() { this.removed = true; } }; scripts.push(script); return script; },
    head: { appendChild: script => { script.appended = true; } } };
  const request = createStudentJsonpTransport({ api: { url: 'https://example.test/exec' }, windowRef, documentRef });
  const pending = request({ code: 'A B', callbackNamePrefix: 'guide', params: { lang: 'ru' },
    parseResponse: raw => raw.data.studentId });
  const script = scripts[0], query = new URL(script.src).searchParams;
  assert.equal(query.get('action'), 'validateStudent');
  assert.equal(query.get('code'), 'A B');
  assert.equal(query.get('lang'), 'ru');
  assert.equal(query.get('callback'), Object.keys(windowRef)[0]);
  const callback = query.get('callback');
  windowRef[callback]({ data: { studentId: '42' } });
  assert.equal(await pending, '42');
  assert.equal(windowRef[callback], undefined);
  assert.equal(script.removed, true);
});

test('nested realtime queue preserves legacy values, dedupe, storage adapters, and flush callback', async () => {
  const { createRealtimeNestedResultQueue } = await browserModule('realtime-result-queue');
  const data = new Map(), calls = [];
  const outbox = createRealtimeNestedResultQueue({ key: 'legacy:k',
    getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), isOnline: () => true });
  outbox.queue({ eventId: 'e1', score: 2 }, 'p1');
  outbox.queue({ eventId: 'e1', score: 3 }, 'p2');
  assert.deepEqual(outbox.read(), [{ payload: { eventId: 'e1', score: 2 }, playerKey: 'p1' }]);
  await outbox.flush({ submit: async payload => ({ eventId: payload.eventId }), onSaved: item => calls.push(item.playerKey) });
  assert.deepEqual(calls, ['p1']);
  assert.deepEqual(outbox.read(), []);
});
