import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../../EGA/10/dz1.html', import.meta.url), 'utf8');

test('EGE №10 homework 1 keeps its public assignment and adds five percent foundations', () => {
  assert.match(source, /"assignmentId":"HW-EGE10-PART1-MONTHLY"/);
  assert.match(source, /const FIXED_TASKS=\[\.\.\.INTRO_PERCENT_TASKS,\.\.\.CORE_TASKS\]/);
  assert.equal((source.match(/"prototype":"Разминка: базовые проценты"/g) || []).length, 5);

  for (const id of [
    'percent-up-down',
    'percent-return',
    'percent-notebooks',
    'percent-drying-basic',
    'percent-symmetric-p'
  ]) {
    assert.match(source, new RegExp(`"id":"${id}"`));
  }
});

test('EGE №10 homework 1 preserves the seven-answer legacy draft layout', () => {
  assert.match(source, /const TASK_SET_VERSION=2/);
  assert.match(source, /taskIds:FIXED_TASKS\.map\(t=>t\.id\)/);
  assert.match(source, /if\(source\.length===CORE_TASKS\.length\)return\[\.\.\.INTRO_PERCENT_TASKS\.map\(\(\)=>""\),\.\.\.source\]/);
});
