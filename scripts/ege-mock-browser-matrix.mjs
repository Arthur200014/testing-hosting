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
const remoteBase = String(process.env.EGE_MOCK_BASE_URL || '').replace(/\/$/, '');
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

const student = {
  studentId: 'EGE-MOCK-BROWSER',
  studentName: 'Браузерный тест',
  code: 'MOCKTEST'
};
const offlineStudent = {
  studentId: 'EGE-MOCK-OFFLINE',
  studentName: 'Офлайн-тест ЕГЭ',
  code: 'OFFLINEEGE'
};
const control = { mode: 'html', posts: [], reads: [], offlineValidationAvailable: false };

async function configureRoutes(context, { lookupSubmitted = false } = {}) {
  await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'globalThis.MathJax={typesetPromise:()=>Promise.resolve(),typeset:()=>{}};'
  }));
  await context.route('https://docs.google.com/spreadsheets/**/gviz/tq**', async route => {
    const url = new URL(route.request().url());
    const callback = url.searchParams.get('tqx')?.split('responseHandler:')[1];
    const rows = lookupSubmitted ? [{ c: [
      { v: 'existing-event' },
      { v: student.studentId },
      { v: 'EGE2027-MOCK-EGE-V-MUOMEHKN-Y6Z8' },
      { v: 'EGE_MATH' }
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
    control.reads.push(payload.action || 'unknown');
    if (request.method() === 'POST' && payload.action === 'submitAssignedMock') {
      control.posts.push(structuredClone(payload));
      if (control.mode === 'html') {
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Page Not Found</html>' });
        return;
      }
      const eventId = control.mode === 'mismatch' ? 'wrong-event' : payload.eventId;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, saved: true, eventId })
      });
      return;
    }
    let data = { ok: true };
    if (payload.action === 'getActiveMockVariantV2') {
      data = { ok: true, activeId: '', variant: null };
    } else if (payload.action === 'validateStudent') {
      const selected = payload.code === offlineStudent.code ? offlineStudent : student;
      data = selected === offlineStudent && !control.offlineValidationAvailable
        ? { ok: false, valid: false }
        : { ok: true, valid: true, student: selected, result: { student: selected }, data: { student: selected } };
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
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const frame = page.frames().find(candidate => candidate.parentFrame() === page.mainFrame());
    if (frame) {
      const ready = await frame.evaluate(() => Boolean(globalThis.__EGE_MOCK_PERSISTENCE__?.ready)).catch(() => false);
      if (ready) return frame;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('EGE iframe persistence bridge did not become ready');
}

async function openAttempt(page) {
  const frame = await childFrame(page);
  await frame.locator('#studentCode').fill(student.code);
  await frame.locator('#loginBtn').click();
  await frame.locator('#exam:not(.hidden), #resultOverlay:not(.hidden)').first().waitFor({ timeout: 15_000 });
  return frame;
}

const attemptState = frame => frame.evaluate(() => {
  const current = globalThis.__EGE2027_MOCK_DIAGNOSTICS__.getState();
  const persistence = globalThis.__EGE_MOCK_PERSISTENCE__.persistence;
  return {
    eventId: current.eventId,
    deadlineAt: current.deadlineAt,
    answers: [...current.answers],
    finished: current.finished,
    outbox: persistence.readOutbox(),
    saved: persistence.loadCurrent({ programId: 'EGE_MATH', studentCode: current.code })
  };
});

async function assertTransportStateHidden(frame) {
  const visible = await frame.evaluate(() => ['saveState', 'resultSubmitState', 'popupSubmitState']
    .map(id => {
      const element = document.getElementById(id);
      return element && !element.hidden && getComputedStyle(element).display !== 'none'
        ? element.textContent.trim()
        : '';
    }).filter(Boolean));
  assert.deepEqual(visible, [], 'student must not see persistence or transport status');
}

async function waitFor(predicate, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('condition timed out');
}

const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  ignoreHTTPSErrors: Boolean(remoteBase)
});
await configureRoutes(context);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !/favicon/i.test(message.text())) errors.push(message.text());
});

try {
  const url = `${base}/EGA/config/probnic.html?program=ege`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  let frame = await openAttempt(page);
  await frame.locator('#answer-1').fill('12');
  await frame.locator('#answer-1').dispatchEvent('input');
  const beforeReload = await attemptState(frame);
  assert.equal(beforeReload.answers[0], '12');
  assert.ok(beforeReload.eventId);
  assert.ok(beforeReload.deadlineAt > Date.now());
  await assertTransportStateHidden(frame);

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  frame = await openAttempt(page);
  const restored = await attemptState(frame);
  assert.equal(await frame.locator('#answer-1').inputValue(), '12');
  assert.equal(restored.eventId, beforeReload.eventId);
  assert.equal(restored.deadlineAt, beforeReload.deadlineAt);
  assert.deepEqual(restored.answers, beforeReload.answers);

  control.mode = 'html';
  await frame.locator('#submitBtn').click();
  await frame.locator('#confirmOverlay:not(.hidden)').waitFor();
  await frame.locator('#confirmSubmit').click();
  await frame.locator('#resultOverlay:not(.hidden)').waitFor();
  await waitFor(() => control.posts.length === 1);
  let queued = await attemptState(frame);
  assert.equal(queued.outbox.length, 1);
  const stableEventId = queued.outbox[0].eventId;
  assert.match(stableEventId, /^mock_[a-f0-9]{32}$/);
  assert.equal(queued.eventId, stableEventId);
  assert.equal(queued.saved.phase, 'queued');
  assert.equal(queued.saved.result.primary, 0);
  await assertTransportStateHidden(frame);

  control.mode = 'mismatch';
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  frame = await childFrame(page);
  await waitFor(() => control.posts.length >= 2);
  queued = await frame.evaluate(() => globalThis.__EGE_MOCK_PERSISTENCE__.persistence.readOutbox());
  assert.equal(queued.length, 1, 'mismatched eventId must remain queued');

  control.mode = 'success';
  await frame.evaluate(async () => {
    await globalThis.__EGE_MOCK_PERSISTENCE__.flush();
    await globalThis.__EGE_MOCK_PERSISTENCE__.flush();
  });
  await waitFor(async () => (await frame.evaluate(() => globalThis.__EGE_MOCK_PERSISTENCE__.persistence.readOutbox().length)) === 0);
  const confirmed = await frame.evaluate(() => globalThis.__EGE_MOCK_PERSISTENCE__.persistence
    .loadCurrent({ programId: 'EGE_MATH', studentCode: 'MOCKTEST' }));
  assert.equal(confirmed.phase, 'confirmed');
  assert.equal(confirmed.eventId, stableEventId);
  assert.deepEqual(confirmed.answers, beforeReload.answers);

  const postsAfterConfirmation = control.posts.length;
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  frame = await openAttempt(page);
  await frame.locator('#resultOverlay:not(.hidden)').waitFor();
  const reopened = await attemptState(frame);
  assert.equal(reopened.finished, true);
  assert.equal(reopened.eventId, stableEventId);
  assert.deepEqual(reopened.answers, beforeReload.answers);
  assert.equal(reopened.saved.phase, 'confirmed');
  assert.equal(control.posts.length, postsAfterConfirmation, 'confirmed result must not be posted again');
  await assertTransportStateHidden(frame);
  assert.doesNotMatch(await frame.locator('#resultPopupLead').textContent(), /сохран|отправ|сервер|устройств|таблиц/i);
  assert.deepEqual(errors, []);

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: Boolean(remoteBase)
  });
  await configureRoutes(mobileContext);
  const mobilePage = await mobileContext.newPage();
  const mobileErrors = [];
  mobilePage.on('pageerror', error => mobileErrors.push(error.message));
  try {
    await mobilePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    let mobileFrame = await openAttempt(mobilePage);
    await mobileFrame.locator('#answer-1').fill('7');
    await mobileFrame.locator('#answer-1').dispatchEvent('input');
    const mobileBefore = await attemptState(mobileFrame);
    await mobilePage.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    mobileFrame = await openAttempt(mobilePage);
    const mobileAfter = await attemptState(mobileFrame);
    assert.equal(await mobileFrame.locator('#answer-1').inputValue(), '7');
    assert.equal(mobileAfter.eventId, mobileBefore.eventId);
    assert.equal(mobileAfter.deadlineAt, mobileBefore.deadlineAt);
    await assertTransportStateHidden(mobileFrame);
    assert.deepEqual(mobileErrors, []);
  } finally {
    await mobileContext.close();
  }

  const freshContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: Boolean(remoteBase)
  });
  await configureRoutes(freshContext, { lookupSubmitted: true });
  const freshPage = await freshContext.newPage();
  try {
    await freshPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const freshFrame = await openAttempt(freshPage);
    await waitFor(() => freshFrame.evaluate(() => globalThis.__EGE_MOCK_PERSISTENCE__.isLocked()));
    assert.equal(await freshFrame.locator('#exam').evaluate(element => element.classList.contains('hidden')), true);
    assert.match(await freshFrame.locator('#loginError').textContent(), /уже сдан/i);
    assert.equal(control.posts.length, postsAfterConfirmation, 'fresh-device lookup must not create a new POST');
    await assertTransportStateHidden(freshFrame);
  } finally {
    await freshContext.close();
  }

  const offlineContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: Boolean(remoteBase)
  });
  await configureRoutes(offlineContext);
  const offlinePage = await offlineContext.newPage();
  const offlineErrors = [];
  offlinePage.on('pageerror', error => offlineErrors.push(error.message));
  try {
    await offlinePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    let offlineFrame = await childFrame(offlinePage);
    await offlineFrame.locator('#studentCode').fill(offlineStudent.code);
    await offlineFrame.locator('#loginBtn').click();
    await offlineFrame.locator('#exam:not(.hidden)').waitFor({ timeout: 15_000 });
    await offlineFrame.locator('#answer-1').fill('5');
    await offlineFrame.locator('#submitBtn').click();
    await offlineFrame.locator('#confirmOverlay:not(.hidden)').waitFor();
    await offlineFrame.locator('#confirmSubmit').click();
    await offlineFrame.locator('#resultOverlay:not(.hidden)').waitFor();
    await waitFor(() => offlineFrame.evaluate(() => (
      globalThis.__EGE_MOCK_PERSISTENCE__.persistence.readOutbox().length === 1
    )));
    const postsBeforeRecovery = control.posts.length;
    await offlinePage.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    offlineFrame = await childFrame(offlinePage);
    assert.equal(await offlineFrame.evaluate(() => (
      globalThis.__EGE_MOCK_PERSISTENCE__.persistence.readOutbox().length
    )), 1);
    control.mode = 'success';
    control.offlineValidationAvailable = true;
    await offlineFrame.evaluate(() => globalThis.dispatchEvent(new Event('online')));
    await waitFor(() => offlineFrame.evaluate(() => (
      globalThis.__EGE_MOCK_PERSISTENCE__.persistence.readOutbox().length === 0
    )));
    assert.equal(control.posts.length, postsBeforeRecovery + 1);
    const recoveredPost = control.posts.at(-1);
    assert.equal(recoveredPost.studentId, offlineStudent.studentId);
    assert.match(recoveredPost.eventId, /^mock_[a-f0-9]{32}$/);
    assert.deepEqual(offlineErrors, []);
  } finally {
    await offlineContext.close();
  }

  console.log(JSON.stringify({
    passed: true,
    scenarios: {
      reloadRestoresAnswersAndAttempt: true,
      htmlResponseStaysQueued: true,
      mismatchedReceiptStaysQueued: true,
      matchingReceiptConfirms: true,
      completedAttemptReopensExactly: true,
      transportMessagesHidden: true,
      mobileReloadRestoresAttempt: true,
      freshDeviceIsBlockedByServerLookup: true,
      validationOutageSurvivesFinishReloadAndRecovery: true
    },
    stableEventId,
    submitCalls: control.posts.length,
    productionWrites: 0
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
