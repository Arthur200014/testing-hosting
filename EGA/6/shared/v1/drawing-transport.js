// Firebase drawing I/O with page-configured namespace and payload codecs.
// The adapter never invents stroke fields: encode/decode default to identity.
export function createDrawingTransport({ transport, path = 'strokes', encodeStroke = value => value,
  encodePatch = value => value, decodeCollection = value => value || {} }) {
  const child = (id = '') => id ? `${path}/${id}` : path;
  return {
    subscribeSnapshot(callback, onError) { return transport.subscribe(path, callback, onError); },
    subscribe(callback, onError) {
      return transport.subscribe(path, snapshot => callback(decodeCollection(snapshot.val(), snapshot)), onError);
    },
    newKey() { return transport.newKey(path); },
    set(id, stroke) { return transport.set(child(id), encodeStroke(stroke)); },
    update(id, patch) { return transport.update(child(id), encodePatch(patch)); },
    remove(id) { return transport.remove(child(id)); },
    updateMany(patch) { return transport.update(path, encodePatch(patch)); },
    clear() { return transport.remove(path); }
  };
}
