import { get, set, update, remove, push, runTransaction, onValue, ref, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js';

// Путь всегда задаётся относительно одного занятия.
export function createFirebaseTransport(realtime) {
  const at = path => realtime.ref(path);
  const subscribeValue = realtime.subscribeValue.bind(realtime);
  return {
    get: path => get(at(path)),
    set: (path, value) => set(at(path), value),
    update: (path, patch) => update(at(path), patch),
    remove: path => remove(at(path)),
    newKey: path => push(at(path)).key,
    transaction: (path, change, options) => runTransaction(at(path), change, options),
    subscribe: (path, callback, onError) => subscribeValue(path, callback, onError),
    subscribeConnection: callback => onValue(ref(realtime.database, '.info/connected'), callback),
    serverTimestamp
  };
}
