import assert from 'node:assert/strict';
import test from 'node:test';
import { selectScopes } from './tas-ci-scope.mjs';

const taskBranch = 'tas/P08-03';
const pick = (files, branch = taskBranch, forced = 'auto') => selectScopes(files, branch, forced);

test('shared runtime change selects only shared module tests', () => {
  const r = pick(['shared/interactive/v1/platform-api.js']);
  assert.deepEqual([r.run_shared, r.run_backend, r.run_web, r.run_task], [true, false, false, false]);
});
test('backend code selects PostgreSQL integration suite only', () => {
  const r = pick(['platform/src/Platform.Api/Program.cs']);
  assert.deepEqual([r.run_shared, r.run_backend, r.run_web, r.run_task], [false, true, false, false]);
});
test('web code selects only frontend checks', () => {
  const r = pick(['web/src/app/page.tsx']);
  assert.deepEqual([r.run_shared, r.run_backend, r.run_web, r.run_task], [false, false, true, false]);
});
test('EGA page change requires task-specific test', () => {
  const r = pick(['EGA/13/gaid.html']);
  assert.equal(r.run_task, true);
  assert.equal(r.task_id, 'P08-03');
  assert.equal(r.run_backend, false);
});
test('docs-only change does not run unrelated application suites', () => {
  const r = pick(['.ai/tas/HANDOFF.md', '.ai/tasks/tas-P08-03.md']);
  assert.equal(r.run_shared || r.run_backend || r.run_task || r.run_web, false);
});
test('workflow change runs only the selector self-tests', () => {
  const r = pick(['.github/workflows/tas-task-ci.yml']);
  assert.deepEqual([r.run_shared, r.run_backend, r.run_web, r.run_task], [false, false, false, false]);
});
test('mix of backend and shared changes selects both and nothing else', () => {
  const r = pick(['platform/tests/Test.cs', 'shared/interactive/v1/aspnet-api-client.js']);
  assert.deepEqual([r.run_shared, r.run_backend, r.run_web, r.run_task], [true, true, false, false]);
});
test('task-specific test file activates the task runner', () => {
  assert.equal(pick(['tests/tas/P08-03.test.mjs']).run_task, true);
});
test('fail closed: task UI change without a valid task branch', () => {
  assert.throws(() => pick(['OGA/20/probnic.html'], 'main'), /require branch/);
});
test('manual target supports selected module without code changes', () => {
  const r = pick([], taskBranch, 'shared');
  assert.deepEqual([r.run_shared, r.run_backend, r.run_web, r.run_task], [true, false, false, false]);
});
test('rejects invalid manual target', () => {
  assert.throws(() => pick([], taskBranch, 'rm -rf /'), /Unknown CI target/);
});
test('deduplicates changes and ignores blank lines', () => {
  const r = pick(['', 'platform/x.cs', 'platform/x.cs', '  ', 'compose.yaml']);
  assert.equal(r.changed_count, 2);
  assert.equal(r.run_backend, true);
});
