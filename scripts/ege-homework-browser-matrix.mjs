import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (error) {
  const runtimeRoot = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node';
  if (!existsSync(`${runtimeRoot}/node_modules/playwright/package.json`)) throw error;
  ({ chromium } = createRequire(`${runtimeRoot}/index.js`)('playwright'));
}
const base = argument('base', 'http://127.0.0.1:8766');
const concurrency = Number(argument('concurrency', '2')) || 1;
const only = argument('only', '');
const paths = [
  ...['dz1', 'dz2', 'dz3', 'dz4'].map(name => `/EGA/1/${name}.html`),
  ...['dz', 'dz2'].map(name => `/EGA/2/${name}.html`),
  ...['dz1', 'dz2', 'dz3', 'dz4', 'dz5'].map(name => `/EGA/3/${name}.html`),
  '/EGA/4/dz.html',
  ...['dz1', 'dz2'].map(name => `/EGA/5/${name}.html`),
  ...[6, 7].flatMap(task => ['dz1', 'dz2', 'dz3'].map(name => `/EGA/${task}/${name}.html`)),
  ...['dz1', 'dz2'].map(name => `/EGA/8/${name}.html`),
  ...[9, 10, 11].flatMap(task => ['dz1', 'dz2', 'dz3'].map(name => `/EGA/${task}/${name}.html`))
].filter(path => !only || path.includes(only));

function argument(name, fallback) {
  return process.argv.find(value => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
}

const executablePath = process.env.EGE_CHROMIUM_PATH
  || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
  args: ['--no-sandbox']
});
const student = {
  studentId: 'STU-BROWSER-CI', id: 'STU-BROWSER-CI',
  studentName: 'Browser CI', name: 'Browser CI', code: 'BROWSERCI'
};
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function harness(path, submitMode = 'success') {
  const control = { submitted: false, submitMode, checks: 0, submissions: [], saved: [] };
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
  await context.addInitScript(value => {
    localStorage.setItem('egeStudentId', value.studentId);
    localStorage.setItem('egeStudentName', value.studentName);
    localStorage.setItem('egeStudentCode', value.code);
  }, student);
  await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'globalThis.MathJax ||= {typesetPromise:()=>Promise.resolve(),typeset:()=>{}};'
  }));
  await context.route('https://script.google.com/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    let payload = Object.fromEntries(url.searchParams);
    if (request.method() === 'POST') {
      try { payload = JSON.parse(request.postData() || '{}'); } catch { payload = {}; }
    }
    let data = { ok: true, success: true };
    if (payload.action === 'validateStudent') {
      data = { ...data, valid: true, student, result: { student }, data: { student } };
    } else if (payload.action === 'checkHomeworkSubmission') {
      control.checks += 1;
      data = { ...data, submitted: control.submitted, hasSubmitted: control.submitted,
        canSubmit: !control.submitted, status: control.submitted ? 'submitted' : 'pending' };
    } else if (payload.action === 'submitHomework') {
      control.submissions.push({ ...payload, responseMode: control.submitMode });
      if (control.submitMode === 'fail') {
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Page Not Found</html>' });
        return;
      }
      control.saved.push(payload.eventId);
      data = { ...data, saved: true, assignmentId: payload.assignmentId };
    }
    if (request.method() === 'GET') {
      const callback = url.searchParams.get('callback');
      await route.fulfill({ status: 200, contentType: 'application/javascript',
        body: callback ? `${callback}(${JSON.stringify(data)});` : JSON.stringify(data) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/favicon/i.test(message.text())) errors.push(message.text());
  });
  return { path, context, page, control, errors };
}

async function firstVisible(locator) {
  for (let index = 0; index < await locator.count(); index += 1) {
    if (await locator.nth(index).isVisible().catch(() => false)) return locator.nth(index);
  }
  return null;
}

async function openWork(run, reload = false) {
  const checks = run.control.checks;
  if (reload) await run.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  else await run.page.goto(`${base}${run.path}?ci=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await run.page.waitForFunction(() => document.readyState !== 'loading');
  await delay(150);
  if (reload) await waitFor(() => run.control.checks > checks, 5000);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const inputs = run.page.locator('.answer-input:visible, .answer:visible, [data-answer]:visible');
    if (await inputs.count() && await inputs.first().isEditable().catch(() => false)) return inputs;
    for (const selector of ['#reviewLocked', '#reviewBtn', '#reviewButton', '#backBtn', '#startButton', '#startBtn']) {
      const button = await firstVisible(run.page.locator(selector));
      if (button && await button.isEnabled().catch(() => false)) {
        await button.click().catch(() => {});
        await delay(80);
      }
    }
    await delay(100);
  }
  throw new Error('answer fields did not open');
}

async function submitButton(page) {
  const button = await firstVisible(page.locator('#submitButton, #submitBtn, button[type="submit"]'));
  if (!button) throw new Error('submit button not visible');
  return button;
}

async function fillPartial(page) {
  const inputs = page.locator('.answer-input:visible, .answer:visible, [data-answer]:visible');
  for (let index = 0; index < await inputs.count(); index += 1) await inputs.nth(index).fill('');
  await inputs.first().fill('999999.123');
  await inputs.first().dispatchEvent('input');
  await inputs.first().dispatchEvent('change');
  await delay(50);
}

async function clickSubmit(page) {
  const button = await submitButton(page);
  if (!await button.isEnabled()) return false;
  await button.click();
  return true;
}

async function waitFor(predicate, timeout = 7000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await delay(50);
  }
  return false;
}

const events = control => [...new Set(control.submissions.map(item => item.eventId).filter(Boolean))];
async function storageContaining(page, eventId) {
  return page.evaluate(id => Object.fromEntries(Object.keys(localStorage)
    .map(key => [key, localStorage.getItem(key)])
    .filter(([, value]) => value?.includes(id))), eventId);
}

async function waitUntilEventLeavesQueue(page, eventId, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const stored = await storageContaining(page, eventId);
    if (!Object.keys(stored).some(key => /pending|queue|outbox/i.test(key))) return true;
    await delay(50);
  }
  return false;
}

async function mainScenarios(path) {
  const run = await harness(path);
  try {
    await openWork(run);
    const blankButton = await submitButton(run.page);
    if (await blankButton.isEnabled()) await blankButton.click();
    await delay(150);
    const blankBlocked = run.control.submissions.length === 0;
    await fillPartial(run.page);
    const partialEnabled = await (await submitButton(run.page)).isEnabled();
    await clickSubmit(run.page);
    await waitFor(() => run.control.saved.length === 1);
    const first = run.control.submissions[0];
    if (first?.eventId) await waitUntilEventLeavesQueue(run.page, first.eventId);
    run.control.submitted = false;
    await openWork(run, true);
    await fillPartial(run.page);
    await clickSubmit(run.page);
    await waitFor(() => events(run.control).length === 2);
    const reassignmentCreatesOne = events(run.control).length === 2;
    const secondEventId = events(run.control)[1];
    if (secondEventId) await waitUntilEventLeavesQueue(run.page, secondEventId);
    run.control.submitted = true;
    await openWork(run, true);
    await fillPartial(run.page);
    const beforeTraining = events(run.control).length;
    const trainingClicked = await clickSubmit(run.page);
    await delay(250);
    return { blankBlocked, partialEnabled, firstSaved: run.control.saved.includes(first?.eventId),
      blanksCountWrong: Number(first?.scorePercent) < 100, reassignmentCreatesOne,
      trainingClicked, trainingNoPost: events(run.control).length === beforeTraining, errors: run.errors };
  } finally { await run.context.close(); }
}

async function queueScenario(path) {
  const run = await harness(path, 'fail');
  try {
    await openWork(run);
    await fillPartial(run.page);
    await clickSubmit(run.page);
    await waitFor(() => run.control.submissions.length > 0);
    const eventId = run.control.submissions[0]?.eventId;
    await delay(200);
    const queued = eventId && Object.keys(await storageContaining(run.page, eventId)).length > 0;
    run.control.submitted = false;
    const checks = run.control.checks;
    await run.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitFor(() => run.control.checks > checks, 5000);
    for (const selector of ['#reviewLocked', '#reviewBtn', '#reviewButton', '#backBtn', '#startButton', '#startBtn']) {
      const button = await firstVisible(run.page.locator(selector));
      if (button && await button.isEnabled().catch(() => false)) await button.click().catch(() => {});
    }
    const inputs = run.page.locator('.answer-input:visible, .answer:visible, [data-answer]:visible');
    if (await inputs.count() && await inputs.first().isEditable().catch(() => false)) {
      await fillPartial(run.page);
      await clickSubmit(run.page);
    }
    await delay(250);
    const noSecondWhileQueued = events(run.control).length === 1;
    run.control.submitMode = 'success';
    await run.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await waitFor(() => run.control.saved.includes(eventId), 10000);
    const retrySaved = run.control.saved.includes(eventId);
    run.control.submitted = true;
    await openWork(run, true);
    await fillPartial(run.page);
    const beforeTraining = events(run.control).length;
    await clickSubmit(run.page);
    await delay(250);
    return { queued, noSecondWhileQueued, retrySaved,
      trainingAfterRetryNoPost: events(run.control).length === beforeTraining, errors: run.errors };
  } finally { await run.context.close(); }
}

async function teacherManageSmoke() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route('https://script.google.com/**', async route => {
    const url = new URL(route.request().url());
    const callback = url.searchParams.get('callback');
    const action = url.searchParams.get('action');
    const data = action === 'getTeacherDataVersion'
      ? { ok: true, version: 'browser-ci' }
      : { ok: true, version: 'browser-ci', dataVersion: 'browser-ci', fromServerCache: false,
        students: [], groups: [], catalog: [], statistics: { currentMonth: '2026-10', students: {} } };
    await route.fulfill({ status: 200, contentType: 'application/javascript',
      body: callback ? `${callback}(${JSON.stringify(data)});` : JSON.stringify(data) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await page.goto(`${base}/EGA/config/manage.html?ci=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#homeworkDiagnostics', { state: 'attached', timeout: 5000 });
    await delay(250);
    return { pass: errors.length === 0, errors };
  } finally { await context.close(); }
}

const results = [];
let cursor = 0;
async function worker() {
  while (cursor < paths.length) {
    const path = paths[cursor++];
    try {
      const main = await mainScenarios(path);
      const queue = await queueScenario(path);
      const pass = Object.entries(main).filter(([key]) => key !== 'errors').every(([, value]) => value === true)
        && Object.entries(queue).filter(([key]) => key !== 'errors').every(([, value]) => value === true)
        && !main.errors.length && !queue.errors.length;
      results.push({ path, pass, main, queue });
      console.log(`${pass ? 'PASS' : 'FAIL'} ${path}`);
    } catch (error) {
      results.push({ path, pass: false, error: error.stack || error.message });
      console.log(`FAIL ${path}: ${error.message}`);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), paths.length) }, worker));
const teacherManage = await teacherManageSmoke();
console.log(`${teacherManage.pass ? 'PASS' : 'FAIL'} /EGA/config/manage.html`);
await browser.close();
const failed = results.filter(result => !result.pass);
console.log(JSON.stringify({ base, total: results.length, passed: results.length - failed.length,
  teacherManage, failed }, null, failed.length || !teacherManage.pass ? 2 : 0));
process.exitCode = failed.length || !teacherManage.pass ? 1 : 0;
