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
  assert.match(shell, /overlay\?\.classList\.contains\('hidden'\)/,
    'outer loading screen must stay until the inner login has completed');
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

test('EGE has no background music source or playback path', () => {
  assert.doesNotMatch(ege, /id="bgMusic"/);
  assert.doesNotMatch(ege, /startSynthMusic|\.play\(\)/);
  assert.doesNotMatch(ege, /storeLocal\(\);AudioFX\.startMusic\(\)/);
  assert.match(ege, /storeLocal\(\);AudioFX\.stopMusic\(\);verifyInBackground/);
});

test('EGE preserves and restores bank diagrams for saved variants', () => {
  assert.match(ege, /diagramRef:q\.diagramRef\|\|''/,
    'question serialization must preserve the compact diagram reference');
  assert.match(ege, /function localDiagramV13\(ref\)/);
  assert.match(ege, /key\.match\(\/\^EGE-\(\\d\{2\}\)-\(\\d\{3\}\)\$\//,
    'all deterministic bank prototype IDs must be resolvable');
  assert.match(ege, /buildBankPreviewQuestion\(Number\(m\[1\]\)-1,Number\(m\[2\]\)-1\)\.diagram/);
  assert.match(ege, /if\(!q\.diagram\)q\.diagram=localDiagramV13\(q\.diagramRef\|\|q\.prototypeId\)/,
    'older saved variants without diagramRef must fall back to prototypeId');
});

test('all eight OGE practical sets have detailed solutions for tasks 1–5', () => {
  const encoded = oge.match(/const PRACTICE_SOLUTIONS=(\{.*\});\nfunction practiceSolution/);
  assert.ok(encoded, 'OGE practical solution map must exist');
  const solutions = JSON.parse(encoded[1]);
  assert.equal(Object.keys(solutions).length, 40);
  for (let group = 1; group <= 8; group += 1) {
    for (let task = 1; task <= 5; task += 1) {
      const solution = solutions[`${group}-${task}`];
      assert.ok(solution, `solution ${group}-${task} must exist`);
      assert.match(solution, /Шаг 1/);
      assert.match(solution, /Шаг 2/);
      assert.match(solution, /Ответ:/);
    }
  }
  assert.match(oge, /explain:accepted\.length\?practiceSolution\(item,accepted\)/);
});

test('OGE restores a completed result instead of returning to its login screen', () => {
  assert.match(oge, /function showCompletedResult\(value=null\)/);
  assert.match(oge, /if\(local\?\.submittedAt\).*showCompletedResult\(local\.result\)/);
  assert.match(oge, /result:app\.result\|\|null/);
});
