import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function page(name) {
  return readFile(new URL(`../../../EGA/6/${name}`, import.meta.url), 'utf8');
}

test('correct result payload carries counts and a stable per-player completion timestamp', async () => {
  const source = await page('correct.html');
  assert.match(source, /st\.finishedAt=st\.finishedAt\|\|Date\.now\(\)/);
  assert.match(source, /correctCount:Number\(s\.score\)\|\|0,totalCount:completed/);
  assert.match(source, /finishedAt:new Date\(Number\(s\.finishedAt\)\|\|Number\(g\.finishedAt\)\|\|Date\.now\(\)\)\.toISOString\(\)/);
});

test('trig result payload carries the player student code for per-student bearer exchange', async () => {
  const source = await page('триг-уравнения-практика.html');
  assert.match(source, /studentCode:p\?\.code\|\|''/);
});

test('mix exit delivery stays queued and routes through the shared API boundary', async () => {
  const source = await page('mix.html');
  const start = source.indexOf('function bestEffortPayload');
  assert.notEqual(start, -1);
  const end = source.indexOf('function renderFinal', start);
  const body = source.slice(start, end);
  assert.match(body, /queuePayload\(pkey,payload\)/);
  assert.match(body, /platformApi\.sendResultOnExit\(payload\)/);
  assert.doesNotMatch(body, /navigator\.sendBeacon|fetch\(API_URL/);
});
