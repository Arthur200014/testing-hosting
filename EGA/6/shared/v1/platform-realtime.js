import { createRealtimeLifecycle } from '../../realtime-lifecycle.js';
import { createFirebaseTransport } from './firebase-transport.js';
import { createRealtimeSessionAdapter } from './realtime-session-adapter.js';
import { createDrawingTransport } from './drawing-transport.js';
import { createSharedBoard } from './shared-board.js';
import { createTeacherCursor } from './teacher-cursor.js';

// Provider contract: createLifecycle(options), createTransport(lifecycle),
// createSession({ lifecycle, transport, onReconnect }), createPresence({
// lifecycle, transport, memberId, heartbeatMs }), and the drawing/board/cursor
// factories below. A transport accepts session-relative string paths and must
// implement get/set/update/remove/newKey/transaction, value and child
// subscriptions, subscribeConnection, and timestamp. Resources expose dispose()
// or stop(); subscription methods return unsubscribe functions.
// A SignalR provider can implement this contract without page changes.
export const firebaseRealtimeProvider = {
  createLifecycle: options => createRealtimeLifecycle(options),
  createTransport: lifecycle => createFirebaseTransport(lifecycle),
  createSession: options => createRealtimeSessionAdapter({
    realtime: options.lifecycle,
    transport: options.transport,
    onReconnect: options.onReconnect
  }),
  createPresence: ({ lifecycle, memberId, heartbeatMs }) => lifecycle.presence(memberId, heartbeatMs),
  createDrawing: options => createDrawingTransport(options),
  createBoard: options => createSharedBoard(options),
  createTeacherCursor: options => createTeacherCursor(options)
};

export function createPlatformRealtime({ provider = firebaseRealtimeProvider, lifecycle: suppliedLifecycle = null,
  config, namespace, appId, sessionId, onReconnect } = {}) {
  const requireMethod = (target, name, label) => {
    if (typeof target?.[name] !== 'function') throw new TypeError(`${label} must implement ${name}()`);
  };
  for (const name of ['createLifecycle', 'createTransport', 'createSession', 'createPresence',
    'createDrawing', 'createBoard', 'createTeacherCursor']) requireMethod(provider, name, 'Realtime provider');
  const lifecycle = suppliedLifecycle || provider.createLifecycle({ config, namespace, appId, sessionId });
  const transport = provider.createTransport(lifecycle);
  for (const name of ['get', 'set', 'update', 'remove', 'newKey', 'transaction', 'subscribe',
    'subscribeChildAdded', 'subscribeChildChanged', 'subscribeChildRemoved', 'subscribeConnection', 'timestamp']) {
    requireMethod(transport, name, 'Realtime transport');
  }
  const session = provider.createSession({ lifecycle, transport, onReconnect });
  requireMethod(session, 'subscribe', 'Realtime session');
  const resources = new Set();
  let disposed = false;

  const track = resource => {
    if (!resource) return resource;
    if (disposed) disposeResource(resource);
    else resources.add(resource);
    return resource;
  };
  const create = (factory, options = {}) => track(factory({ ...options, transport }));

  function disposeResource(resource) {
    try {
      const result = typeof resource === 'function' ? resource()
        : typeof resource.dispose === 'function' ? resource.dispose()
        : typeof resource.stop === 'function' ? resource.stop() : null;
      result?.catch?.(() => {});
    } catch {}
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const resource of [...resources].reverse()) disposeResource(resource);
    resources.clear();
    disposeResource(session);
    if (lifecycle !== session) disposeResource(lifecycle);
  }

  const subscribeTransport = method => (...args) => {
    const unsubscribe = transport[method](...args);
    let active = true;
    const release = () => {
      if (!active) return;
      active = false;
      resources.delete(release);
      disposeResource(unsubscribe);
    };
    track(release);
    return release;
  };

  return {
    lifecycle,
    transport,
    session,
    subscribe: (...args) => session.subscribe(...args),
    subscribeValue: (...args) => session.subscribe(...args),
    subscribeChildAdded: subscribeTransport('subscribeChildAdded'),
    subscribeChildChanged: subscribeTransport('subscribeChildChanged'),
    subscribeChildRemoved: subscribeTransport('subscribeChildRemoved'),
    timestamp: () => transport.timestamp(),
    createPresence: (memberId, heartbeatMs = 0) => track(provider.createPresence({
      lifecycle, transport, memberId, heartbeatMs
    })),
    createDrawing: options => create(provider.createDrawing, options),
    createBoard: options => create(provider.createBoard, options),
    createTeacherCursor: options => create(provider.createTeacherCursor, options),
    track,
    dispose
  };
}
