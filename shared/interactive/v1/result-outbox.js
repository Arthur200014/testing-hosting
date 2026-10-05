// Содержимое результата формирует игра; модуль хранит и повторно отправляет его.
export function createResultOutbox({ key, api, isOnline = () => navigator.onLine }) {
  const read = () => {
    try {
      const queue = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(queue) ? queue : [];
    } catch { return []; }
  };
  const write = queue => localStorage.setItem(key, JSON.stringify(queue));
  const queue = (payload, playerKey) => {
    const items = read(), index = items.findIndex(item => item?.payload?.eventId === payload.eventId);
    const entry = { payload, playerKey };
    if (index >= 0) items[index] = entry; else items.push(entry);
    write(items);
  };
  const remove = eventId => write(read().filter(item => item?.payload?.eventId !== eventId));
  const flush = async onSaved => {
    if (!isOnline()) return;
    for (const item of read()) {
      try {
        await api.submitResult(item.payload);
        remove(item.payload.eventId);
        await onSaved?.(item);
      } catch {}
    }
  };
  const sendOnExit = (payload, playerKey) => {
    try { queue(payload, playerKey); api.sendResultOnExit(payload); } catch {}
  };
  return { read, queue, remove, flush, sendOnExit };
}
