// Keeps the historical flat `{...payload, _playerKey}` queue used by correct.html.
export function createRealtimeResultQueue({ key, limit = 20 }) {
  const read = () => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  };
  const write = items => localStorage.setItem(key, JSON.stringify(items.slice(-limit)));
  return {
    read,
    queue(payload, playerKey = '') {
      const item = { ...payload, _playerKey: playerKey || payload._playerKey || '' };
      const items = read(), index = items.findIndex(entry => entry?.eventId === item.eventId);
      if (index >= 0) items[index] = item;
      else items.push(item);
      write(items);
    },
    remove(eventId) { write(read().filter(item => item?.eventId !== eventId)); }
  };
}

// Compatibility adapter for legacy nested `{payload, playerKey}` result queues.
// Injected storage functions preserve each page's safeGet/safeSet behavior.
export function createRealtimeNestedResultQueue({ key, getItem = k => localStorage.getItem(k),
  setItem = (k, value) => localStorage.setItem(k, value), isOnline = () => navigator.onLine }) {
  if (!key) throw new TypeError('key is required');
  const read = () => { try { const items = JSON.parse(getItem(key) || '[]'); return Array.isArray(items) ? items : []; } catch { return []; } };
  const write = items => setItem(key, JSON.stringify(items));
  const queue = (payload, playerKey = '') => {
    const items = read();
    if (!items.some(item => item?.payload?.eventId === payload.eventId)) {
      items.push({ payload, playerKey });
      write(items);
    }
  };
  const remove = eventId => write(read().filter(item => item?.payload?.eventId !== eventId));
  const flush = async ({ submit, onSaved, onFailure } = {}) => {
    if (!isOnline() || typeof submit !== 'function') return;
    for (const item of read()) {
      try { const receipt = await submit(item.payload); remove(item.payload.eventId); await onSaved?.(item, receipt); }
      catch (error) { await onFailure?.(item, error); }
    }
  };
  return { read, write, queue, remove, flush };
}
