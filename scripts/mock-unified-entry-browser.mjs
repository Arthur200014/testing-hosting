import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (error) {
  const runtimeRoot = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node';
  if (!existsSync(`${runtimeRoot}/node_modules/playwright/package.json`)) throw error;
  ({ chromium } = createRequire(`${runtimeRoot}/index.js`)('playwright'));
}

const root = new URL('..', import.meta.url).pathname;
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8']
]);
const remoteBase = String(process.env.MOCK_UNIFIED_BASE_URL || '').replace(/\/$/, '');
const server = remoteBase ? null : createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const relative = normalize(pathname).replace(/^[/\\]+/, '');
  const file = join(root, relative || 'index.html');
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': mime.get(extname(file)) || 'application/octet-stream' });
  response.end(readFileSync(file));
});
if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = remoteBase || `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.EGE_CHROMIUM_PATH
  || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
  args: ['--no-sandbox']
});

const students = {
  ege: { code: 'UNIFIEDEGE', studentId: 'UNIFIED-EGE', studentName: 'Тест ЕГЭ', programId: 'EGE_MATH' },
  oge: { code: 'UNIFIEDOGE', studentId: 'UNIFIED-OGE', studentName: 'Тест ОГЭ', programId: 'OGE_MATH' }
};
const productionPosts = [];

async function configureRoutes(context, student) {
  await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'globalThis.MathJax={typesetPromise:()=>Promise.resolve(),typeset:()=>{}};'
  }));
  await context.route('https://docs.google.com/spreadsheets/**/gviz/tq**', route => {
    const url = new URL(route.request().url());
    const callback = url.searchParams.get('tqx')?.split('responseHandler:')[1];
    const data = { status: 'ok', table: { cols: [], rows: [] } };
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: callback ? `${callback}(${JSON.stringify(data)});` : JSON.stringify(data)
    });
  });
  await context.route('https://script.google.com/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    let payload = Object.fromEntries(url.searchParams);
    if (request.method() === 'POST') {
      payload = JSON.parse(request.postData() || '{}');
      productionPosts.push(payload);
    }
    let data = { ok: true };
    if (payload.action === 'validateStudent') {
      data = { ok: true, valid: true, ...student, student, data: { student }, result: { student } };
    } else if (payload.action === 'getActiveMockVariantV2') {
      data = { ok: true, programId: student.programId, activeId: '', variant: null };
    }
    const callback = url.searchParams.get('callback');
    await route.fulfill({
      status: 200,
      contentType: callback ? 'application/javascript' : 'application/json',
      body: callback ? `${callback}(${JSON.stringify(data)});` : JSON.stringify(data)
    });
  });
}

async function childFrame(page, type) {
  const key = type === 'ege' ? '__EGE_MOCK_PERSISTENCE__' : '__OGE_MOCK_PERSISTENCE__';
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const frame = page.frames().find(candidate => candidate.parentFrame() === page.mainFrame());
    if (frame && await frame.evaluate(keyName => Boolean(globalThis[keyName]?.ready), key).catch(() => false)) return frame;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`${type.toUpperCase()} child frame did not become ready`);
}

async function waitForExam(frame, type) {
  const selector = type === 'ege' ? '#exam:not(.hidden)' : '#examMain:not(.hidden)';
  await frame.locator(selector).waitFor({ timeout: 20_000 });
}

async function runResumeScenario(type, viewport) {
  const student = students[type];
  const context = await browser.newContext({ viewport, ignoreHTTPSErrors: Boolean(remoteBase) });
  await configureRoutes(context, student);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/favicon/i.test(message.text())) errors.push(message.text());
  });
  try {
    const url = `${base}/EGA/config/probnic.html`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    assert.equal(await page.locator('.quick-launch').count(), 1, 'student menu must have one exam button');
    assert.equal((await page.locator('#studentOpen').textContent()).trim(), 'Открыть пробник');
    await page.locator('#studentOpen').click();
    await page.locator('#shellStudentCode').fill(student.code);
    await page.locator('#studentLoginBtn').click();
    let frame = await childFrame(page, type);
    await waitForExam(frame, type);
    assert.equal(await page.locator('#home').evaluate(node => node.classList.contains('hidden')), true);
    assert.equal(await frame.locator('#loginOverlay').evaluate(node => node.classList.contains('hidden')), true);

    const answer = type === 'ege' ? frame.locator('#answer-1') : frame.locator('.answer-input').first();
    await answer.fill(type === 'ege' ? '17' : '195');
    await answer.dispatchEvent('input');
    const before = await frame.evaluate(examType => {
      const state = examType === 'ege'
        ? globalThis.__EGE2027_MOCK_DIAGNOSTICS__.getState()
        : globalThis.__OGE2027_MOCK_DIAGNOSTICS__.getState();
      return examType === 'ege'
        ? { deadlineAt: state.deadlineAt, eventId: state.eventId }
        : { deadlineAt: state.app.deadlineAt, eventId: state.app.eventId };
    }, type);
    assert.ok(before.deadlineAt > Date.now());
    assert.ok(before.eventId);

    if (type === 'oge') {
      assert.equal(await frame.locator('#ogeOrbTrack .oge-orb').count(), 19);
      assert.equal(await frame.locator('#ogeOrbTrack .oge-orb').first().evaluate(node => node.classList.contains('filled')), true);
      assert.match(await frame.locator('#ogeProgress').textContent(), /1 из 19/);
      assert.equal(await frame.locator('body').innerText().then(text => text.includes('235 минут')), false);
      assert.notEqual(await frame.locator('.oge-core').evaluate(node => getComputedStyle(node).animationName), 'none');
      assert.equal(await frame.locator('.task-no').first().evaluate(node => getComputedStyle(node).borderRadius), '50%');
      await frame.locator('#shotOpen').click();
      await frame.locator('#shotOverlay:not(.hidden)').waitFor();
      const shot = await frame.evaluate(() => {
        const body = document.querySelector('.shot-body');
        const stage = document.querySelector('.shot-stage');
        const page = document.getElementById('shotPage');
        const task19 = document.querySelector('#shotPage .shot-task:nth-last-child(1)');
        const scroller = body.scrollHeight > body.clientHeight ? body : page;
        const beforeTop = scroller.scrollTop;
        scroller.scrollTop = scroller.scrollHeight;
        return {
          bodyOverflow: getComputedStyle(body).overflowY,
          stageOverflow: getComputedStyle(stage).overflowY,
          pageOverflow: getComputedStyle(page).overflowY,
          scrollHeight: scroller.scrollHeight,
          clientHeight: scroller.clientHeight,
          scroller: scroller === body ? 'body' : 'page',
          beforeTop,
          afterTop: scroller.scrollTop,
          hasTask19: document.getElementById('shotPage').textContent.includes('19') && Boolean(task19)
        };
      });
      assert.equal(shot.bodyOverflow, 'auto');
      assert.equal(shot.stageOverflow, 'auto');
      assert.equal(shot.pageOverflow, 'auto');
      assert.ok(shot.scrollHeight > shot.clientHeight, JSON.stringify(shot));
      assert.ok(shot.afterTop > shot.beforeTop, JSON.stringify(shot));
      assert.equal(shot.hasTask19, true);
      await frame.locator('#shotClose').click();
    } else {
      const music = await frame.evaluate(() => eval(`({
        hasTrack: Boolean(document.getElementById('bgMusic')),
        timer: AudioFX.musicTimer,
        hasBus: Boolean(AudioFX.musicBus)
      })`));
      assert.deepEqual(music, { hasTrack: false, timer: null, hasBus: false });
      await frame.locator('#shotOpen').click();
      await frame.locator('#shotOverlay:not(.hidden)').waitFor();
      assert.equal(await frame.locator('.shot-stage').evaluate(node => getComputedStyle(node).overflowY), 'auto');
      assert.equal(await frame.locator('#shotPage1').evaluate(node => getComputedStyle(node).overflowY), 'auto');
      await frame.locator('#shotClose').click();
    }

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    frame = await childFrame(page, type);
    await waitForExam(frame, type);
    const restoredAnswer = type === 'ege' ? frame.locator('#answer-1') : frame.locator('.answer-input').first();
    assert.equal(await restoredAnswer.inputValue(), type === 'ege' ? '17' : '195');
    const after = await frame.evaluate(examType => {
      const state = examType === 'ege'
        ? globalThis.__EGE2027_MOCK_DIAGNOSTICS__.getState()
        : globalThis.__OGE2027_MOCK_DIAGNOSTICS__.getState();
      return examType === 'ege'
        ? { deadlineAt: state.deadlineAt, eventId: state.eventId }
        : { deadlineAt: state.app.deadlineAt, eventId: state.app.eventId };
    }, type);
    assert.deepEqual(after, before, 'reload must preserve the same attempt and timer');
    assert.equal(await page.locator('#home').evaluate(node => node.classList.contains('hidden')), true);
    assert.equal(await frame.locator('#loginOverlay').evaluate(node => node.classList.contains('hidden')), true);

    await frame.evaluate(examType => {
      const api = examType === 'ege'
        ? globalThis.__EGE_MOCK_PERSISTENCE__
        : globalThis.__OGE_MOCK_PERSISTENCE__;
      const current = api.snapshot();
      api.persistence.saveAttempt({
        ...current,
        submittedAt: Date.now(),
        phase: 'confirmed',
        result: examType === 'ege'
          ? { primary: 1, durationSeconds: 60, autoSubmitted: false }
          : { primary: 1, blank: 18, durationSeconds: 60, scorePercent: 5, autoSubmitted: false }
      });
    }, type);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    frame = await childFrame(page, type);
    await frame.locator('#resultOverlay:not(.hidden)').waitFor({ timeout: 20_000 });
    await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), null, {
      timeout: 20_000
    });
    assert.equal(await frame.locator('#loginOverlay').evaluate(node => node.classList.contains('hidden')), true,
      'saved result must open directly without showing the inner login again');
    if (type === 'ege') {
      await frame.locator('#resultReviewBtn').click();
      await frame.locator('#solutionReviewOverlay:not(.hidden)').waitFor();
    } else {
      await frame.locator('#reviewOpen').click();
      await frame.locator('#reviewOverlay:not(.hidden)').waitFor();
    }
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function runUnsupportedProgramScenario() {
  const student = { code: 'UNKNOWNPROGRAM', studentId: 'UNKNOWN-PROGRAM', studentName: 'Нет экзамена', programId: 'SCHOOL_MATH' };
  const context = await browser.newContext({ viewport: { width: 900, height: 700 }, ignoreHTTPSErrors: Boolean(remoteBase) });
  await configureRoutes(context, student);
  const page = await context.newPage();
  try {
    await page.goto(`${base}/EGA/config/probnic.html`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.locator('#studentOpen').click();
    await page.locator('#shellStudentCode').fill(student.code);
    await page.locator('#studentLoginBtn').click();
    await page.waitForFunction(() => document.getElementById('studentError')?.textContent.includes('не указан экзамен'));
    assert.equal(await page.locator('#viewer').evaluate(node => node.classList.contains('hidden')), true);
    assert.equal(await page.locator('#frame').getAttribute('srcdoc'), null);
  } finally {
    await context.close();
  }
}

try {
  await runResumeScenario('ege', { width: 1280, height: 900 });
  await runResumeScenario('oge', { width: 390, height: 844 });
  await runUnsupportedProgramScenario();
  assert.equal(productionPosts.length, 0, 'resume/visual checks must not submit real results');
  console.log(`PASS unified mock entry/reload/visual/screenshot: ${remoteBase || 'local'}; production writes: 0`);
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
