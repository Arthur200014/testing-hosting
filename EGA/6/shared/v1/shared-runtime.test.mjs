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
