import test from 'node:test';
import assert from 'node:assert/strict';
import { teacherNeeds, invalidateTeacherData, loadTeacherKey } from './teacher-data.mjs';

const freshState = () => ({ data: {}, loadedAt: {}, inflight: {}, generation: 0 });

test('opens overview with five reads including native homework and loads tabs on demand', async () => {
  const state = freshState(), calls = [];
  let time = 1000;
  const request = async path => { calls.push(path); return [path]; };
  const open = view => Promise.all(teacherNeeds[view].map(key =>
    loadTeacherKey(state, key, request, () => {}, false, () => time)));
  await open('overview');
  assert.deepEqual(calls.sort(), ['homework/assignments', 'homework/native/assignments', 'lessons', 'students', 'subscriptions']);
  await open('results');
  assert.equal(calls.length, 9); // students already loaded; tests/mocks are fetched now.
  await open('overview');
  assert.equal(calls.length, 9); // returning to a fresh tab uses memory cache.
  await Promise.all(teacherNeeds.overview.map(key =>
    loadTeacherKey(state, key, request, () => {}, true, () => time)));
  assert.equal(calls.length, 14); // explicit refresh reads only the active tab.
  time += 30001;
  await open('overview');
  assert.equal(calls.length, 19); // stale data is refreshed on the next visit.
});

test('old responses cannot overwrite data after session change or mutation', async () => {
  const state = freshState();
  let finishOld;
  const old = loadTeacherKey(state, 'students', () => new Promise(resolve => { finishOld = resolve; }), () => {});
  await Promise.resolve();
  invalidateTeacherData(state);
  const fresh = loadTeacherKey(state, 'students', async () => ['new'], () => {});
  finishOld(['old']);
  await Promise.all([old, fresh]);
  assert.deepEqual(state.data.students, ['new']);
  assert.equal(Object.keys(state.inflight).length, 0);
});
