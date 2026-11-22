// Persistent browser credentials stay in an HttpOnly cookie. Access tokens remain in memory.
export function createBrowserSession(apiOrigin, role) {
  const enabled = apiOrigin === location.origin;
  let current = null, pending = null, timer, version = 0;
  let onRenew = () => {}, onEnd = () => {};
  const path = apiOrigin + '/api/v1/' + role + '-sessions/';
  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(() => restore().catch(() => schedule(30000)), delay);
  }
  function accept(session) {
    current = session;
    if (enabled) schedule(Math.max(1000, new Date(session.expiresAt).getTime() - Date.now() - 60000));
  }
  function stop() {
    version++;
    clearTimeout(timer);
    current = null;
    pending = null;
  }
  function restore() {
    if (!enabled) return Promise.resolve(null);
    if (pending) return pending;
    const expected = version;
    const operation = fetch(path + 'current', {credentials:'same-origin', cache:'no-store', signal:AbortSignal.timeout(10000)})
      .then(async response => {
        if (!response.ok && response.status !== 401) throw new Error('Не удалось восстановить вход. Повторите попытку.');
        const session = response.status === 204 || response.status === 401 ? null : await response.json();
        if (version !== expected) return null;
        if (session) { accept(session); onRenew(session); }
        else if (current) { stop(); onEnd(); }
        return session;
      }).finally(() => { if (pending === operation) pending = null; });
    pending = operation;
    return operation;
  }
  async function fresh() {
    if (enabled && current && new Date(current.expiresAt).getTime() - Date.now() < 60000) await restore();
  }
  function watch(renew, end) { onRenew = renew; onEnd = end; }
  return {enabled, accept, stop, restore, fresh, watch};
}
