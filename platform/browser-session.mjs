// Persistent browser credentials stay in an HttpOnly cookie. Access tokens remain in memory.
export function createBrowserSession(apiOrigin, role) {
  const enabled = apiOrigin === location.origin;
  let current = null, pending = null, timer, renewAt = 0, version = 0;
  let onRenew = () => {}, onEnd = () => {};
  const path = apiOrigin + '/api/v1/' + role + '-sessions/';
  function schedule(delay) {
    clearTimeout(timer);
    const expected = version;
    timer = setTimeout(() => restore().catch(() => {
      if (version === expected) schedule(30000);
    }), delay);
  }
  function accept(session) {
    current = session;
    if (enabled) {
      const now = Date.now();
      const remaining = new Date(session.expiresAt).getTime() - now;
      const delay = Math.max(1000, remaining - Math.min(30000, remaining * 0.15));
      renewAt = now + delay;
      schedule(delay);
    }
  }
  function stop() {
    version++;
    clearTimeout(timer);
    current = null;
    pending = null;
  }
  function account(session) {
    return role === 'teacher'
      ? [session.teacherId, session.workspaceId, session.workspaceRole].join('/')
      : [session.student?.id, session.student?.workspaceId].join('/');
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
        if (session && current && account(session) !== account(current)) {
          stop();
          onEnd();
          return null;
        }
        if (session) { accept(session); onRenew(session); }
        else if (current) { stop(); onEnd(); }
        return session;
      }).finally(() => { if (pending === operation) pending = null; });
    pending = operation;
    return operation;
  }
  async function fresh() {
    if (enabled && current && Date.now() >= renewAt) await restore();
  }
  function watch(renew, end) { onRenew = renew; onEnd = end; }
  return {enabled, accept, stop, restore, fresh, watch};
}
