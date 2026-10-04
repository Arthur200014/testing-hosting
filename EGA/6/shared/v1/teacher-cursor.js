export function createTeacherCursor({ transport, getRole, hasSession, element, path = 'messages/teacherCursor' }) {
  let unsubscribe = null, lastPush = 0;
  const onPointerMove = event => {
    if (getRole() !== 'teacher' || !hasSession()) return;
    const now = performance.now();
    if (now - lastPush < 75) return;
    lastPush = now;
    transport.update(path, {
      x: Math.max(0, Math.min(1, event.clientX / Math.max(1, innerWidth))),
      y: Math.max(0, Math.min(1, event.clientY / Math.max(1, innerHeight))),
      name: 'Учитель', clientAt: Date.now(), updatedAt: transport.serverTimestamp()
    }).catch(() => {});
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  function start() {
    if (unsubscribe) return;
    unsubscribe = transport.subscribe(path, snapshot => {
      const cursor = element(), value = snapshot.val() || null;
      if (!cursor) return;
      if (getRole() !== 'student' || !value || Date.now() - Number(value.clientAt || 0) > 4000) {
        cursor.classList.add('hidden');
        return;
      }
      cursor.classList.remove('hidden');
      cursor.style.left = (Number(value.x) || 0) * innerWidth + 'px';
      cursor.style.top = (Number(value.y) || 0) * innerHeight + 'px';
    });
  }
  function stop() { unsubscribe?.(); unsubscribe = null; }
  function dispose() { stop(); window.removeEventListener('pointermove', onPointerMove); }
  return { start, stop, dispose };
}
