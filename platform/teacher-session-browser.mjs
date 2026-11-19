import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Synthetic, isolated session/cache boundary and failure-retry check.
// No requests are sent to any real backend: the API host is fully intercepted.
const base = process.env.TAS_BROWSER_BASE || 'http://127.0.0.1:8766';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1348, height: 926 }, deviceScaleFactor: 1 });

const fixtures = {
  signup: { students: [], program: 'Основная программа' },
  north: { students: [
    { membershipId: '11111111-1111-4111-8111-111111111111', studentName: 'North learner', programName: 'North subject' }
  ], program: 'North subject' },
  south: { students: [
    { membershipId: '22222222-2222-4222-8222-222222222222', studentName: 'South learner A', programName: 'South subject' },
    { membershipId: '33333333-3333-4333-8333-333333333333', studentName: 'South learner B', programName: 'South subject' }
  ], program: 'South subject' }
};
let failedOnce = false, forceExpiry = false, northLessonsStarted = false, registered = false;
const getReads = [];
await page.route('https://arthur200014-testing-hosting-8c4e.twc1.net/api/v1/**', async route => {
  const req = route.request(), path = new URL(req.url()).pathname.replace('/api/v1/', '');
  const body = req.postDataJSON?.() || {};
  const headers = { 'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS' };
  const send = (value, status = 200) => route.fulfill({
    status, headers, contentType: 'application/json', body: JSON.stringify(value)
  });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  if (path === 'teacher-signups' && req.method() === 'POST') {
    assert.deepEqual(body, { email: 'signup@example.invalid', password: 'synthetic-signup-password' });
    registered = true;
    return send({ created: true }, 201);
  }
  if (path === 'teacher-sessions' && req.method() === 'POST') {
    assert.equal(body.workspace, undefined);
    const workspace = body.email.split('@')[0];
    assert.ok(Object.hasOwn(fixtures, workspace));
    if (workspace === 'signup') assert.equal(registered, true);
    if (body.password === 'incorrect') return send({ title: 'Invalid synthetic login' }, 401);
    return send({ accessToken: 'synthetic-' + workspace, workspace,
      expiresAt: new Date(Date.now() + 300000).toISOString() });
  }
  if (path === 'teacher-sessions/logout' && req.method() === 'POST')
    return route.fulfill({ status: 204, headers });
  if (req.method() !== 'GET') throw new Error('Unexpected write: ' + path);
  const workspace = req.headers()['authorization']?.replace('Bearer synthetic-', '');
  assert.ok(fixtures[workspace], 'Only synthetic workspace tokens are allowed');
  getReads.push({ workspace, path });
  if (forceExpiry && workspace === 'south' && path === 'teacher/students')
    return send({ title: 'Expired synthetic teacher session' }, 403);
  if (!failedOnce && workspace === 'south' && path === 'teacher/students' &&
      req.headers()['x-force-failure'] === '1') {
    failedOnce = true;
    return send({ title: 'Synthetic network error' }, 503);
  }
  if (workspace === 'north' && path === 'teacher/lessons') {
    northLessonsStarted = true;
    await new Promise(resolve => setTimeout(resolve, 450));
  }
  const data = {
    'teacher/classes': [],
    'teacher/groups': [],
    'teacher/schedule-rules': [],
    'teacher/students': fixtures[workspace].students,
    'teacher/lessons': [],
    'teacher/homework/assignments': [],
    'teacher/homework/native/assignments': [],
    'teacher/subscriptions': [],
    'teacher/profile/settings': {lessonReminders:false,overdueInvoiceReminders:false,paymentRecipient:null,paymentBank:null,paymentUrl:null},
    'teacher/programs': [{ id: '11111111-1111-4111-8111-111111111111',
      displayName: fixtures[workspace].program }]
  };
  if (!Object.hasOwn(data, path)) throw new Error('Unexpected read ' + path);
  return send(data[path]);
});

async function login(workspace) {
  await page.locator('#loginForm [name="email"]').fill(workspace + '@example.invalid');
  await page.locator('#loginForm [name="password"]').fill('synthetic-password');
  await page.locator('#loginForm button[type="submit"]').click();
  await page.locator('#app:not([hidden])').waitFor();
  assert.equal(await page.locator('#workspaceName').textContent(), workspace);
}
try {
  await page.goto(base + '/platform/');
  await page.getByRole('heading', { name: 'Возможности платформы' }).waitFor({state:'attached'});
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), '#main');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
  for (const width of [320, 390]) {
    await page.setViewportSize({width, height:844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await page.getByRole('link', { name: 'Войти ученику' }).click();
  await page.locator('#loginForm [name="code"]').waitFor();
  await page.getByRole('link', { name: 'О платформе' }).press('Enter');
  await page.getByRole('link', { name: 'Войти преподавателю' }).click();
  const loginForm = page.locator('#loginForm');
  await loginForm.locator('[name="email"]').fill('north@example.invalid');
  await loginForm.locator('[name="password"]').fill('incorrect');
  await loginForm.getByRole('button', {name:'Войти', exact:true}).click();
  await page.locator('#loginError').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'loginError');
  await login('north');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'teacherMain');
  const menu = page.locator('#teacherNavToggle');
  const navigation = page.locator('#teacherNav');
  await navigation.waitFor({state:'hidden'});
  await menu.focus();
  await menu.press('Enter');
  await navigation.waitFor();
  await navigation.locator('[aria-current="page"]').focus();
  await page.keyboard.press('Escape');
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'teacherNavToggle');
  await menu.press('Enter');
  await navigation.locator('[data-view="students"]').click();
  assert.equal(await navigation.locator('[data-view="students"]').getAttribute('aria-current'), 'page');
  await navigation.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(() => document.activeElement.id), 'teacherMain');
  await menu.click();
  await navigation.locator('[data-view="overview"]').click();
  await page.setViewportSize({width:1348,height:926});
  await navigation.waitFor();
  await page.locator('[data-open-class="11111111-1111-4111-8111-111111111111"]').waitFor();
  assert.equal(northLessonsStarted, true);
  const classEntry = page.locator('[data-open-class="11111111-1111-4111-8111-111111111111"]');
  const backToClasses = page.locator('[data-back-classes]').first();
  await classEntry.press('Enter');
  assert.ok(await backToClasses.evaluate(node => node === document.activeElement));
  await backToClasses.press('Enter');
  assert.ok(await classEntry.evaluate(node => node === document.activeElement));
  const newClass = page.locator('[data-open-learning]');
  const learning = page.locator('.learning-modal:not(.count-plan-modal)');
  await newClass.press('Enter');
  await learning.waitFor();
  assert.ok(await learning.locator('.modal-close').evaluate(node => node === document.activeElement));
  await page.keyboard.press('Shift+Tab');
  assert.ok(await learning.locator('[data-learning-type="one-time"]').evaluate(node => node === document.activeElement));
  await page.keyboard.press('Tab');
  assert.ok(await learning.locator('.modal-close').evaluate(node => node === document.activeElement));
  await page.keyboard.press('Escape');
  await learning.waitFor({state:'detached'});
  assert.ok(await newClass.evaluate(node => node === document.activeElement));
  await newClass.press('Enter');
  await learning.locator('[data-learning-type="individual"]').press('Enter');
  await page.locator('#classForm [data-cancel-class]').press('Enter');
  assert.ok(await newClass.evaluate(node => node === document.activeElement));
  await page.locator('#logout').click();
  await page.locator('#loginScreen:not([hidden])').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.name), 'email');
  await login('south');
  await page.locator('[data-open-class]').first().waitFor();
  assert.equal(await page.locator('[data-open-class]').count(), 2);
  await page.waitForTimeout(500); // previous North lesson response has now arrived
  await page.locator('[data-view="students"]').click();
  await page.locator('#studentRows').getByText('South learner A').waitFor({ state: 'attached' });
  const text = await page.locator('#studentRows').textContent();
  assert.match(text, /South learner A/);
  assert.doesNotMatch(text, /North learner/);
  assert.equal(getReads.filter(x => x.workspace === 'south' && x.path === 'teacher/students').length, 1);

  // Emulate a failed GET refresh and confirm the last successful rows stay visible.
  await page.route('https://arthur200014-testing-hosting-8c4e.twc1.net/api/v1/teacher/students',
    async route => {
      if (!failedOnce) {
        failedOnce = true;
        return route.fulfill({ status: 503, contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' }, body: '{"title":"Synthetic network error"}' });
      }
      return route.fallback();
    });
  await page.locator('#refresh').click();
  await page.locator('#notice').filter({ hasText: 'Synthetic network error' }).waitFor();
  assert.match(await page.locator('#studentRows').textContent(), /South learner A/);
  await page.locator('#refresh').click();
  await page.locator('#notice').waitFor({ state: 'hidden' });
  assert.match(await page.locator('#studentRows').textContent(), /South learner B/);

  forceExpiry = true;
  await page.locator('#refresh').click();
  await page.locator('#loginScreen:not([hidden])').waitFor();
  assert.equal(await page.locator('#app').isHidden(), true);
  assert.equal(await page.locator('#workspaceChoice').isVisible(), false);
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
  const signup = page.locator('#registerForm');
  await signup.locator('[name="email"]').fill('signup@example.invalid');
  await signup.locator('[name="password"]').fill('synthetic-signup-password');
  await signup.locator('[name="confirmPassword"]').fill('different-synthetic-password');
  await signup.getByRole('button', { name: 'Создать аккаунт' }).click();
  await page.locator('#loginError').filter({ hasText: 'Пароли не совпадают.' }).waitFor();
  assert.equal(registered, false);
  await signup.locator('[name="confirmPassword"]').fill('synthetic-signup-password');
  await signup.getByRole('button', { name: 'Создать аккаунт' }).click();
  await page.locator('#app:not([hidden])').waitFor();
  assert.equal(registered, true);
  assert.equal(await page.locator('#workspaceName').textContent(), 'signup');
  console.log('PASS: signup, isolated workspaces, stale-response rejection, offline refresh/retry and expired session logout');
} finally { await browser.close(); }
