import { open, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const MAX_FRAME = 256 * 1024;
const MAX_LOG = 32 * 1024 * 1024;
const MAX_EVENTS = 10000;
const owners = new Set();
const validId = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x);

// P1 test adapter ONLY. Production persistence must implement this contract
// transactionally in PostgreSQL. This is NOT an Excalidraw scene reconciler.
export async function openJournal(directory) {
  const dir = resolve(directory);
  if (owners.has(dir)) throw new Error('Journal already owned in this process');
  owners.add(dir);
  let lock, handle;
  try {
    await mkdir(dir, { recursive: true });
    // Cross-process single-owner fence; stale locks fail CLOSED after a crash.
    lock = await open(resolve(dir, 'owner.lock'), 'wx', 0o600);
    handle = await open(resolve(dir, 'events.jsonl'), 'a+', 0o600);
    const text = await handle.readFile({ encoding: 'utf8' });
    if (Buffer.byteLength(text) > MAX_LOG) throw new Error('Journal quota exceeded');
    if (text && !text.endsWith('\n')) throw new Error('Incomplete journal tail: explicit recovery required');
    const rows = text ? text.trimEnd().split('\n').map(x => JSON.parse(x)) : [];
    const rooms = new Map(), dedupe = new Map();
    let used = Buffer.byteLength(text), closed = false, closing = false, poisoned = false, chain = Promise.resolve();
    function scope(s) {
      if (!s || !validId(s.workspace) || !validId(s.board)) throw new Error('Invalid scope');
      return s.workspace + '/' + s.board;
    }
    function apply(row) {
      const key = scope(row), list = rooms.get(key) ?? [];
      if (row.seq !== list.length + 1 || !validId(row.messageId) || !validId(row.user)
          || typeof row.ciphertext !== 'string' || typeof row.iv !== 'string') throw new Error('Corrupt journal');
      const identity = key + '/' + row.user + '/' + row.messageId;
      if (dedupe.has(identity)) throw new Error('Duplicate journal identity');
      list.push(row); rooms.set(key, list); dedupe.set(identity, row);
    }
    rows.forEach(apply);
    return {
      append(s, { messageId, user, ciphertext, iv }) {
        if (closing || closed) return Promise.reject(new Error('Journal unavailable'));
        const work = chain.then(async () => {
          if (closed || poisoned) throw new Error('Journal unavailable');
          const key = scope(s), list = rooms.get(key) ?? [];
          if (!validId(messageId) || !validId(user) || !Buffer.isBuffer(ciphertext) || !Buffer.isBuffer(iv)
              || !ciphertext.length || ciphertext.length > MAX_FRAME || iv.length !== 12) throw new Error('Invalid encrypted frame');
          const data = ciphertext.toString('base64'), nonce = iv.toString('base64');
          const previous = dedupe.get(key + '/' + user + '/' + messageId);
          if (previous) {
            if (previous.ciphertext !== data || previous.iv !== nonce) throw new Error('Message ID payload conflict');
            return structuredClone(previous);
          }
          if (list.length >= MAX_EVENTS) throw new Error('Room quota exceeded');
          const row = { workspace: s.workspace, board: s.board, user, messageId, seq: list.length + 1, ciphertext: data, iv: nonce };
          const bytes = Buffer.from(JSON.stringify(row) + '\n');
          if (used + bytes.length > MAX_LOG) throw new Error('Journal quota exceeded');
          try {
            // FileHandle.write can short-write. Do not acknowledge until every byte is fsynced.
            let offset = 0;
            while (offset < bytes.length) {
              const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset);
              if (!bytesWritten) throw new Error('Short journal write');
              offset += bytesWritten;
            }
            await handle.sync();
          } catch (e) { poisoned = true; throw e; }
          used += bytes.length; apply(row);
          return structuredClone(row);
        });
        chain = work.catch(() => {});
        return work;
      },
      async replay(s, after = 0, limit = 10000) {
        await chain;
        if (closed || poisoned) throw new Error('Journal unavailable');
        if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new Error('Invalid replay cursor');
        return structuredClone((rooms.get(scope(s)) ?? []).filter(r => r.seq > after).slice(0, limit));
      },
      async close() {
        closing = true; await chain; closed = true;
        await handle.close(); await lock.close();
        const { unlink } = await import('node:fs/promises');
        await unlink(resolve(dir, 'owner.lock')); owners.delete(dir);
      },
    };
  } catch (e) {
    if (handle) await handle.close();
    if (lock) { await lock.close(); const { unlink } = await import('node:fs/promises'); await unlink(resolve(dir, 'owner.lock')); }
    owners.delete(dir); throw e;
  }
}
