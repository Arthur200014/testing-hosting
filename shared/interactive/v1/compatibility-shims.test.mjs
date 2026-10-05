import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const modules = [
  'drawing-transport',
  'firebase-transport',
  'homework-transport',
  'identity-store',
  'interactive-runtime',
  'legacy-api-client',
  'platform-api',
  'platform-data',
  'platform-realtime',
  'realtime-auth',
  'realtime-result-queue',
  'realtime-session-adapter',
  'result-outbox',
  'session-runtime',
  'shared-board',
  'teacher-cursor'
];

test('старые EGA/6 импорты являются тонкими re-export и ведут в общий пакет', async () => {
  for (const name of modules) {
    const shimUrl = new URL(`../../../EGA/6/shared/v1/${name}.js`, import.meta.url);
    const expectedTarget = `../../../../shared/interactive/v1/${name}.js`;
    const source = (await readFile(shimUrl, 'utf8')).trim();
    assert.equal(source, `export * from '${expectedTarget}';`);
    await access(new URL(expectedTarget, shimUrl));
  }

  const lifecycleShim = new URL('../../../EGA/6/realtime-lifecycle.js', import.meta.url);
  const lifecycleSource = (await readFile(lifecycleShim, 'utf8')).trim();
  assert.match(lifecycleSource, /export \* from '\.\.\/\.\.\/shared\/interactive\/v1\/realtime-lifecycle\.js';$/);
  await access(new URL('../../shared/interactive/v1/realtime-lifecycle.js', lifecycleShim));
});

test('канонические runtime-модули не импортируют код из EGA или OGA', async () => {
  for (const name of [...modules, 'realtime-lifecycle']) {
    const source = await readFile(new URL(`./${name}.js`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /(?:from|import\s*)\s*['"][^'"]*(?:EGA|OGA)\//);
  }
});
