import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Synthetic, isolated session/cache boundary and failure-retry check.
// No requests are sent to any real backend: the API host is fully intercepted.
const base = process.env.TAS_BROWSER_BASE || 'http://127.0.0.1:8766';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const fixtures = {
  north: { students: [
    { membershipId: '11111111-1111-4111-8111-111111111111', studentName: 'North learner', programName: 'North subject' }
  ], program: 'North subject' },
  south: { students: [
    { membershipId: '22222222-2222-4222-8222-222222222222', studentName: 'South learner A', programName: 'South subject' },
    { membershipId: '33333333-3333-4333-8333-333333333333', studentName: 'South learner B', programName: 'South subject' }
  ], program: 'South subject' }
};
let failedOnce = false, forceExpiry = false, northLessonsStarted = false;
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
  if (path === 'teacher-sessions' && req.method() === 'POST') {
    assert.ok(['north', 'south'].includes(body.workspace));
    return send({ accessToken: 'synthetic-' + body.workspace,
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
    'teacher/students': fixtures[workspace].students,
    'teacher/lessons': [],
    'teacher/homework/assignments': [],
    'teacher/homework/native/assignments': [],
    'teacher/subscriptions': [],
    'teacher/programs': [{ id: '11111111-1111-4111-8111-111111111111',
      displayName: fixtures[workspace].program }]
  };
  if (!Object.hasOwn(data, path)) throw new Error('Unexpected read ' + path);
  return send(data[path]);
});

async function login(workspace) {
  await page.locator('#loginForm [name="workspace"]').fill(workspace);
  await page.locator('#loginForm [name="email"]').fill('synthetic@example.invalid');
  await page.locator('#loginForm [name="password"]').fill('synthetic-password');
  await page.locator('#loginForm button[type="submit"]').click();
  await page.locator('#workspaceName').getByText(workspace).waitFor();
}
try {
  await page.goto(base + '/platform/teacher.html');
  await login('north');
  await page.locator('#content .metric').first().getByText('1').waitFor();
  assert.equal(northLessonsStarted, true);
  await page.locator('#logout').click();
  await page.locator('#loginScreen:not([hidden])').waitFor();
  await login('south');
  await page.locator('#content .metric').first().getByText('2').waitFor();
  await page.waitForTimeout(500); // previous North lesson response has now arrived
  await page.locator('[data-view="students"]').click();
  await page.locator('#studentRows').getByText('South learner A').waitFor();
  const text = await page.locator('#studentRows').innerText();
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
  await page.locator('#notice').getByText('Synthetic network error').waitFor();
  assert.match(await page.locator('#studentRows').innerText(), /South learner A/);
  await page.locator('#refresh').click();
  await page.locator('#notice').getByText('Данные обновлены').waitFor();
  assert.match(await page.locator('#studentRows').innerText(), /South learner B/);

  forceExpiry = true;
  await page.locator('#refresh').click();
  await page.locator('#loginScreen:not([hidden])').waitFor();
  assert.equal(await page.locator('#app').isHidden(), true);
  console.log('PASS: two isolated workspaces, stale-response rejection, offline refresh/retry and expired session logout');
} finally { await browser.close(); }
