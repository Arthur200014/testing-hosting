import { io } from 'socket.io-client';
const bytes = base64 => Uint8Array.from(atob(base64), x => x.charCodeAt(0));
const signature = e => `${e.version}:${e.versionNonce}:${e.isDeleted}`;
export async function lessonPermit({ apiBase, lessonId, accessToken, role }) {
  if (!['teacher','student'].includes(role) || !/^[0-9a-f-]{36}$/i.test(lessonId)) throw new Error('Invalid lesson');
  const url = new URL(apiBase);
  if (!['127.0.0.1','localhost'].includes(url.hostname)) throw new Error('Isolated API required');
  const res = await fetch(`${url.origin}/api/v1/${role}/board-prototype/lessons/${lessonId}/permit`, {
    method:'POST',headers:{Authorization:`Bearer ${accessToken}`},cache:'no-store',
  });
  if (!res.ok) throw new Error('Lesson access denied');
  return res.json();
}
export function connectScene({ url, permit, sceneKey, api, reconcileElements, CaptureUpdateAction, status }) {
  if (!['127.0.0.1','localhost'].includes(new URL(url).hostname)) throw new Error('Isolated room required');
  const socket = io(url, { auth: permit, transports:['websocket'], reconnection:true });
  const key = crypto.subtle.importKey('raw', bytes(sceneKey), 'AES-GCM', false, ['encrypt','decrypt']);
  let after = 0, ready = false, stopped = false, unsupported = false, inflight, dirty = new Map(), seen = new Map();
  const remember = elements => { for (const e of elements) seen.set(e.id, signature(e)); };
  const request = (event, payload) => socket.timeout(3000).emitWithAck(event,payload);
  const changed = elements => {
    if (!ready) return;
    unsupported = elements.some(e => e.type === 'image' && !e.isDeleted);
    if (unsupported) status('Изображения пока не поддерживаются — не сохранено');
    for (const e of elements) if (seen.get(e.id) !== signature(e)) {
      if (e.type === 'image') continue;
      dirty.set(e.id, structuredClone(e)); seen.set(e.id, signature(e));
    }
    if (dirty.size) status('Не сохранено');
  };
  socket.on('disconnect', () => status('Нет связи — правки не подтверждены'));
  socket.on('connect_error', () => status('Нет доступа или соединения'));
  async function loop() {
    try {
      if (!socket.connected) return;
      // Single ordered request path per socket. Keep exact encrypted bytes/messageId on retry.
      if (!inflight && dirty.size) {
        const elements = [...dirty.values()];
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv}, await key,
          new TextEncoder().encode(JSON.stringify({elements})));
        if (ciphertext.byteLength > 262144) throw new Error('Scene frame exceeds limit');
        inflight = { messageId:crypto.randomUUID(), iv, ciphertext:new Uint8Array(ciphertext) };
        // Remove only versions captured above: edits during async encryption remain queued.
        for (const e of elements) if (signature(dirty.get(e.id) ?? {}) === signature(e)) dirty.delete(e.id);
      }
      if (inflight) {
        const result = await request('submit',inflight);
        if (!result.ok) throw new Error(result.error);
        inflight = undefined;
      }
      for (;;) {
        const result = await request('replay',{after});
        if (!result.ok) throw new Error(result.error);
        for (const frame of result.frames) {
          if (frame.seq !== after + 1) throw new Error('Non-contiguous replay');
          const plaintext = await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(frame.iv)},await key,bytes(frame.ciphertext));
          const remote = JSON.parse(new TextDecoder().decode(plaintext));
          if (!Array.isArray(remote.elements) || remote.elements.some(e => e.type === 'image')) throw new Error('Unsupported frame');
          const merged = reconcileElements(api.getSceneElementsIncludingDeleted(), remote.elements, api.getAppState());
          remember(merged);
          const current = api.getSceneElementsIncludingDeleted();
          // Own durable echoes must not reset pending local undo capture.
          if (current.length !== merged.length || current.some((e,i) => e.id !== merged[i].id || signature(e) !== signature(merged[i])))
            api.updateScene({elements:merged,captureUpdate:CaptureUpdateAction.NEVER});
          after = frame.seq;
        }
        if (!result.more) break;
      }
      ready = true;
      if (!dirty.size && !inflight && !unsupported) status('Сохранено');
    } catch (e) { status('Не сохранено: ' + e.message); }
    finally { if (!stopped) setTimeout(loop,150); }
  }
  loop();
  return {changed, close(){stopped=true;socket.close();}, get ready(){return ready;}};
}
