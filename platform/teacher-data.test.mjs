import test from 'node:test';
import assert from 'node:assert/strict';
import { teacherNeeds, teacherMutationKeys, invalidateTeacherData, invalidateTeacherKeys, loadTeacherKey } from './teacher-data.mjs';

const freshState = () => ({ data: {}, loadedAt: {}, inflight: {}, generation: 0 });

test('opens Meleto class overview with two reads and loads other tabs on demand', async () => {
  const state = freshState(), calls = [];
  let time = 1000;
  const request = async path => { calls.push(path); return [path]; };
  const open = view => Promise.all(teacherNeeds[view].map(key =>
    loadTeacherKey(state, key, request, () => {}, false, () => time)));
  await open('overview');
  assert.deepEqual(calls.sort(), ['lessons', 'students']);
  await open('results');
  assert.equal(calls.length, 6); // students already loaded; tests/mocks are fetched now.
  await open('overview');
  assert.equal(calls.length, 6); // returning to a fresh tab uses memory cache.
  await Promise.all(teacherNeeds.overview.map(key =>
    loadTeacherKey(state, key, request, () => {}, true, () => time)));
  assert.equal(calls.length, 8); // explicit refresh reads only the active tab.
  time += 30001;
  await open('overview');
  assert.equal(calls.length, 10); // stale data is refreshed on the next visit.
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

test('stale and forced refresh keep the last successful view until new data arrives', async () => {
  const state = freshState();
  let time = 1000;
  await loadTeacherKey(state, 'students', async () => ['initial'], () => {}, false, () => time);
  assert.deepEqual(state.data.students, ['initial']);

  time += 30001;
  let complete;
  const stale = loadTeacherKey(state, 'students', () => new Promise(resolve => { complete = resolve; }),
    () => {}, false, () => time);
  await Promise.resolve();
  assert.deepEqual(state.data.students, ['initial']);
  assert.equal(state.loadedAt.students, 1000);
  complete(['fresh']);
  await stale;
  assert.deepEqual(state.data.students, ['fresh']);
  assert.equal(state.loadedAt.students, time);

  let forceComplete;
  const forced = loadTeacherKey(state, 'students', () => new Promise(resolve => { forceComplete = resolve; }),
    () => {}, true, () => time);
  await Promise.resolve();
  assert.deepEqual(state.data.students, ['fresh']);
  forceComplete(['forced']);
  await forced;
  assert.deepEqual(state.data.students, ['forced']);
});

test('failed refresh leaves existing data on screen and permits retry', async () => {
  const state = freshState();
  let time = 1000;
  await loadTeacherKey(state, 'students', async () => ['cached'], () => {}, false, () => time);
  time += 30001;
  await assert.rejects(loadTeacherKey(state, 'students', () => Promise.reject(new Error('offline')),
    () => {}, false, () => time), /offline/);
  assert.deepEqual(state.data.students, ['cached']);
  assert.equal(state.loadedAt.students, 1000);
  assert.equal(Object.keys(state.inflight).length, 0);
  await loadTeacherKey(state, 'students', async () => ['recovered'], () => {}, false, () => time);
  assert.deepEqual(state.data.students, ['recovered']);
});


test('a successful mutation refetches only its modified resource instead of the whole tab', async () => {
  const state = freshState();
  const calls = [];
  const request = async path => { calls.push(path); return [path]; };
  await Promise.all(teacherNeeds.homework.map(key =>
    loadTeacherKey(state, key, request, () => {})));
  assert.equal(calls.length, 7);
  assert.deepEqual(teacherMutationKeys.nativeAssignForm, ['nativeAssignments']);
  assert.deepEqual(teacherMutationKeys.nativeTaskForm, ['nativeTasks']);
  assert.deepEqual(teacherMutationKeys.lessonForm, ['lessons', 'assignments']);
  assert.deepEqual(teacherMutationKeys.lessonCorrectionForm, ['lessons']);
  assert.deepEqual(teacherMutationKeys.studentEditForm, ['students']);
  assert.deepEqual(teacherMutationKeys.subscriptionForm, ['subscriptions']);

  const cachedStudents = state.data.students;
  const cachedCatalog = state.data.catalog;
  invalidateTeacherKeys(state, teacherMutationKeys.nativeAssignForm);
  assert.strictEqual(state.data.students, cachedStudents);
  assert.strictEqual(state.data.catalog, cachedCatalog);
  assert.equal(state.data.nativeAssignments, undefined);
  await Promise.all(teacherNeeds.homework.map(key =>
    loadTeacherKey(state, key, request, () => {})));
  assert.equal(calls.length, 8); // 7 initial reads, only 1 after native assignment
  assert.equal(calls.at(-1), 'homework/native/assignments');
});

test('an old response cannot overwrite a targeted post-write refresh, but unrelated reads survive', async () => {
  const state = freshState();
  await loadTeacherKey(state, 'students', async () => ['student'], () => {});
  let resolveOld;
  const old = loadTeacherKey(state, 'nativeAssignments',
    () => new Promise(resolve => { resolveOld = resolve; }), () => {});
  await Promise.resolve();
  invalidateTeacherKeys(state, ['nativeAssignments']);
  const current = loadTeacherKey(state, 'nativeAssignments', async () => ['new assignment'], () => {});
  resolveOld(['obsolete']);
  await Promise.all([old, current]);
  assert.deepEqual(state.data.nativeAssignments, ['new assignment']);
  assert.deepEqual(state.data.students, ['student']);
  assert.equal(Object.keys(state.inflight).length, 0);
  invalidateTeacherData(state);
  assert.equal(Object.keys(state.data).length, 0);
  assert.equal(Object.keys(state.keyVersions).length, 0);
});
