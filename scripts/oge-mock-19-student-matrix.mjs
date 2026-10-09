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
const sheetId = '1TTwFlfhYPy4T4J_obqPUSLE1IpkExS_orLmEJ8JxM0k';
const clean = value => String(value ?? '').trim();
const truthy = value => value === true || value === 1
  || ['1', 'true', 'да', 'yes'].includes(clean(value).toLowerCase());
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function readSheet(sheetName) {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`);
  url.searchParams.set('sheet', sheetName);
  url.searchParams.set('headers', '1');
  url.searchParams.set('tqx', 'out:json');
  url.searchParams.set('_matrix', `${Date.now()}-${Math.random()}`);
  const context = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true });
  let body;
  try {
    const page = await context.newPage();
    const downloadPromise = page.waitForEvent('download');
    await page.goto(url.href, { timeout: 45_000 }).catch(error => {
      if (!/Download is starting/.test(error.message)) throw error;
    });
    const download = await downloadPromise;
    body = readFileSync(await download.path(), 'utf8');
  } finally {
    await context.close();
  }
  const data = JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1));
  const columns = data.table.cols.map(column => clean(column.label || column.id));
  return data.table.rows.map(row => Object.fromEntries(columns.map((column, index) => [
    column,
    row.c?.[index]?.v ?? ''
  ])));
}

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8']
]);
const server = createServer((request, response) => {
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
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.EGE_CHROMIUM_PATH
  || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
  args: ['--no-sandbox']
});

const studentRows = await readSheet('Ученики');
const mockRows = await readSheet('Пробники');
const previouslyTestedEgeStudentIds = new Set(mockRows
  .filter(row => clean(row.programId) === 'EGE_MATH')
  .map(row => clean(row.studentId))
  .filter(Boolean));
const students = studentRows.map(row => ({
  studentId: clean(row.studentId),
  studentName: clean(row.studentName || 'Ученик'),
  code: clean(row.inviteCode || row.studentId),
  programId: clean(row.programId || 'EGE_MATH'),
  active: truthy(row.active)
})).filter(student => student.active && student.studentId && student.code
  && student.programId === 'EGE_MATH' && previouslyTestedEgeStudentIds.has(student.studentId));
assert.equal(students.length, 19, 'the same 19 active EGE test students must be present');

const accepted = new Map();
const attempts = new Map();
const posts = [];
const contexts = [];

async function configureRoutes(context, student, index) {
  await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'globalThis.MathJax={typesetPromise:()=>Promise.resolve(),typeset:()=>{}};'
  }));
  await context.route('https://docs.google.com/spreadsheets/**/gviz/tq**', async route => {
    const url = new URL(route.request().url());
    const callback = url.searchParams.get('tqx')?.split('responseHandler:')[1];
    const prior = accepted.get(student.studentId);
    const rows = prior ? [{ c: [
      { v: prior.eventId },
      { v: student.studentId },
      { v: prior.mockId },
      { v: 'OGE_MATH' }
    ] }] : [];
    const data = { status: 'ok', table: { cols: [], rows } };
    await route.fulfill({
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
      try { payload = JSON.parse(request.postData() || '{}'); } catch { payload = {}; }
    }
    if (request.method() === 'POST' && payload.action === 'submitAssignedMock') {
      posts.push(structuredClone(payload));
      const count = (attempts.get(payload.eventId) || 0) + 1;
      attempts.set(payload.eventId, count);
      const firstMode = index % 3 === 0 ? 'html' : index % 3 === 1 ? 'mismatch' : 'success';
      const mode = count === 1 ? firstMode : 'success';
      if (mode === 'html') {
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Page Not Found</html>' });
        return;
      }
      if (mode === 'success') accepted.set(student.studentId, {
        eventId: payload.eventId,
        mockId: payload.mockId,
        score: payload.primaryScore
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          saved: true,
          eventId: mode === 'mismatch' ? `wrong-${payload.eventId}` : payload.eventId
        })
      });
      return;
    }
    let data = { ok: true };
    if (payload.action === 'getActiveMockVariantV2') {
      data = { ok: true, programId: 'OGE_MATH', activeId: '', variant: null };
    } else if (payload.action === 'validateStudent') {
      data = {
        ok: true,
        valid: true,
        student: { ...student, programId: 'EGE_MATH' },
        result: { student: { ...student, programId: 'EGE_MATH' } }
      };
    }
    const callback = url.searchParams.get('callback');
    await route.fulfill({
      status: 200,
      contentType: callback ? 'application/javascript' : 'application/json',
      body: callback ? `${callback}(${JSON.stringify(data)});` : JSON.stringify(data)
    });
  });
}

async function childFrame(page) {
  await page.waitForSelector('#frame');
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const frame = page.frames().find(candidate => candidate.parentFrame() === page.mainFrame());
    if (frame && await frame.evaluate(() => Boolean(globalThis.__OGE_MOCK_PERSISTENCE__?.ready)).catch(() => false)) {
      return frame;
    }
    await sleep(50);
  }
  throw new Error('OGE iframe persistence bridge did not become ready');
}

async function openAttempt(page, student) {
  await page.goto(`${base}/EGA/config/probnic.html?program=oge&matrix=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45_000
  });
  const frame = await childFrame(page);
  await frame.locator('#studentCode').fill(student.code);
  await frame.locator('#loginBtn').click();
  await frame.locator('#examMain:not(.hidden)').waitFor({ timeout: 20_000 });
  return frame;
}

async function prepareAndSubmit(frame, index) {
  const count = 2 + (index % 13);
  await frame.evaluate(correctCount => {
    const current = globalThis.__OGE2027_MOCK_DIAGNOSTICS__.getState();
    current.variant.questions.forEach((question, questionIndex) => {
      current.answers[question.task] = String(questionIndex < correctCount ? question.numeric : Number(question.numeric) + 12345).replace('.', ',');
    });
    document.querySelectorAll('.answer-input').forEach(input => {
      input.value = current.answers[Number(input.dataset.task)] || '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }, count);
  await frame.locator('#finishBtn').click();
  await frame.locator('#confirmOverlay:not(.hidden)').waitFor();
  await frame.locator('#confirmFinish').click();
  await frame.locator('#resultOverlay:not(.hidden)').waitFor();
  return count;
}

try {
  const runs = [];
  for (let index = 0; index < students.length; index += 1) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    contexts.push(context);
    await configureRoutes(context, students[index], index);
    const page = await context.newPage();
    const frame = await openAttempt(page, students[index]);
    runs.push({ student: students[index], context, page, frame, index });
  }

  await Promise.all(runs.map(async run => {
    run.expectedScore = await prepareAndSubmit(run.frame, run.index);
  }));

  for (let round = 0; round < 6; round += 1) {
    await Promise.all(runs.map(run => run.frame.evaluate(() => globalThis.dispatchEvent(new Event('online')))));
    await sleep(250);
    const pending = await Promise.all(runs.map(run => run.frame.evaluate(() => (
      globalThis.__OGE_MOCK_PERSISTENCE__.persistence.readOutbox().length
    ))));
    if (pending.every(value => value === 0)) break;
  }

  const results = await Promise.all(runs.map(run => run.frame.evaluate(() => {
    const current = globalThis.__OGE2027_MOCK_DIAGNOSTICS__.getState();
    const persistence = globalThis.__OGE_MOCK_PERSISTENCE__.persistence;
    const saved = persistence.loadCurrent({ programId: 'OGE_MATH', studentCode: current.app.code });
    return {
      eventId: current.app.eventId,
      outbox: persistence.readOutbox().length,
      phase: saved?.phase,
      score: saved?.result?.primary
    };
  })));
  assert.equal(results.every(result => result.outbox === 0 && result.phase === 'confirmed'), true);
  assert.equal(new Set(results.map(result => result.eventId)).size, 19);
  assert.equal(accepted.size, 19);
  results.forEach((result, index) => {
    assert.equal(result.score, runs[index].expectedScore);
    assert.equal(accepted.get(students[index].studentId)?.eventId, result.eventId);
  });

  await Promise.all(runs.map(run => run.context.close()));
  contexts.length = 0;

  for (let index = 0; index < students.length; index += 1) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    contexts.push(context);
    await configureRoutes(context, students[index], index);
    const page = await context.newPage();
    const frame = await openAttempt(page, students[index]);
    for (let retry = 0; retry < 100; retry += 1) {
      if (await frame.evaluate(() => globalThis.__OGE_MOCK_PERSISTENCE__.isLocked())) break;
      await sleep(25);
    }
    assert.equal(await frame.evaluate(() => globalThis.__OGE_MOCK_PERSISTENCE__.isLocked()), true);
    assert.equal(await frame.locator('#examMain').evaluate(element => element.classList.contains('hidden')), true);
    await context.close();
    contexts.pop();
  }

  assert.equal(posts.length, attempts.size + 13, '13 ambiguous first responses should require one retry');
  console.log(JSON.stringify({
    passed: true,
    students: students.length,
    isolatedProfiles: 19,
    uniqueStableEvents: results.length,
    htmlFirstResponses: 7,
    mismatchedFirstReceipts: 6,
    retriesRecovered: 13,
    confirmed: 19,
    freshDeviceBlocks: 19,
    fakeServerRows: accepted.size,
    productionWrites: 0
  }, null, 2));
} finally {
  await Promise.all(contexts.map(context => context.close().catch(() => null)));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
