// Управляет порядком подписок и восстановлением присутствия после потери связи.
export function createSessionRuntime({ transport, onState, onMembers, onStart, onStop, onReconnect }) {
  let stateUnsub = null, membersUnsub = null, connectionUnsub = null;
  let connectedBefore = false, disconnectedAfterConnect = false;

  function stop() {
    stateUnsub?.();
    membersUnsub?.();
    connectionUnsub?.();
    stateUnsub = membersUnsub = connectionUnsub = null;
    onStop?.();
  }

  function start() {
    stop();
    connectedBefore = disconnectedAfterConnect = false;
    stateUnsub = transport.subscribe('state', onState);
    membersUnsub = transport.subscribe('members', onMembers);
    onStart?.();
    connectionUnsub = transport.subscribeConnection(snapshot => {
      const connected = snapshot.val() === true;
      if (!connected && connectedBefore) disconnectedAfterConnect = true;
      if (connected) {
        if (disconnectedAfterConnect) {
          disconnectedAfterConnect = false;
          Promise.resolve().then(() => onReconnect?.()).catch(() => {});
        }
        connectedBefore = true;
      }
    });
  }

  return { start, stop };
}
