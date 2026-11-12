import test from 'node:test';
import assert from 'node:assert/strict';
import { performTeacherMutation } from './teacher-mutation.mjs';

test('uncertain network response retries the exact request ID without a second write', async () => {
  const state = { pending: {} }, sent = [];
  let times = 0;
  const send = async payload => {
    sent.push(payload);
    if (++times === 1) throw new Error('Connection dropped after server saved the lesson');
    return { status: 'duplicate' };
  };
  const build = () => ({ lesson: { lessonAt: '2026-11-12T12:00:00Z' }, catalogItemId: null });
  await assert.rejects(performTeacherMutation(state, 'lesson', build, send, () => 'request-1'),
    error => error.retrySameRequest === true);
  assert.equal(state.pending.lesson.requestId, 'request-1');
  await assert.rejects(performTeacherMutation(state, 'lesson',
    () => ({ lesson: { lessonAt: '2026-11-13T12:00:00Z' }, catalogItemId: null }), send),
    /прежними данными/);
  assert.equal(sent.length, 1, 'changed data must not be sent under the old ID');
  assert.deepEqual(await performTeacherMutation(state, 'lesson', build, send), { status: 'duplicate' });
  assert.equal(sent[0].lesson.requestId, sent[1].lesson.requestId);
  assert.deepEqual(state.pending, {});
});

test('validation errors release the ID; uncertain server failures keep it', async () => {
  const state = { pending: {} };
  await assert.rejects(performTeacherMutation(state, 'catalog', () => ({ name: 'A' }),
    async () => { throw Object.assign(new Error('Invalid'), { status: 400 }); }, () => 'request-1'),
  error => error.retrySameRequest !== true);
  assert.deepEqual(state.pending, {});
  await assert.rejects(performTeacherMutation(state, 'catalog', () => ({ name: 'A' }),
    async () => { throw Object.assign(new Error('Unknown server outcome'), { status: 503 }); }, () => 'request-2'),
  error => error.retrySameRequest === true);
  assert.equal(state.pending.catalog.requestId, 'request-2');
});
