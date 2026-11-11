import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Select test suites by files changed within one TAS task; never infer PASS from skipped jobs.
export function selectScopes(paths, branch, forced = 'auto') {
  const scopes = new Set(['auto', 'shared', 'backend', 'web', 'task']);
  if (!scopes.has(forced)) throw new Error('Unknown CI target: ' + forced);
  const files = [...new Set(paths.map(x => x.trim()).filter(Boolean))];
  const task = /^tas\/(P\d{2}-\d{2})$/.exec(branch)?.[1] ?? '';
  const includes = re => files.some(path => re.test(path));
  const config = includes(/^(\.github\/workflows\/tas-task-ci\.yml|scripts\/tas-ci-scope(?:\.test)?\.mjs)$/);
  const backend = includes(/^(platform\/|compose\.yaml$)/);
  const shared = includes(/^shared\/interactive\/v1\//);
  const web = includes(/^web\//);
  const taskCode = includes(/^(EGA\/|OGA\/|scripts\/(?!tas-ci-scope(?:\.test)?\.mjs$))/);
  const taskTests = includes(/^tests\/tas\//);
  const result = {
    run_backend: backend || config || forced === 'backend',
    run_shared: shared || config || forced === 'shared',
    run_web: web || forced === 'web',
    run_task: taskCode || taskTests || forced === 'task',
    task_id: task,
    changed_count: files.length,
  };
  if (result.run_task && !result.task_id) {
    throw new Error('Task-specific tests require branch tas/Pxx-yy');
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const changeFile = process.argv[2];
  if (!changeFile) throw new Error('Usage: node scripts/tas-ci-scope.mjs <changed-file-list>');
  const paths = readFileSync(changeFile, 'utf8').split(/\r?\n/);
  const result = selectScopes(paths, process.env.TAS_CI_BRANCH ?? '', process.env.TAS_CI_TARGET ?? 'auto');
  const outputs = Object.entries(result).map(([key, value]) => key + '=' + value).join('\n') + '\n';
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, outputs);
  process.stdout.write(JSON.stringify({ changed: paths.filter(Boolean), selected: result }, null, 2) + '\n');
}
