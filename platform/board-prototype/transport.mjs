import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { Server } from 'socket.io';
import { authorizeEvent } from './access.mjs';
import { bindRoom } from './room.mjs';
import {MAX_FILE_BYTES,references} from './files.mjs';

export function startTestTransport(options) {
  const server = createServer((_, res) => { res.writeHead(404); res.end(); });
  return startTransport(server, options);
}

export function startStagingTransport({tls, handler, authorize, ...options}) {
  if (!tls?.key || !tls.cert || typeof authorize !== 'function')
    throw new Error('TLS and API authorization are required for staging');
  const server = createHttpsServer(tls, handler);
  const sameOrigin = request => request.headers.origin === `https://127.0.0.1:${server.address()?.port}`;
  return startTransport(server, {...options, authorize}, sameOrigin);
}

export function startPilotTransport({handler, authorize, origin, host = '127.0.0.1', ...options}) {
  if (origin?.protocol !== 'https:' || typeof authorize !== 'function')
    throw new Error('An HTTPS pilot origin and API authorization are required');
  const server = createServer((req, res) => {
    if (req.headers.host !== origin.host) return res.writeHead(404).end();
    return handler(req, res);
  });
  const sameOrigin = req => req.headers.host === origin.host && req.headers.origin === origin.origin;
  return startTransport(server, {...options, authorize}, sameOrigin, host, origin.origin);
}

// Scene payloads stay opaque; reconstruction/reconciliation belongs to the editor.
async function startTransport(http, { key, journal, revoked = () => false,
  authorize = async () => true, acknowledge = () => true, observe = () => {}, clock = Date.now, port = 0, maxConnections = 256, maxRoomConnections = 24 }, allowRequest, host = '127.0.0.1', advertisedUrl) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid test port');
  const io = new Server(http, { serveClient: false, transports: ['websocket'],
    maxHttpBufferSize: MAX_FILE_BYTES+32768, perMessageDeflate: false, allowUpgrades: false,
    ...(allowRequest && {allowRequest: (request, callback) => callback(null, allowRequest(request))}) });
  const connections = new Set(), counts = new Map();let activeOperations=0;
  const waiters=new Map();
  const notify=scope=>{for(const release of waiters.get(scope.workspace+'/'+scope.board)??[])release();};
  function waiter(socket){
    const id=socket.data.roomId,set=waiters.get(id)??new Set();waiters.set(id,set);
    let done=false,timer,resolve;const promise=new Promise(r=>resolve=r);
    const release=()=>{if(done)return;done=true;clearTimeout(timer);set.delete(release);if(!set.size)waiters.delete(id);if(socket.data.cancelReplay===release)socket.data.cancelReplay=undefined;resolve();};
    set.add(release);socket.data.cancelReplay=release;timer=setTimeout(release,1000);return{promise,release};
  }
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
      socket.data = { scope, token, roomId, claims, verifiedAt:clock() };
      next();
    } catch { next(new Error('Room access denied')); }
  });
  io.on('connection', socket => {
    const { scope, token, roomId } = socket.data;
    observe({event:'connection',phase:'connected',connections:connections.size});
    let room;
    try { room = bindRoom({ key, token, scope, journal, revoked, clock }); }
    catch { connections.delete(socket); counts.set(roomId, counts.get(roomId) - 1); socket.disconnect(true); return; }
    const check = async event => {
      const claims = authorizeEvent(key, token, scope, event, { now: clock(), revoked });
      if (!await authorize({token,scope,claims})) throw new Error('Access denied');
      authorizeEvent(key, token, scope, event, { now: clock(), revoked });
      socket.data.verifiedAt=clock();
    };
    let pending = false, windowAt = clock(), requests = 0;
    // Cancellation can only wake this socket's own pending replay. It returns
    // no data and never substitutes for the live post-read authorization check.
    socket.on('replay:cancel',()=>{socket.data.cancelRequested=true;socket.data.cancelReplay?.();});
    socket.on('disconnect', reason => {
      socket.data.cancelReplay?.();
      observe({event:'connection',phase:'disconnected',reason,connections:connections.size-1});
      connections.delete(socket);
      const n = counts.get(roomId) - 1;
      if (n) counts.set(roomId, n); else counts.delete(roomId);
    });
    function handle(event, action) {
      socket.on(event, async (payload, ack) => {
        if (typeof ack !== 'function') return;
        if (clock() - windowAt >= 1000) { windowAt = clock(); requests = 0; }
        if (++requests > 50 || pending) { ack({ ok: false, error: 'BUSY' });observe({event,durationMs:0,acknowledged:false,reason:'BUSY'}); return; }
        observe({event,phase:'started',pendingOperations:++activeOperations});
        pending = true;socket.data.pendingOperation=true;const started=performance.now();let acknowledged=false,reason='DISCONNECTED';
        try {
          try { await check(['submit','file:put','checkpoint'].includes(event) ? 'scene' : 'replay'); }
          catch { reason='ACCESS_DENIED';ack({ok:false,error:'ACCESS_DENIED'}); socket.disconnect(true); return; }
          const result = await action(payload);
          // Recheck before any data leaves the process, including slow storage reads.
          await check('replay');
          // Test-only fault injection models a durable commit whose acknowledgement is lost.
          if (!acknowledge({event,scope,result,claims:socket.data.claims})) { reason='INJECTED_ACK_LOSS'; socket.disconnect(true); return; }
          if (socket.connected) { ack({ ok: true, ...result }); acknowledged=true; }
        } catch {
          reason='REQUEST_FAILED';if (socket.connected) ack({ ok: false, error: 'REQUEST_FAILED' });
        } finally { pending = false;socket.data.pendingOperation=false;observe({event,pendingOperations:activeOperations--,durationMs:performance.now()-started,acknowledged,...(!acknowledged?{reason}:{})}); }
      });
    }
    handle('submit', async payload => {
      if (!payload || !Buffer.isBuffer(payload.ciphertext) || !Buffer.isBuffer(payload.iv))
        throw new Error('Binary frame required');
      const saved = await room.submit({ messageId: payload.messageId,
        ciphertext: payload.ciphertext, iv: payload.iv, fileIds:references(payload.fileIds) });
      notify(scope);
      // A sequence acknowledgement is produced only after durable append completes.
      // No blind room broadcast: every client pulls authorized ordered pages.
      return { seq: saved.seq, messageId: saved.messageId };
    });
    handle('checkpoint',async payload=>{
      if(socket.data.claims.authRole!=='teacher'||!journal.checkpoint)throw new Error('Teacher checkpoint required');
      const result=await journal.checkpoint(scope,{base:payload?.base,messageId:payload?.messageId,ciphertext:payload?.ciphertext,iv:payload?.iv,fileIds:payload?.fileIds,user:socket.data.claims.user});
      if(result.accepted)notify(scope);return result;
    });
    handle('file:put', async payload => {
      if(!journal.putFile)throw new Error('File storage unavailable');
      const {data,...file}=await journal.putFile(scope,{id:payload?.id,name:payload?.name,mimeType:payload?.mimeType,data:payload?.data,user:socket.data.claims.user});
      return {file};
    });
    handle('file:get', async payload => {
      if(!journal.getFile)throw new Error('File storage unavailable');
      const file=await journal.getFile(scope,payload?.id);
      if(!file)throw new Error('File not found');
      return {file};
    });
    handle('replay', async payload => {
      const after = payload?.after;
      if (!Number.isSafeInteger(after) || after < 0) throw new Error('Invalid cursor');
      const waiting=payload?.wait===true?waiter(socket):null;
      const read=async()=>{if(journal.read)return journal.read(scope,after,8);const frames=await journal.replay(scope,after,8);return{frames,next:frames.at(-1)?.seq??after,more:frames.length===8};};
      try{
        // Register before reading: a concurrent commit cannot slip between the
        // empty read and waiter registration. Signals carry no network payload.
        const view=await read();
        if(waiting&&!view.checkpoint&&!view.frames.length&&!socket.data.cancelRequested){await waiting.promise;socket.data.cancelRequested=false;return read();}
        socket.data.cancelRequested=false;return view;
      }finally{waiting?.release();}
    });
  });
  const sweep = setInterval(() => {
    for (const socket of connections) {
      // Active RPCs already perform fresh before/after checks. Only avoid a
      // duplicate periodic check while an operation is in flight. Waiting replay
      // is bounded to one second and must revalidate before returning any data.
      // No cached result authorizes an operation; idle sockets still get swept.
      if (socket.data.pendingOperation || socket.data.checking || clock()-socket.data.verifiedAt<250) continue;
      socket.data.checking = true;
      Promise.resolve().then(async () => {
        const {token,scope,claims} = socket.data;
        authorizeEvent(key,token,scope,'replay',{now:clock(),revoked});
        if (!await authorize({token,scope,claims})) throw new Error('Access denied');
        authorizeEvent(key,token,scope,'replay',{now:clock(),revoked});socket.data.verifiedAt=clock();
      }).catch(() => socket.disconnect(true)).finally(() => { socket.data.checking = false; });
    }
  }, 250);
  sweep.unref();
  await new Promise((resolve, reject) => {
    http.once('error', reject); http.listen(port, host, resolve);
  }).catch(async error => { clearInterval(sweep); await io.close(); throw error; });
  return { url: advertisedUrl ?? `${allowRequest ? 'https' : 'http'}://127.0.0.1:${http.address().port}`, port: http.address().port,
    // Test controller only; never exposed as a network operation.
    disconnectUser(user) { for(const socket of connections)if(socket.data.claims.user===user)socket.disconnect(true); },
    async close() { clearInterval(sweep); await new Promise(resolve => io.close(resolve)); } };
}
