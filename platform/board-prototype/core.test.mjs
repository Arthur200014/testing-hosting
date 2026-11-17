import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { issuePermit, verifyPermit, authorizeEvent } from './access.mjs';
import { openJournal } from './journal.mjs';
import { bindRoom } from './room.mjs';

const now = 1800000000000, key = randomBytes(32), scope = { workspace: 'synthetic-a', board: 'lesson-1' };
const claims = (extra = {}) => ({ ...scope, user: 'synthetic-teacher', role: 'editor', exp: now / 1000 + 60, ...extra });
const frame = (messageId, value = messageId) => ({ messageId, ciphertext: Buffer.from(value), iv: Buffer.alloc(12, 1) });
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'tas-board-p1-'));
  let journal = await openJournal(dir);
  t.after(async () => { await journal.close(); await rm(dir, { recursive: true, force: true }); });
  return { dir, get journal() { return journal; }, async restart() { await journal.close(); journal = await openJournal(dir); } };
}
test('permit binds audience, scope, expiry, signature and role', () => {
  const token = issuePermit(key, claims(), now);
  assert.equal(verifyPermit(key, token, scope, { now }).user, 'synthetic-teacher');
  for (const expected of [{ ...scope, board: 'other' }, { ...scope, workspace: 'other' }])
    assert.throws(() => verifyPermit(key, token, expected, { now }));
  assert.throws(() => verifyPermit(key, token, scope, { now: now + 60000 }));
  assert.throws(() => verifyPermit(randomBytes(32), token, scope, { now }));
  assert.throws(() => verifyPermit(key, token + '.extra', scope, { now }));
  assert.throws(() => issuePermit(key, claims({ exp: now / 1000 + 301 }), now));
  assert.throws(() => issuePermit(key, claims({ role: 'owner' }), now));
  assert.throws(() => issuePermit(Buffer.alloc(4), claims(), now));
});
test('viewer cannot publish; revoked/expired connections cannot keep writing', () => {
  const viewer = issuePermit(key, claims({ role: 'viewer' }), now);
  assert.equal(authorizeEvent(key, viewer, scope, 'replay', { now }).role, 'viewer');
  assert.throws(() => authorizeEvent(key, viewer, scope, 'scene', { now }));
  const token = issuePermit(key, claims(), now);
  assert.throws(() => authorizeEvent(key, token, scope, 'scene', { now, revoked: () => true }));
  assert.throws(() => authorizeEvent(key, token, scope, 'arbitrary-event', { now }));
});
test('21 independent principals: ordered durable frames, replay, retry and restart', async t => {
  const f = await fixture(t);
  const tokens = Array.from({ length: 21 }, (_, i) => issuePermit(key, claims({ user: 'user-' + i }), now));
  const clients = tokens.map(token => bindRoom({ key, token, scope, journal: f.journal, clock: () => now }));
  const results = await Promise.all(clients.map((c, i) => c.submit(frame('draw-' + i))));
  assert.deepEqual(results.map(r => r.seq), Array.from({ length: 21 }, (_, i) => i + 1));
  assert.equal((await clients[0].submit(frame('draw-0'))).seq, 1);
  await assert.rejects(clients[0].submit(frame('draw-0', 'different')));
  await f.restart();
  const restored = await f.journal.replay(scope);
  assert.equal(restored.length, 21);
  assert.deepEqual(restored, results);
  assert.equal((await f.journal.replay(scope, 20)).length, 1);
});
test('scope cannot be overridden in a frame and revoked sockets fail immediately', async t => {
  const f = await fixture(t); let revoked = false, clock = now;
  const token = issuePermit(key, claims(), now);
  const room = bindRoom({ key, token, scope, journal: f.journal, revoked: () => revoked, clock: () => clock });
  await room.submit({ ...frame('one'), workspace: 'foreign', board: 'foreign', user: 'forged' });
  assert.equal((await room.replay())[0].user, 'synthetic-teacher');
  assert.deepEqual(await f.journal.replay({ workspace: 'foreign', board: 'foreign' }), []);
  revoked = true; await assert.rejects(room.submit(frame('two'))); await assert.rejects(room.replay());
  revoked = false; clock += 61000; await assert.rejects(room.submit(frame('three')));
});
test('single writer, payload limits, failure recovery and caller mutation', async t => {
  const f = await fixture(t);
  await assert.rejects(openJournal(f.dir));
  await assert.rejects(f.journal.append(scope, { ...frame('big'), user: 'u', ciphertext: Buffer.alloc(262145) }));
  await assert.rejects(f.journal.append(scope, { ...frame('bad-iv'), user: 'u', iv: Buffer.alloc(1) }));
  const saved = await f.journal.append(scope, { ...frame('good'), user: 'u' });
  saved.seq = 999;
  assert.equal((await f.journal.replay(scope))[0].seq, 1);
  await assert.rejects(f.journal.replay(scope, -1));
});
test('ten separate rooms have independent ordering and no cross-workspace replay', async t => {
  const f = await fixture(t);
  const scopes = Array.from({ length: 10 }, (_, i) => ({ workspace: 'synthetic-' + i % 2, board: 'board-' + i }));
  await Promise.all(scopes.flatMap(s => Array.from({ length: 21 }, (_, i) => f.journal.append(s, { ...frame('msg-' + i), user: 'user-' + i }))));
  await f.restart();
  for (const s of scopes) {
    const rows = await f.journal.replay(s);
    assert.equal(rows.length, 21);
    assert.ok(rows.every(r => r.workspace === s.workspace && r.board === s.board));
  }
});

test('torn tail fails closed instead of silently discarding history', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tas-board-torn-'));
  try {
    const journal = await openJournal(dir);
    await journal.append(scope, { ...frame('saved'), user: 'u' });
    await journal.close();
    await appendFile(join(dir, 'events.jsonl'), '{"partial":');
    await assert.rejects(openJournal(dir), /Incomplete journal tail/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
