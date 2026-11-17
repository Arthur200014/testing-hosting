import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { authorizeEvent } from './access.mjs';
import { bindRoom } from './room.mjs';

// Isolated experiment only. No executable entry point or production configuration.
// Scene payloads stay opaque; reconstruction/reconciliation belongs to the editor.
export async function startTestTransport({ key, journal, revoked = () => false,
  authorize = async () => true, clock = Date.now, port = 0, maxConnections = 256, maxRoomConnections = 24 }) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid test port');
  const http = createServer((_, res) => { res.writeHead(404); res.end(); });
  const io = new Server(http, { serveClient: false, transports: ['websocket'],
    maxHttpBufferSize: 270000, perMessageDeflate: false, allowUpgrades: false });
  const connections = new Set(), counts = new Map();
  io.use(async (socket, next) => {
    try {
      if(Object.keys(socket.handshake.auth??{}).some(k=>!['token','workspace','board'].includes(k)))throw new Error('Unexpected auth fields');
      const { token, workspace, board } = socket.handshake.auth ?? {};
      const scope = Object.freeze({ workspace, board });
      const claims = authorizeEvent(key, token, scope, 'replay', { now: clock(), revoked });
      if (!await authorize({ token, scope, claims })) throw new Error('Access denied');
      authorizeEvent(key, token, scope, 'replay', { now: clock(), revoked });
      const roomId = `${workspace}/${board}`;
      if (connections.size >= maxConnections || (counts.get(roomId) ?? 0) >= maxRoomConnections)
        throw new Error('Connection quota');
      // Reserve synchronously in middleware, including pending handshakes.
      connections.add(socket); counts.set(roomId, (counts.get(roomId) ?? 0) + 1);
      socket.data = { scope, token, roomId, claims };
      next();
    } catch { next(new Error('Room access denied')); }
  });
  io.on('connection', socket => {
    const { scope, token, roomId } = socket.data;
    let room;
    try { room = bindRoom({ key, token, scope, journal, revoked, clock }); }
    catch { connections.delete(socket); counts.set(roomId, counts.get(roomId) - 1); socket.disconnect(true); return; }
    const check = async event => {
      const claims = authorizeEvent(key, token, scope, event, { now: clock(), revoked });
      if (!await authorize({token,scope,claims})) throw new Error('Access denied');
      authorizeEvent(key, token, scope, event, { now: clock(), revoked });
    };
    let pending = false, windowAt = clock(), requests = 0;
    socket.on('disconnect', () => {
      connections.delete(socket);
      const n = counts.get(roomId) - 1;
      if (n) counts.set(roomId, n); else counts.delete(roomId);
    });
    function handle(event, action) {
      socket.on(event, async (payload, ack) => {
        if (typeof ack !== 'function') return;
        if (clock() - windowAt >= 1000) { windowAt = clock(); requests = 0; }
        if (++requests > 50 || pending) { ack({ ok: false, error: 'BUSY' }); return; }
        pending = true;
        try {
          try { await check(event === 'submit' ? 'scene' : 'replay'); }
          catch { ack({ok:false,error:'ACCESS_DENIED'}); socket.disconnect(true); return; }
          const result = await action(payload);
          // Recheck before any data leaves the process, including slow storage reads.
          await check('replay');
          if (socket.connected) ack({ ok: true, ...result });
        } catch {
          if (socket.connected) ack({ ok: false, error: 'REQUEST_FAILED' });
        } finally { pending = false; }
      });
    }
    handle('submit', async payload => {
      if (!payload || !Buffer.isBuffer(payload.ciphertext) || !Buffer.isBuffer(payload.iv))
        throw new Error('Binary frame required');
      const saved = await room.submit({ messageId: payload.messageId,
        ciphertext: payload.ciphertext, iv: payload.iv });
      // A sequence acknowledgement is produced only after durable append completes.
      // No blind room broadcast: every client pulls authorized ordered pages.
      return { seq: saved.seq, messageId: saved.messageId };
    });
    handle('replay', async payload => {
      const after = payload?.after;
      if (!Number.isSafeInteger(after) || after < 0) throw new Error('Invalid cursor');
      const frames = await journal.replay(scope, after, 8);
      return { frames, next: frames.at(-1)?.seq ?? after, more: frames.length === 8 };
    });
  });
  const sweep = setInterval(() => {
    for (const socket of connections) {
      if (socket.data.checking) continue;
      socket.data.checking = true;
      Promise.resolve().then(async () => {
        const {token,scope,claims} = socket.data;
        authorizeEvent(key,token,scope,'replay',{now:clock(),revoked});
        if (!await authorize({token,scope,claims})) throw new Error('Access denied');
      }).catch(() => socket.disconnect(true)).finally(() => { socket.data.checking = false; });
    }
  }, 250);
  sweep.unref();
  await new Promise((resolve, reject) => {
    http.once('error', reject); http.listen(port, '127.0.0.1', resolve);
  }).catch(async error => { clearInterval(sweep); await io.close(); throw error; });
  return { url: `http://127.0.0.1:${http.address().port}`,
    async close() { clearInterval(sweep); await new Promise(resolve => io.close(resolve)); } };
}
