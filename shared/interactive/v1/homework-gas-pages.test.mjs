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
    if (task >= 6 && task <= 10) {
      assert.match(source, /createHomeworkTransport/, file);
    } else {
      migrated += 1;
      const tag = source.match(/<script src="([^"]*homework-gas-core\.js)"><\/script>/);
      assert.ok(tag, file);
      const target = resolve(file, '..', tag[1]);
      assert.equal(target, join(project, 'shared/interactive/v1/homework-gas-core.js'), file);
      assert.doesNotMatch(source, /https:\/\/script\.google\.com\/macros\/s\//, file);
      assert.doesNotMatch(source, /fetch\(API_URL/, file);
    }
  }
  assert.equal(checked, 31, 'Update the first-part homework inventory when pages change');
  assert.equal(migrated, 17, 'Update the remaining-homework inventory when pages change');
});
