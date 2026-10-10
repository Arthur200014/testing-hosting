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
const remoteBase = String(process.env.OGE_MOCK_BASE_URL || '').replace(/\/$/, '');
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
  studentId: 'STU-OGE-BROWSER',
  studentName: 'Браузерный тест ОГЭ',
  code: 'OGEMOCK'
};
const offlineStudent = {
  studentId: 'STU-OGE-OFFLINE',
  studentName: 'Офлайн-тест ОГЭ',
  code: 'OFFLINEOGE'
};
const control = {
  mode: 'html',
  posts: [],
  submitted: false,
  serverEventId: '',
  serverResult: null,
  serverAnswers: null,
  offlineValidationAvailable: false,
  lookupDelayMs: 0
};

function lookupResponse(url) {
  const callback = url.searchParams.get('tqx')?.split('responseHandler:')[1];
  const query = url.searchParams.get('tq') || '';
  const rows = control.submitted && query.includes(student.studentId) ? [{ c: [
    { v: control.serverEventId },
    { v: student.studentId },
    { v: 'OGE2027-MOCK-OGE-READY-DEMO-2027' },
    { v: 'OGE_MATH' },
    { v: '' },
    { v: control.serverResult?.primaryScore ?? '' },
    { v: control.serverResult?.gradeMark ?? '' },
    { v: control.serverResult?.maxPrimaryScore ?? '' },
    { v: control.serverResult?.scorePercent ?? '' },
    { v: new Date().toISOString() },
    { v: control.serverAnswers ? JSON.stringify(control.serverAnswers) : '' }
  ] }] : [];
  return { callback, data: { status: 'ok', table: { cols: [], rows } } };
}

async function configureRoutes(context) {
  await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'globalThis.MathJax={typesetPromise:()=>Promise.resolve(),typeset:()=>{}};'
  }));
  await context.route('https://docs.google.com/spreadsheets/**/gviz/tq**', async route => {
    const { callback, data } = lookupResponse(new URL(route.request().url()));
    if (control.lookupDelayMs) await new Promise(resolve => setTimeout(resolve, control.lookupDelayMs));
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
      control.posts.push(structuredClone(payload));
      if (control.mode === 'html') {
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Unable to open the file</html>' });
        return;
      }
      const eventId = control.mode === 'mismatch' ? 'wrong-event' : payload.eventId;
      if (control.mode === 'success') {
        control.submitted = true;
        control.serverEventId = payload.eventId;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, saved: true, eventId })
      });
      return;
    }
    let data = { ok: true };
    if (payload.action === 'getActiveMockVariantV2') {
      data = { ok: true, programId: 'OGE_MATH', activeId: '', variant: null };
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
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const frame = page.frames().find(candidate => candidate.parentFrame() === page.mainFrame());
    if (frame) {
      const ready = await frame.evaluate(() => Boolean(globalThis.__OGE_MOCK_PERSISTENCE__?.ready)).catch(() => false);
      if (ready) return frame;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('OGE iframe persistence bridge did not become ready');
}

async function openAttempt(page, loginCode = student.code) {
  const frame = await childFrame(page);
  await frame.locator('#studentCode').fill(loginCode);
  await frame.locator('#loginBtn').click();
  await frame.locator('#examMain:not(.hidden), #resultOverlay:not(.hidden), #mockSubmittedOverlay:not(.hidden)')
    .first().waitFor({ timeout: 20_000 });
  await frame.waitForFunction(expected => (
    globalThis.__OGE2027_MOCK_DIAGNOSTICS__.getState().app.student?.studentId === expected
  ), student.studentId, { timeout: 15_000 });
  return frame;
}

const attemptState = frame => frame.evaluate(() => {
  const current = globalThis.__OGE2027_MOCK_DIAGNOSTICS__.getState();
  const persistence = globalThis.__OGE_MOCK_PERSISTENCE__.persistence;
  return {
    eventId: current.app.eventId,
    deadlineAt: current.app.deadlineAt,
    answers: { ...current.answers },
    finished: current.app.finished,
    locked: globalThis.__OGE_MOCK_PERSISTENCE__.isLocked(),
    outbox: persistence.readOutbox(),
    saved: persistence.loadCurrent({ programId: 'OGE_MATH', studentCode: current.app.code })
  };
});

async function assertTransportStateHidden(frame) {
  const visible = await frame.evaluate(() => [
    'saveState', 'resultSubmitState', 'popupSubmitState', 'transportStatus', 'networkStatus', 'sendState'
  ].map(id => {
    const element = document.getElementById(id);
    return element && !element.hidden && getComputedStyle(element).display !== 'none'
      ? element.textContent.trim()
      : '';
  }).filter(Boolean));
  assert.deepEqual(visible, [], 'student must not see persistence or transport status');
}

async function waitFor(predicate, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('condition timed out');
}

const contexts = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: Boolean(remoteBase)
  });
  contexts.push(context);
  await configureRoutes(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = `${base}/EGA/config/probnic.html?program=oge`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  let frame = await openAttempt(page);
  const firstInput = frame.locator('.answer-input').first();
  await firstInput.fill('195');
  await firstInput.dispatchEvent('input');
  const beforeReload = await attemptState(frame);
  assert.equal(beforeReload.answers['1'], '195');
  assert.match(beforeReload.eventId, /^mock_[a-f0-9]{32}$/);
  assert.ok(beforeReload.deadlineAt > Date.now());
  await assertTransportStateHidden(frame);

  const alternateContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: Boolean(remoteBase)
  });
  contexts.push(alternateContext);
  await configureRoutes(alternateContext);
  const alternatePage = await alternateContext.newPage();
  await alternatePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const alternateFrame = await openAttempt(alternatePage, student.studentId);
  const alternateIdentity = await attemptState(alternateFrame);
  assert.equal(alternateIdentity.eventId, beforeReload.eventId,
    'inviteCode and canonical studentId logins must share one official event');

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  frame = await openAttempt(page);
  const restored = await attemptState(frame);
  assert.equal(await frame.locator('.answer-input').first().inputValue(), '195', JSON.stringify(restored));
  assert.equal(restored.eventId, beforeReload.eventId);
  assert.equal(restored.deadlineAt, beforeReload.deadlineAt);
  assert.deepEqual(restored.answers, beforeReload.answers);

  control.mode = 'html';
  await frame.locator('#finishBtn').click();
  await frame.locator('#confirmOverlay:not(.hidden)').waitFor();
  await frame.locator('#confirmFinish').click();
  await frame.locator('#resultOverlay:not(.hidden)').waitFor();
  await waitFor(() => control.posts.length === 1);
  let queued = await attemptState(frame);
  assert.equal(queued.outbox.length, 1);
  assert.equal(queued.outbox[0].eventId, beforeReload.eventId);
  assert.equal(queued.saved.phase, 'queued', JSON.stringify(queued));
  assert.equal(queued.saved.result.primary, 1);
  assert.equal(queued.saved.result.gradeMark, 2);
  assert.equal(control.posts[0].gradeMark, 2, 'OGE grade must be sent to the sheet');
  assert.equal(await frame.locator('#resultGradeMark').textContent(), '2');
  assert.match(await frame.locator('[data-converted-score-label]').textContent(), /предварительная/);
  await assertTransportStateHidden(frame);

  control.mode = 'mismatch';
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  frame = await childFrame(page);
  await waitFor(() => control.posts.length >= 2);
  queued = await frame.evaluate(() => globalThis.__OGE_MOCK_PERSISTENCE__.persistence.readOutbox());
  assert.equal(queued.length, 1, 'mismatched eventId must remain queued');

  control.mode = 'success';
  await frame.evaluate(() => globalThis.dispatchEvent(new Event('online')));
  await waitFor(async () => (await frame.evaluate(() => globalThis.__OGE_MOCK_PERSISTENCE__.persistence.readOutbox().length)) === 0);
  const confirmed = await frame.evaluate(() => globalThis.__OGE_MOCK_PERSISTENCE__.persistence
    .loadCurrent({ programId: 'OGE_MATH', studentCode: 'OGEMOCK' }));
  assert.equal(confirmed.phase, 'confirmed');
  assert.equal(confirmed.eventId, beforeReload.eventId);
  assert.equal(confirmed.result.primary, 1);
  await assertTransportStateHidden(frame);

  const postsAfterConfirmation = control.posts.length;
  control.serverResult = { primaryScore: 22, maxPrimaryScore: 31, scorePercent: 71, gradeMark: 5 };
  control.lookupDelayMs = 500;
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  frame = await openAttempt(page);
  await frame.locator('#resultOverlay:not(.hidden)').waitFor();
  await frame.locator('#resultOverlay').evaluate(node => node.classList.add('hidden'));
  await waitFor(() => frame.evaluate(() => globalThis.__OGE_MOCK_PERSISTENCE__.isLocked()));
  control.lookupDelayMs = 0;
  assert.equal(await frame.locator('#loginOverlay').evaluate(node => node.classList.contains('hidden')), true,
    'background prior-submission lookup must not replace a restored result with login');
  assert.equal(await frame.locator('#resultOverlay').evaluate(node => node.classList.contains('hidden')), false);
  assert.equal(await frame.locator('#resultPrimary').textContent(), '22 / 31');
  assert.equal(await frame.locator('#resultGradeMark').textContent(), '5');
  assert.match(await frame.locator('[data-converted-score-label]').textContent(), /итоговая оценка/);
  const reopened = await attemptState(frame);
  assert.equal(reopened.saved.result.primary, 22);
  assert.equal(reopened.saved.result.gradeMark, 5);
  assert.equal(reopened.saved.result.finalized, true);
  assert.equal(control.posts.length, postsAfterConfirmation, 'opening a confirmed result must not create another POST');
  await frame.locator('#reviewOpen').click();
  await frame.locator('#reviewOverlay:not(.hidden)').waitFor();
  assert.equal(await frame.locator('#reviewList .review-card').count(), 19);
  await frame.locator('[data-sol="1"]').click();
  assert.doesNotMatch(await frame.locator('#solution-1').innerText(), /пока не добавлено/i);
  const practicalSolutions = await frame.evaluate(() => eval(
    '[1,2,3,4,5].map(task=>bankQuestion(BANK_BY_TASK[task].find(item=>item.prototype===1)).explain)'
  ));
  assert.equal(practicalSolutions.length, 5);
  practicalSolutions.forEach((solution, index) => {
    assert.match(solution, /Шаг 1/);
    assert.match(solution, /Шаг 2/);
    assert.match(solution, /Ответ:/, `task ${index + 1}`);
  });
  await assertTransportStateHidden(frame);

  const freshContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: Boolean(remoteBase)
  });
  contexts.push(freshContext);
  await configureRoutes(freshContext);
  const freshPage = await freshContext.newPage();
  control.serverAnswers = beforeReload.answers;
  await freshPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const freshFrame = await openAttempt(freshPage);
  await waitFor(() => freshFrame.evaluate(() => globalThis.__OGE_MOCK_PERSISTENCE__.isLocked()));
  assert.equal(await freshFrame.locator('#examMain').evaluate(element => element.classList.contains('hidden')), true);
  assert.equal(await freshFrame.locator('#loginOverlay').evaluate(element => element.classList.contains('hidden')), true);
  await freshFrame.locator('#resultOverlay:not(.hidden)').waitFor();
  assert.equal(await freshFrame.locator('#resultPrimary').textContent(), '22 / 31');
  assert.equal(await freshFrame.locator('#resultGradeMark').textContent(), '5');
  await freshFrame.locator('#reviewOpen').click();
  await freshFrame.locator('#reviewOverlay:not(.hidden)').waitFor();
  assert.equal(await freshFrame.locator('#ans-1').inputValue(), beforeReload.answers[1]);
  assert.equal(await freshFrame.locator('#ans-1').isEditable(), false);
  assert.equal(await freshFrame.locator('[id^="ans-"]').evaluateAll(inputs =>
    inputs.length > 0 && inputs.every(input => input.readOnly)), true);
  assert.equal(await freshFrame.locator('#examMain').evaluate(element => element.classList.contains('hidden')), true);
  assert.equal(control.posts.length, 3, 'fresh-device lookup must not create a new POST');
  await assertTransportStateHidden(freshFrame);
  control.serverAnswers = null;

  const offlineContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: Boolean(remoteBase)
  });
  contexts.push(offlineContext);
  await configureRoutes(offlineContext);
  const offlinePage = await offlineContext.newPage();
  const offlineErrors = [];
  offlinePage.on('pageerror', error => offlineErrors.push(error.message));
  await offlinePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  let offlineFrame = await childFrame(offlinePage);
  await offlineFrame.locator('#studentCode').fill(offlineStudent.code);
  await offlineFrame.locator('#loginBtn').click();
  await offlineFrame.locator('#examMain:not(.hidden)').waitFor({ timeout: 20_000 });
  await offlineFrame.locator('.answer-input').first().fill('7');
  await offlineFrame.locator('#finishBtn').click();
  await offlineFrame.locator('#confirmOverlay:not(.hidden)').waitFor();
  await offlineFrame.locator('#confirmFinish').click();
  await offlineFrame.locator('#resultOverlay:not(.hidden)').waitFor();
  await waitFor(() => offlineFrame.evaluate(() => (
    globalThis.__OGE_MOCK_PERSISTENCE__.persistence.readOutbox().length === 1
  )));
  const postsBeforeRecovery = control.posts.length;
  await offlinePage.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  offlineFrame = await childFrame(offlinePage);
  assert.equal(await offlineFrame.evaluate(() => (
    globalThis.__OGE_MOCK_PERSISTENCE__.persistence.readOutbox().length
  )), 1);
  control.mode = 'success';
  control.offlineValidationAvailable = true;
  await offlineFrame.evaluate(() => globalThis.dispatchEvent(new Event('online')));
  await waitFor(() => offlineFrame.evaluate(() => (
    globalThis.__OGE_MOCK_PERSISTENCE__.persistence.readOutbox().length === 0
  )));
  assert.equal(control.posts.length, postsBeforeRecovery + 1);
  const recoveredPost = control.posts.at(-1);
  assert.equal(recoveredPost.studentId, offlineStudent.studentId);
  assert.match(recoveredPost.eventId, /^mock_[a-f0-9]{32}$/);
  assert.deepEqual(offlineErrors, []);

  const failedModuleContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: Boolean(remoteBase)
  });
  contexts.push(failedModuleContext);
  await configureRoutes(failedModuleContext);
  await failedModuleContext.route('**/shared/interactive/v1/mock-exam-persistence.js', route => route.fulfill({
    status: 503,
    contentType: 'text/plain',
    body: 'temporarily unavailable'
  }));
  const failedModulePage = await failedModuleContext.newPage();
  await failedModulePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await failedModulePage.waitForSelector('#frame');
  const failedModuleFrame = await waitFor(async () => {
    const candidate = failedModulePage.frames().find(item => item.parentFrame() === failedModulePage.mainFrame());
    return candidate || false;
  }).then(() => failedModulePage.frames().find(item => item.parentFrame() === failedModulePage.mainFrame()));
  await failedModuleFrame.locator('#loginBtn:disabled').waitFor({ timeout: 10_000 });
  assert.match(await failedModuleFrame.locator('#loginError').textContent(), /временно недоступна/i);
  assert.deepEqual(errors, []);

  console.log(JSON.stringify({
    passed: true,
    scenarios: {
      reloadRestoresAnswersTimerAndEvent: true,
      alternateCredentialsShareOneEvent: true,
      htmlResponseStaysQueued: true,
      mismatchedReceiptStaysQueued: true,
      matchingReceiptConfirms: true,
      provisionalGradeIsDisplayedAndSaved: true,
      finalizedGradeIsRestoredFromSheet: true,
      resultSnapshotPersists: true,
      confirmedResultSurvivesBackgroundLookupAndReviewOpens: true,
      practicalTasksOneToFiveHaveDetailedSolutions: true,
      freshDeviceRestoresReadOnlyReviewFromServer: true,
      validationOutageSurvivesFinishReloadAndRecovery: true,
      missingPersistenceModuleFailsClosed: true,
      transportMessagesHidden: true
    },
    stableEventId: beforeReload.eventId,
    submitCalls: control.posts.length,
    productionWrites: 0
  }, null, 2));
} finally {
  await Promise.all(contexts.map(context => context.close().catch(() => null)));
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
