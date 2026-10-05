// Routes the existing per-page state, member, and extra subscriptions through
// one lifecycle owner while leaving paths and snapshot callbacks untouched.
export function createRealtimeSessionAdapter({ realtime, transport, onReconnect = () => {} }) {
  const subscriptions = new Set();
  let connectionUnsubscribe = null, connectedOnce = false, disconnected = false;

  function start() {
    if (connectionUnsubscribe) return;
    connectionUnsubscribe = transport.subscribeConnection(snapshot => {
      const connected = snapshot.val() === true;
      if (!connected && connectedOnce) disconnected = true;
      if (connected) {
        if (disconnected) {
          disconnected = false;
          Promise.resolve().then(onReconnect).catch(() => {});
        }
        connectedOnce = true;
      }
    });
  }

  function subscribe(path, callback, onError) {
    start();
    const underlying = transport.subscribe(path, callback, onError);
    const release = () => { if (!subscriptions.delete(release)) return; underlying?.(); };
    subscriptions.add(release);
    return release;
  }

  function stop() {
    for (const release of [...subscriptions]) release();
    connectionUnsubscribe?.(); connectionUnsubscribe = null;
    connectedOnce = disconnected = false;
  }

  realtime.subscribeValue = subscribe;
  return { subscribe, start, stop, dispose: stop };
}
