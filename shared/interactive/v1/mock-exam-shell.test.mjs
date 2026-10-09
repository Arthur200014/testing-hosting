import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync(new URL('../../../EGA/config/probnic.html', import.meta.url), 'utf8');
const payloads = shell.match(/const CHILDREN=\{ege:\{label:'[^']+',teacherButton:'[^']+',htmlB64:'([^']+)'\},oge:\{label:'[^']+',teacherButton:'[^']+',htmlB64:'([^']+)'\}\};/);
assert.ok(payloads, 'embedded exam payloads must exist');
const ege = Buffer.from(payloads[1], 'base64').toString('utf8');
const oge = Buffer.from(payloads[2], 'base64').toString('utf8');

test('student shell has one exam entry and routes a verified code by program', () => {
  assert.equal((shell.match(/class="quick-launch student"/g) || []).length, 1);
  assert.match(shell, />Открыть пробник<\/button>/);
  assert.doesNotMatch(shell, /data-open="(?:ege|oge)"/);
  assert.match(shell, /STUDENT_SESSION_KEY='mockExam:student:v1'/);
  assert.match(shell, /programId==='EGE_MATH'\?'ege':programId==='OGE_MATH'\?'oge'/);
  assert.match(shell, /validateStudentRoute\(rememberedStudent\.code\)/);
  assert.match(shell, /openExam\(rememberedType,false,rememberedStudent\.code\)/);
  assert.match(shell, /code\.value=pendingStudentCode;login\.click\(\)/);
});

test('OGE matches the shared visual language without exposing administrative duration', () => {
  assert.doesNotMatch(oge, />235 минут</);
  assert.match(oge, /id="ogeOrbTrack"/);
  assert.match(oge, /OGE_ORB_COLORS=\[/);
  assert.match(oge, /data-oge-task/);
  assert.match(oge, /ogeCoreFloat/);
  assert.match(oge, /\.task-no\{width:44px;height:44px;border-radius:50%!important/);
});

test('screenshot sheets allow scrolling instead of clipping long conditions', () => {
  assert.match(ege, /\.shot-stage\{[^}]*overflow:auto\}/);
  assert.match(ege, /\.shot-page\{[^}]*overflow:auto/);
  assert.match(ege, /\.shot-task\{[^}]*overflow:visible/);
  assert.match(oge, /\.shot-stage\{[^}]*overflow:auto\}/);
  assert.match(oge, /\.shot-page\{[^}]*overflow:auto/);
  assert.match(oge, /\.shot-body\{height:778px;overflow:auto/);
  assert.match(oge, /\.shot-task\{[^}]*overflow:visible/);
});
