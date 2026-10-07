import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const project = resolve(import.meta.dirname, '../../..');

async function homeworkPages() {
  const found = [];
  async function walk(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, item.name);
      if (item.isDirectory()) await walk(file);
      else if (/^dz[^/]*\.html$/i.test(item.name)) found.push(file);
    }
  }
  await walk(join(project, 'EGA'));
  return found;
}

test('all first-part EGE homework pages in scope use the shared GAS transport boundary', async () => {
  const files = await homeworkPages();
  assert.equal(files.length, 50, 'Update this inventory if homework pages are added or removed');
  let checked = 0;
  let migrated = 0;
  for (const file of files) {
    const task = Number(file.match(/\/EGA\/(\d+)\//)?.[1]);
    if (!(task >= 1 && task <= 11)) continue;
    checked += 1;
    const source = await readFile(file, 'utf8');
    assert.match(source, /createHomeworkTransport/, file);
    assert.doesNotMatch(source, /homework-gas-core|HomeworkGasCore/, file);
    migrated += 1;
    const imported = source.match(/from\s+['"]([^'"]*homework-transport\.js)['"]/);
    assert.ok(imported, file);
    const target = resolve(file, '..', imported[1]);
    assert.equal(target, join(project, 'shared/interactive/v1/homework-transport.js'), file);
    assert.match(source, /decideHomeworkSubmission/, file);
    assert.match(source, /attempt\.shouldQueue/, file);
    assert.doesNotMatch(source, /Заполните все поля/i, file);
    assert.doesNotMatch(source, /https:\/\/script\.google\.com\/macros\/s\//, file);
    assert.doesNotMatch(source, /fetch\(API_URL/, file);
  }
  assert.equal(checked, 31, 'Update the first-part homework inventory when pages change');
  assert.equal(migrated, 31, 'Update the first-part policy inventory when pages change');
});
