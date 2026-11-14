import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.TAS_BROWSER_BASE || 'http://127.0.0.1:8766';
const output = process.env.TAS_SCREENSHOT_DIR || 'test-results/meleto-ui02';
const students = [
  { membershipId: '11111111-1111-4111-8111-111111111111', studentName: 'Алексей Смирнов', programName: 'Профильная математика', grade: '11', targetScore: '85+' },
  { membershipId: '22222222-2222-4222-8222-222222222222', studentName: 'Мария Волкова', programName: 'ОГЭ по математике', grade: '9', targetScore: '5' },
  { membershipId: '33333333-3333-4333-8333-333333333333', studentName: 'Иван Соколов', programName: 'Профильная математика', grade: '11', targetScore: '90+' },
];
const lessons = students.slice(0, 2).map((student, index) => ({
  id: `44444444-4444-4444-8444-44444444444${index}`,
  lessonAt: new Date(Date.now() + (index + 1) * 86400000).toISOString(),
  participants: [{ membershipId: student.membershipId, topicComment: 'Практика' }],
}));

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1348, height: 926 }, deviceScaleFactor: 1 });
let unexpectedWrites = 0;
let classWrites = 0;
const classes = [];
const createdClassId = '55555555-5555-4555-8555-555555555555';
const setClassSearch = value => page.locator('#classSearch').evaluate((input, next) => {
  input.value = next;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}, value);

await page.route('https://arthur200014-testing-hosting-8c4e.twc1.net/api/v1/**', async route => {
  const request = route.request();
  const path = new URL(request.url()).pathname.replace('/api/v1/', '');
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  const send = (value, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(value) });
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  if (path === 'teacher-sessions' && request.method() === 'POST')
    return send({ accessToken: 'synthetic-ui-token', expiresAt: new Date(Date.now() + 300000).toISOString() });
  if (path === 'teacher/classes' && request.method() === 'POST') {
    const body = request.postDataJSON();
    assert.ok(body.requestId);
    const student = students.find(x => x.membershipId === body.studentMembershipId);
    assert.ok(student);
    const item = {
      id: createdClassId, title: body.title, kind: 'individual',
      studentMembershipId: student.membershipId, studentName: student.studentName,
      programName: student.programName, programId: '66666666-6666-4666-8666-666666666666',
      isArchived: false, createdAt: new Date().toISOString()
    };
    classes.splice(0, classes.length, item);
    classWrites++;
    return send(item, 201);
  }
  if (request.method() !== 'GET') { unexpectedWrites++; return route.fulfill({ status: 405, headers }); }
  if (path === 'teacher/classes') return send(classes);
  if (path === 'teacher/students') return send(students);
  if (path === 'teacher/lessons') return send(lessons);
  throw new Error('Unexpected UI-01 read: ' + path);
});

try {
  await page.goto(base + '/platform/teacher.html');
  await page.locator('#loginForm [name="workspace"]').fill('synthetic');
  await page.locator('#loginForm [name="email"]').fill('teacher@example.invalid');
  await page.locator('#loginForm [name="password"]').fill('synthetic-password');
  await page.locator('#loginForm button[type="submit"]').click();
  await page.locator('[data-open-class]').first().waitFor();
  await page.locator('#notice').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('[data-open-class]').count(), 3);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: output + '/01_classes.png' });

  await setClassSearch('нет такого класса');
  await page.getByText('По запросу ничего не найдено.').waitFor();
  await setClassSearch('Алексей');
  assert.equal(await page.locator('[data-open-class]').count(), 1);
  await setClassSearch('');
  await page.locator('[data-open-class]').first().click();
  await page.locator('[data-back-classes]').click();

  await page.locator('[data-open-learning]').click();
  await page.locator('.learning-modal').waitFor();
  await page.screenshot({ path: output + '/02_learning_type.png' });
  await page.locator('.modal-close').click();
  await page.locator('.learning-modal').waitFor({ state: 'detached' });
  assert.equal(unexpectedWrites, 0);

  await page.locator('[data-open-learning]').click();
  await page.locator('[data-learning-type="individual"]').click();
  await page.locator('#classForm').waitFor();
  await page.locator('[data-cancel-class]').click();
  assert.equal(classWrites, 0, 'cancel must not create a class');

  await page.locator('[data-open-learning]').click();
  await page.locator('[data-learning-type="individual"]').click();
  await page.locator('#classForm [name="title"]').fill('Алексей · ЕГЭ 2027');
  await page.screenshot({ path: output + '/03_individual_create.png' });
  await page.locator('#classForm button[type="submit"]').click();
  const createdCard = page.locator(`[data-open-class="${createdClassId}"]`);
  await createdCard.waitFor({ state: 'attached' });
  assert.match(await createdCard.locator('xpath=ancestor::article').textContent(), /Алексей · ЕГЭ 2027/);
  assert.equal(classWrites, 1);
  assert.equal(unexpectedWrites, 0);
  await page.reload();
  await page.locator('#loginForm [name="workspace"]').fill('synthetic');
  await page.locator('#loginForm [name="email"]').fill('teacher@example.invalid');
  await page.locator('#loginForm [name="password"]').fill('synthetic-password');
  await page.locator('#loginForm button[type="submit"]').click();
  await page.locator(`[data-open-class="${createdClassId}"]`).waitFor({ state: 'attached' });
  assert.equal(await page.locator('[data-open-class]').count(), 3, 'persisted class replaces its legacy projection');
  console.log('PASS: UI-01 screenshots plus UI-02 individual class cancel/create/reload at 1348x926');
} finally {
  await browser.close();
}
