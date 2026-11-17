import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io } from 'socket.io-client';
import { issuePermit } from './access.mjs';
import { openJournal } from './journal.mjs';
import { openPostgresJournal } from './postgres.mjs';
import { startTestTransport } from './transport.mjs';

const key = randomBytes(32);
const scope = () => ({ workspace: 'synthetic-' + randomUUID(), board: 'lesson-1' });
const auth = (s, user = 'teacher', role = 'editor', time = Date.now()) => ({ ...s,
  token: issuePermit(key, { ...s, user, role, exp: Math.floor(time / 1000) + 120 }, time) });
const frame = id => ({ messageId: id, ciphertext: Buffer.from('scene-' + id), iv: Buffer.alloc(12, 1) });
async function connect(url, auth) {
  const client = io(url, { auth, transports: ['websocket'], reconnection: false, timeout: 2000, forceNew: true });
  try {
    await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
    return client;
  } catch (e) { client.close(); throw e; }
}
const request = (c, event, payload) => c.timeout(3000).emitWithAck(event, payload);
async function fixture(t, postgres = false, options = {}) {
  const dir = postgres ? null : await mkdtemp(join(tmpdir(), 'tas-board-wire-'));
  const open = () => postgres ? openPostgresJournal(process.env.BOARD_TEST_DATABASE_URL) : openJournal(dir);
  let journal = await open(), server = await startTestTransport({ key, journal, ...options });
  const clients = [];
  t.after(async () => { for (const c of clients) c.close(); await server.close(); await journal.close(); if (dir) await rm(dir, { recursive: true, force: true }); });
  return {
    get journal() { return journal; }, get server() { return server; },
    async client(a) { const c = await connect(server.url, a); clients.push(c); return c; },
    async restart() { for (const c of clients) c.close(); await server.close(); await journal.close(); journal = await open(); server = await startTestTransport({ key, journal, ...options }); },
  };
}
for (const postgres of [false, true]) test(`${postgres ? 'PostgreSQL' : 'filesystem'} wire: distinct teacher/pupils, commit, ordered replay, retry, restart`,
  { skip: postgres && !process.env.BOARD_TEST_DATABASE_URL }, async t => {
    const f = await fixture(t, postgres), s = scope();
    const clients = await Promise.all(['teacher', 'pupil-1', 'pupil-2'].map(u => f.client(auth(s, u))));
    // One outstanding operation per socket; concurrent sockets share one durable revision.
    const saved = await Promise.all(clients.map((c, i) => request(c, 'submit', frame('draw-' + i))));
    assert.ok(saved.every(r => r.ok));
    assert.deepEqual(saved.map(r => r.seq).sort(), [1, 2, 3]);
    assert.deepEqual(await request(clients[0], 'submit', frame('draw-0')), saved[0]);
    assert.equal((await request(clients[0], 'submit', { ...frame('draw-0'), ciphertext: Buffer.from('conflict') })).ok, false);
    const replay = await request(clients[1], 'replay', { after: 0 });
    assert.equal(replay.frames.length, 3);
    assert.deepEqual(replay.frames.map(r => r.seq), [1, 2, 3]);
    assert.deepEqual(new Set(replay.frames.map(r => r.user)), new Set(['teacher', 'pupil-1', 'pupil-2']));
    const other = await f.client(auth({ ...s, workspace: 'foreign' }));
    assert.deepEqual((await request(other, 'replay', { after: 0 })).frames, []);
    await f.restart();
    const fresh = await f.client(auth(s, 'pupil-1'));
    assert.deepEqual((await request(fresh, 'replay', { after: 0 })).frames, replay.frames);
    assert.equal((await request(fresh, 'submit', frame('next'))).seq, 4);
  });

test('wire rejects forged scope, viewer writes, expired/revoked access and arbitrary destinations', async t => {
  let time = Date.now(), denied = false;
  const f = await fixture(t, false, { clock: () => time, revoked: () => denied });
  const s = scope(), valid = auth(s, 'teacher', 'editor', time);
  await assert.rejects(f.client({ ...valid, board: 'foreign' }), /denied/);
  await assert.rejects(f.client({ ...valid, token: valid.token + 'x' }), /denied/);
  await assert.rejects(f.client({ ...valid, sceneKey: 'must-not-be-handshake-input' }), /denied/);
  const viewer = await f.client(auth(s, 'viewer', 'viewer', time));
  assert.deepEqual((await request(viewer, 'replay', { after: 0 })).frames, []);
  assert.equal((await request(viewer, 'submit', frame('blocked'))).error, 'ACCESS_DENIED');
  const editor = await f.client(valid);
  assert.equal((await request(editor, 'submit', { ...frame('one'), workspace: 'foreign', board: 'other', user: 'forged' })).ok, true);
  const rows = (await request(editor, 'replay', { after: 0 })).frames;
  assert.equal(rows[0].workspace, s.workspace); assert.equal(rows[0].user, 'teacher');
  const readonly = await f.client(auth(s, 'readonly', 'viewer', time));
  denied = true;
  assert.equal((await request(readonly, 'replay', { after: 0 })).error, 'ACCESS_DENIED');
  denied = false; time += 121000;
  assert.equal((await request(editor, 'replay', { after: 0 })).error, 'ACCESS_DENIED');
  await assert.rejects(f.client(valid), /denied/);
});

test('bounded replay, connection quota, no false acknowledgement on database failure or pending write', async t => {
  const f = await fixture(t, false, { maxRoomConnections: 2 }), s = scope();
  const c = await f.client(auth(s)), second = await f.client(auth(s, 'pupil'));
  await assert.rejects(f.client(auth(s, 'excess')), /denied/);
  for (let i = 0; i < 10; i++) assert.equal((await request(c, 'submit', frame('m-' + i))).ok, true);
  const page = await request(c, 'replay', { after: 0 });
  assert.equal(page.frames.length, 8); assert.equal(page.more, true); assert.equal(page.next, 8);
  assert.equal((await request(c, 'replay', { after: page.next })).frames.length, 2);
  assert.equal((await request(c, 'replay', { after: -1 })).ok, false);
  assert.equal((await request(c, 'submit', { ...frame('bad'), iv: Buffer.alloc(1) })).ok, false);
  const append = f.journal.append;
  let release;
  f.journal.append = async (...args) => { await new Promise(resolve => { release = resolve; }); return append(...args); };
  const pending = request(c, 'submit', frame('pending'));
  // Arrival barrier: observing BUSY proves the first request has reached the server.
  while (!release) await new Promise(resolve => setImmediate(resolve));
  try { assert.equal((await request(c, 'replay', { after: 0 })).error, 'BUSY'); }
  finally { release(); }
  assert.equal((await pending).ok, true);
  f.journal.append = async () => { throw new Error('synthetic database outage'); };
  assert.equal((await request(second, 'submit', frame('outage'))).ok, false);
  assert.equal((await request(second, 'replay', { after: 0 })).frames.length, 8);
});

test('PostgreSQL wire supplement: ten isolated rooms × 21 identities, parallel saves and restore',
  { skip: !process.env.BOARD_TEST_DATABASE_URL }, async t => {
    const started = performance.now(), f = await fixture(t, true);
    const run = randomUUID(), scopes = Array.from({ length: 10 }, (_, i) => ({
      workspace: 'synthetic-' + run + '-' + (i % 2), board: 'lesson-' + i,
    }));
    const rooms = await Promise.all(scopes.map(s => Promise.all(Array.from({ length: 21 }, (_, i) => f.client(auth(s, 'principal-' + i))))));
    await Promise.all(rooms.map(async (clients, room) => {
      const results = await Promise.all(clients.map((c, i) => request(c, 'submit', frame('room-' + room + '-draw-' + i))));
      assert.ok(results.every(x => x.ok));
      assert.deepEqual(results.map(x => x.seq).sort((a, b) => a - b), Array.from({ length: 21 }, (_, i) => i + 1));
    }));
    await f.restart();
    for (let i = 0; i < scopes.length; i++) {
      const c = await f.client(auth(scopes[i], 'restored-reader'));
      let after = 0; const frames = [];
      for (;;) {
        const page = await request(c, 'replay', { after }); assert.equal(page.ok, true);
        frames.push(...page.frames); after = page.next; if (!page.more) break;
      }
      assert.equal(frames.length, 21);
      assert.ok(frames.every(x => x.workspace === scopes[i].workspace && x.board === scopes[i].board
        && x.messageId.startsWith('room-' + i + '-')));
    }
    console.log(JSON.stringify({ profile: 'protocol-only-10x21-one-frame', durationMs: Math.round(performance.now() - started),
      rssBytes: process.memoryUsage().rss, note: 'Not browser, editor, sustained load or convergence acceptance' }));
  });

test('revocation during a storage read never releases the already-read scene', async t => {
  let revoked = false, release;
  const f = await fixture(t, false, { revoked: () => revoked }), s = scope();
  const c = await f.client(auth(s));
  assert.equal((await request(c, 'submit', frame('secret'))).ok, true);
  const replay = f.journal.replay;
  f.journal.replay = async (...args) => {
    const rows = await replay(...args);
    await new Promise(resolve => { release = resolve; }); return rows;
  };
  const pending = request(c, 'replay', { after: 0 });
  while (!release) await new Promise(resolve => setImmediate(resolve));
  revoked = true; release();
  const result = await pending;
  assert.equal(result.ok, false); assert.equal(result.frames, undefined);
});

test('async API authorization is checked on connected operations and idle revocation', async t => {
  let allowed = true;
  const f = await fixture(t,false,{authorize:async()=>allowed});
  const s=scope(),c=await f.client(auth(s));
  assert.equal((await request(c,'submit',frame('authorized'))).ok,true);
  allowed=false;
  assert.equal((await request(c,'replay',{after:0})).error,'ACCESS_DENIED');
  await assert.rejects(f.client(auth(s,'new')),/denied/);
  allowed=true;const idle=await f.client(auth(s,'idle'));
  const disconnected=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Idle access not revoked')),2000);idle.once('disconnect',()=>{clearTimeout(timer);resolve();});});
  allowed=false;await disconnected;
});

test('PostgreSQL wire files: durable reference gate, viewer/foreign denial, immutable retry and restart',
  {skip:!process.env.BOARD_TEST_DATABASE_URL},async t=>{
    const {png}=await import('./file-fixtures.mjs');
    const f=await fixture(t,true),s=scope();
    const c=await f.client(auth(s)),foreign=await f.client(auth({...s,workspace:'foreign-'+randomUUID()}));
    const put={id:'photo',name:'photo.png',mimeType:'image/png',data:png};
    assert.equal((await request(c,'submit',{...frame('missing'),fileIds:['photo']})).ok,false);
    assert.equal((await request(c,'file:put',put)).ok,true);
    assert.equal((await request(c,'file:put',put)).ok,true);
    assert.equal((await request(c,'file:put',{...put,name:'changed.png'})).ok,false);
    assert.equal((await request(foreign,'file:get',{id:'photo'})).ok,false);
    const viewer=await f.client(auth(s,'viewer','viewer'));
    assert.equal((await request(viewer,'file:get',{id:'photo'})).ok,true);
    assert.equal((await request(viewer,'file:put',{...put,id:'forbidden'})).error,'ACCESS_DENIED');
    assert.equal((await request(c,'submit',{...frame('saved'),fileIds:['photo']})).seq,1);
    await f.restart();const restored=await f.client(auth(s,'fresh'));
    assert.deepEqual(Buffer.from((await request(restored,'file:get',{id:'photo'})).file.data),png);
    assert.deepEqual((await request(restored,'replay',{after:0})).frames[0].fileIds,['photo']);
  });
