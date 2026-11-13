export const teacherPaths = {
  programs: 'programs', students: 'students', lessons: 'lessons',
  catalog: 'homework/catalog', assignments: 'homework/assignments',
  submissions: 'homework/submissions', subscriptions: 'subscriptions',
  nativeTasks: 'homework/native/tasks', nativeAssignments: 'homework/native/assignments',
  tests: 'tests/history', liveTests: 'tests/attempts',
  mocks: 'mocks/results', mockSessions: 'mocks/sessions'
};

export const teacherNeeds = {
  overview: ['students', 'lessons', 'assignments', 'nativeAssignments', 'subscriptions'],
  students: ['students', 'programs'],
  lessons: ['students', 'programs', 'lessons', 'catalog'],
  homework: ['students', 'programs', 'catalog', 'assignments', 'submissions', 'nativeTasks', 'nativeAssignments'],
  subscriptions: ['students', 'subscriptions'],
  results: ['students', 'tests', 'liveTests', 'mocks', 'mockSessions'],
  report: ['students', 'lessons', 'assignments', 'nativeAssignments', 'tests', 'liveTests', 'mocks']
};

export function invalidateTeacherData(state) {
  state.generation++;
  state.data = {};
  state.loadedAt = {};
  state.inflight = {};
}

export function loadTeacherKey(state, key, request, onUpdate, force = false, now = Date.now) {
  if (state.inflight[key]) return state.inflight[key];
  if (!force && state.loadedAt[key] != null && now() - state.loadedAt[key] < 30000)
    return Promise.resolve();
  // Keep the previous successful value visible while a stale/forced read refreshes.
  // Session changes and successful mutations still clear all cached data via
  // invalidateTeacherData, preventing cross-session or post-write stale data.
  const generation = state.generation;
  const promise = Promise.resolve().then(() => request(teacherPaths[key])).then(value => {
    if (generation !== state.generation) return;
    state.data[key] = value;
    state.loadedAt[key] = now();
    onUpdate(key);
  }).finally(() => { if (state.inflight[key] === promise) delete state.inflight[key]; });
  state.inflight[key] = promise;
  return promise;
}
