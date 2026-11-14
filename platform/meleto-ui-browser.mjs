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
page.on('pageerror', error => console.error('UI PAGE ERROR:', error.stack));
let unexpectedWrites = 0;
let classWrites = 0;
let classEdits = 0;
let archiveWrites = 0;
let restoreWrites = 0;
let inviteWrites = 0;
let revokeWrites = 0;
const syntheticInviteCode = 'B'.repeat(64);
const classes = [];
const createdClassId = '55555555-5555-4555-8555-555555555555';
const setClassSearch = value => page.locator('#classSearch').evaluate((input, next) => {
  input.value = next;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}, value);

await page.route('https://arthur200014-testing-hosting-8c4e.twc1.net/api/v1/**', async route => {
  const request = route.request();
  const path = new URL(request.url()).pathname.replace('/api/v1/', '');
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS' };
  const send = (value, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(value) });
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  if (path === 'teacher-sessions' && request.method() === 'POST')
    return send({ accessToken: 'synthetic-ui-token', expiresAt: new Date(Date.now() + 300000).toISOString() });
  if (path === 'teacher/classes' && request.method() === 'POST') {
    const body = request.postDataJSON();
    assert.ok(body.requestId);
    assert.equal(body.durationMinutes, 90);
    assert.equal(body.priceAmount, 1750.5);
    assert.equal(body.priceCurrency, 'EUR');
    assert.equal(body.priceBasis, 'month');
    assert.equal(body.allowLessonChat, true);
    assert.equal(body.allowPrivateMessages, true);
    assert.equal(body.coverStyle, 'sky');
    const student = students.find(x => x.membershipId === body.studentMembershipId);
    assert.ok(student);
    const item = {
      id: createdClassId, revision: 1, title: body.title, description: body.description, kind: 'individual',
      coverStyle: body.coverStyle, invitationStatus: null, invitationExpiresAt: null,
      durationMinutes: body.durationMinutes, priceAmount: body.priceAmount,
      priceCurrency: body.priceCurrency, priceBasis: body.priceBasis,
      allowLessonChat: body.allowLessonChat, allowPrivateMessages: body.allowPrivateMessages,
      studentMembershipId: student.membershipId, studentName: student.studentName,
      programName: student.programName, programId: '66666666-6666-4666-8666-666666666666',
      isArchived: false, createdAt: new Date().toISOString()
    };
    classes.splice(0, classes.length, item);
    classWrites++;
    return send(item, 201);
  }
  const classRoute = path.match(/^teacher\/classes\/([^/]+)(?:\/(archive|restore|invitation(?:\/revoke)?))?$/);
  if (classRoute) {
    const body = request.postDataJSON();
    const item = classes.find(x => x.id === classRoute[1]);
    if (!item) return send({ title: 'Not found' }, 404);
    if (body.expectedRevision !== item.revision) return send({ title: 'Conflict' }, 409);
    if (request.method() === 'POST' && classRoute[2] === 'invitation') {
      item.invitationStatus = 'pending';
      item.invitationExpiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      item.revision++;
      inviteWrites++;
      return send({ code: syntheticInviteCode, expiresAt: item.invitationExpiresAt, revision: item.revision });
    }
    if (request.method() === 'POST' && classRoute[2] === 'invitation/revoke') {
      item.invitationStatus = 'revoked';
      item.revision++;
      revokeWrites++;
      return send({ status: 'revoked', revision: item.revision, acceptedAt: null });
    }
    if (request.method() === 'PATCH' && !classRoute[2]) {
      if (item.isArchived) return send({ title: 'Archived' }, 409);
      Object.assign(item, body, { revision: item.revision + 1 });
      delete item.expectedRevision;
      classEdits++;
      return send(item);
    }
    if (request.method() === 'POST' && ['archive', 'restore'].includes(classRoute[2])) {
      const desired = classRoute[2] === 'archive';
      if (item.isArchived !== desired) {
        item.isArchived = desired;
        item.revision++;
        desired ? archiveWrites++ : restoreWrites++;
      }
      return send(item);
    }
    unexpectedWrites++;
    return route.fulfill({ status: 405, headers });
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
  const classesArea = await page.locator('.classes-main').boundingBox();
  const todayArea = await page.locator('.today-panel').boundingBox();
  assert.ok(classesArea.width > 650 && classesArea.width < 740, 'classes column should match Meleto ~700px');
  assert.ok(todayArea.x > 955 && todayArea.x < 1020, 'today column should start near reference x=980');
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
  const modal = await page.locator('.learning-modal').boundingBox();
  assert.ok(modal.width > 620 && modal.width < 645, 'reference modal should be ~632px wide');
  await page.screenshot({ path: output + '/02_learning_type.png' });
  await page.locator('.modal-close').click();
  await page.locator('.learning-modal').waitFor({ state: 'detached' });
  assert.equal(unexpectedWrites, 0);

  await page.locator('[data-open-learning]').click();
  await page.locator('[data-learning-type="individual"]').click();
  await page.locator('#classForm').waitFor();
  await page.locator('#classForm [name="description"]').fill('Отменённое описание');
  await page.locator('#classForm [name="durationEnabled"]').check();
  await page.locator('#classForm [name="priceEnabled"]').check();
  await page.locator('#classForm [name="priceAmount"]').fill('999');
  await page.locator('#classForm [name="allowLessonChat"]').check();
  await page.locator('[data-cancel-class]').click();
  assert.equal(classWrites, 0, 'cancel must not create a class');

  await page.locator('[data-open-learning]').click();
  await page.locator('[data-learning-type="individual"]').click();
  const title = 'Алексей · ЕГЭ 2027';
  const description = 'Подготовка к профильному ЕГЭ';
  await page.locator('#classForm [name="title"]').fill(title);
  await page.locator('#classForm [name="description"]').fill(description);
  const createBounds = await page.locator('#classForm').boundingBox();
  const titleBounds = await page.locator('#classForm [name="title"]').boundingBox();
  const coverBounds = await page.locator('#classForm [data-cover-display]').boundingBox();
  assert.ok(createBounds.width > 1000, 'create form must occupy the full content column');
  assert.ok(coverBounds.x > titleBounds.x + titleBounds.width, 'cover belongs to the right of the fields');
  await page.locator('#classForm [data-toggle-covers]').click();
  await page.locator('#classForm [name="coverStyle"][value="sky"]').check();
  assert.equal(await page.locator('#classForm [name="title"]').getAttribute('maxlength'), '50');
  assert.equal(await page.locator('#classForm [name="description"]').getAttribute('maxlength'), '200');
  assert.equal(await page.locator('#classForm [name="title"]').locator('xpath=parent::label').locator('[data-char-count]').textContent(), title.length + ' / 50');
  assert.equal(await page.locator('#classForm [name="description"]').locator('xpath=parent::label').locator('[data-char-count]').textContent(), description.length + ' / 200');
  const form = page.locator('#classForm');
  assert.equal(await form.locator('[data-settings-group="duration"]').isVisible(), false);
  assert.equal(await form.locator('[name="durationMinutes"]').isDisabled(), true);
  await form.locator('[name="durationEnabled"]').check();
  await form.locator('[name="durationMinutes"]').fill('90');
  await form.locator('[name="priceEnabled"]').check();
  await form.locator('[name="priceAmount"]').fill('1750.50');
  await form.locator('[name="priceCurrency"]').selectOption('EUR');
  await form.locator('[name="priceBasis"]').selectOption('month');
  await form.locator('[name="allowLessonChat"]').check();
  await form.locator('[name="allowPrivateMessages"]').check();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: output + '/03_individual_create.png' });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const chats = await page.locator('#classForm .class-chats-section').boundingBox();
  const toolbar = await page.locator('.top').boundingBox();
  const brand = await page.locator('aside .brand').boundingBox();
  assert.ok(chats && chats.y < 926 && chats.y + chats.height > 0, 'screen 04 must show the bottom chat settings');
  assert.ok(toolbar && toolbar.y >= -1 && toolbar.y <= 2, 'top toolbar should remain visible while scrolling');
  assert.ok(brand && brand.y >= 0 && brand.y < 70, 'sidebar brand should stay visible while scrolling');
  await page.screenshot({ path: output + '/04_individual_settings.png' });
  await page.locator('#classForm button[type="submit"]').click();
  const createdCard = page.locator(`[data-open-class="${createdClassId}"]`);
  await createdCard.waitFor({ state: 'attached' });
  assert.match(await createdCard.locator('xpath=ancestor::article').textContent(), /Алексей · ЕГЭ 2027/);
  assert.equal(classWrites, 1);
  assert.equal(unexpectedWrites, 0);
  await createdCard.click();
  await page.getByText(description, { exact: true }).waitFor();
  await page.getByText(/90 мин/).waitFor();
  await page.getByText(/EUR/).waitFor();
  await page.locator('[data-back-classes]').click();
  await page.reload();
  await page.locator('#loginForm [name="workspace"]').fill('synthetic');
  await page.locator('#loginForm [name="email"]').fill('teacher@example.invalid');
  await page.locator('#loginForm [name="password"]').fill('synthetic-password');
  await page.locator('#loginForm button[type="submit"]').click();
  await page.locator(`[data-open-class="${createdClassId}"]`).waitFor({ state: 'attached' });
  assert.equal(await page.locator('[data-open-class]').count(), 3, 'persisted class replaces its legacy projection');
  await page.locator(`[data-open-class="${createdClassId}"]`).click();
  await page.getByText(description, { exact: true }).waitFor();
  await page.getByText(/90 мин/).waitFor();
  await page.getByText(/EUR/).waitFor();

  // Existing details survive reload, cancel never writes, and edit preserves membership.
  await page.locator('[data-edit-class]').click();
  const edit = page.locator('#classEditForm');
  await edit.waitFor();
  assert.equal(await edit.locator('[name="title"]').inputValue(), title);
  assert.equal(await edit.locator('[name="description"]').inputValue(), description);
  assert.equal(await edit.locator('[name="durationEnabled"]').isChecked(), true);
  assert.equal(await edit.locator('[name="priceEnabled"]').isChecked(), true);
  assert.equal(await edit.locator('[name="priceCurrency"]').inputValue(), 'EUR');
  assert.equal(await edit.locator('[name="priceBasis"]').inputValue(), 'month');
  assert.equal(await edit.locator('[name="allowLessonChat"]').isChecked(), true);
  assert.equal(await edit.locator('[name="coverStyle"]:checked').inputValue(), 'sky');
  await edit.locator('[name="title"]').fill('Не сохранять');
  await page.locator('[data-cancel-class-edit]').click();
  assert.equal(classEdits, 0);

  await page.locator('[data-edit-class]').click();
  const editAgain = page.locator('#classEditForm');
  await editAgain.locator('[name="title"]').fill('Класс после редактирования');
  await editAgain.locator('[name="description"]').fill('Настройки обновлены');
  await editAgain.locator('[name="durationMinutes"]').fill('120');
  await editAgain.locator('[name="priceEnabled"]').uncheck();
  await editAgain.locator('[name="allowLessonChat"]').uncheck();
  await editAgain.locator('[name="allowPrivateMessages"]').check();
  await editAgain.locator('[data-toggle-covers]').click();
  await editAgain.locator('[name="coverStyle"][value="mint"]').check();
  await page.screenshot({ path: output + '/31_class_edit.png' });
  await editAgain.locator('[type="submit"]').click();
  await page.getByText('Класс после редактирования', { exact: true }).waitFor();
  await page.getByText('Настройки обновлены', { exact: true }).waitFor();
  await page.getByText(/120 мин/).waitFor();
  assert.equal(classEdits, 1);
  assert.equal(classes[0].studentMembershipId, students[0].membershipId);
  assert.equal(classes[0].revision, 2);
  assert.equal(classes[0].priceAmount, null);
  assert.equal(classes[0].coverStyle, 'mint');

  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('[data-archive-class]').click();
  assert.equal(archiveWrites, 0, 'dismissed archive confirmation must not write');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-archive-class]').click();
  await page.locator('[data-class-tab="archive"].active').waitFor();
  await page.locator('[data-restore-class]').waitFor();
  assert.equal(archiveWrites, 1);
  assert.equal(await page.locator('[data-open-class]').count(), 1);
  await page.screenshot({ path: output + '/33_class_archive.png' });

  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('[data-restore-class]').click();
  assert.equal(restoreWrites, 0);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-restore-class]').click();
  await page.locator('[data-class-tab="classes"].active').waitFor();
  await page.locator(`[data-open-class="${createdClassId}"]`).waitFor();
  assert.equal(restoreWrites, 1);
  assert.equal(classes[0].revision, 4);
  assert.equal(await page.locator('[data-open-class]').count(), 3, 'legacy student projection stays deduplicated');

  await page.reload();
  await page.locator('#loginForm [name="workspace"]').fill('synthetic');
  await page.locator('#loginForm [name="email"]').fill('teacher@example.invalid');
  await page.locator('#loginForm [name="password"]').fill('synthetic-password');
  await page.locator('#loginForm button[type="submit"]').click();
  await page.locator(`[data-open-class="${createdClassId}"]`).click();
  await page.getByText('Класс после редактирования', { exact: true }).waitFor();
  await page.getByText(/120 мин/).waitFor();
  assert.equal(await page.locator('.class-detail-banner.cover-mint').count(), 1);

  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('[data-issue-class-invite]').click();
  assert.equal(inviteWrites, 0, 'cancelled invitation should not write');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-issue-class-invite]').click();
  const codeField = page.locator('[data-invite-code]');
  await codeField.waitFor();
  assert.equal(await codeField.textContent(), syntheticInviteCode);
  assert.equal(inviteWrites, 1);
  await codeField.scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + '/03_class_cover_invite.png' });

  await page.reload();
  await page.locator('#loginForm [name="workspace"]').fill('synthetic');
  await page.locator('#loginForm [name="email"]').fill('teacher@example.invalid');
  await page.locator('#loginForm [name="password"]').fill('synthetic-password');
  await page.locator('#loginForm button[type="submit"]').click();
  await page.locator(`[data-open-class="${createdClassId}"]`).click();
  await page.getByText('Ожидает подтверждения').waitFor();
  assert.equal(await page.locator('[data-invite-code]').count(), 0, 'secret never returned on read');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-revoke-class-invite]').click();
  await page.getByText('Отозвано', { exact: true }).waitFor();
  assert.equal(revokeWrites, 1);
  assert.equal(unexpectedWrites, 0);

  // Student-facing flow: a separate login is required before confirming an invite.
  const studentPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  let acceptedByStudent = 0;
  await studentPage.route('https://arthur200014-testing-hosting-8c4e.twc1.net/api/v1/**', async route => {
    const request = route.request();
    const routePath = new URL(request.url()).pathname.replace('/api/v1/', '');
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS'
    };
    const respond = (data, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(data) });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (routePath === 'student-sessions' && request.method() === 'POST')
      return respond({ accessToken: 'synthetic-student-token', student: { displayName: 'Алексей Смирнов' } });
    if (routePath === 'homework/native/assignments' && request.method() === 'GET')
      return respond([]);
    if (routePath === 'student/classes/invitations/accept' && request.method() === 'POST') {
      assert.equal(request.headers().authorization, 'Bearer synthetic-student-token');
      assert.equal(request.postDataJSON().code, syntheticInviteCode);
      acceptedByStudent++;
      return respond({ status: 'accepted', revision: 7, acceptedAt: new Date().toISOString() });
    }
    throw new Error('Unexpected student request: ' + routePath);
  });
  await studentPage.goto(base + '/platform/student.html');
  await studentPage.locator('#loginForm [name="workspace"]').fill('synthetic');
  await studentPage.locator('#loginForm [name="code"]').fill('synthetic-login-code');
  await studentPage.locator('#loginForm [type="submit"]').click();
  await studentPage.locator('#classInvitationForm').waitFor();
  await studentPage.locator('#classInvitationForm [name="code"]').fill(syntheticInviteCode);
  await studentPage.locator('#classInvitationForm [type="submit"]').click();
  await studentPage.getByText('Приглашение в класс подтверждено.').waitFor();
  assert.equal(acceptedByStudent, 1);
  assert.equal(await studentPage.locator('#classInvitationForm [name="code"]').inputValue(), '');
  await studentPage.close();
  console.log('PASS: UI-02 cover and authenticated teacher/student invitation lifecycle at 1348x926');
} finally {
  await browser.close();
}
