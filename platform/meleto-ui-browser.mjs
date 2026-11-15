import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { calendarDay, calendarTime } from './teacher-calendar.mjs';

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
lessons.push(
  { id:'77777777-7777-4777-8777-777777777771', lessonAt:new Date(Date.now()-3600000).toISOString(),
    participants:[{membershipId:students[0].membershipId, attendanceStatus:'Present',topicComment:'Синтетика: посещено'}] },
  { id:'77777777-7777-4777-8777-777777777772', lessonAt:new Date(Date.now()-7200000).toISOString(),
    participants:[{membershipId:students[0].membershipId, attendanceStatus:'Absent',topicComment:'Синтетика: пропуск'}] }
);
const homeworkAssignments = [
  { id:'88888888-8888-4888-8888-888888888881', membershipId:students[0].membershipId,
    assignedAt:new Date(Date.now()-3600000).toISOString(), submittedAt:new Date().toISOString(),status:'submitted' },
  { id:'88888888-8888-4888-8888-888888888882', membershipId:students[0].membershipId,
    assignedAt:new Date(Date.now()-3600000).toISOString(), submittedAt:null,status:'assigned' }
];

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1348, height: 926 }, deviceScaleFactor: 1, timezoneId:'America/Los_Angeles' });
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
const groups = [];
const createdGroupId = '99999999-9999-4999-8999-999999999999';
const groupInviteCode = 'C'.repeat(64);
let groupWrites = 0;
let groupEdits = 0;
let groupArchives = 0;
let groupRestores = 0;
let groupInvites = 0;
let scheduleWrites = 0;
let scheduleEdits = 0;
let scheduleDisables = 0;
const scheduleRules = [];
let plannedLessonWrites = 0;
const plannedLessonRequests = [];
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
  if (path === 'teacher/schedule-rules' && request.method() === 'POST') {
    const body = request.postDataJSON();
    assert.ok(body.requestId);
    const existing = scheduleRules.find(x=>x.requestId===body.requestId);
    if (existing) return send(existing,200);
    const overlap = scheduleRules.some(x=>x.classId===body.classId &&
      x.classKind===body.classKind && x.isActive && body.isActive &&
      (x.timeZoneId!==body.timeZoneId || ((x.daysMask&body.daysMask)!==0 &&
        x.startMinute<body.startMinute+body.durationMinutes &&
        body.startMinute<x.startMinute+x.durationMinutes)));
    if (overlap) return send({title:'Schedule conflict'},409);
    scheduleWrites++;
    const id = 'cccccccc-cccc-4ccc-8ccc-'+String(scheduleWrites).padStart(12,'0');
    const created = {...body,id,revision:1};
    scheduleRules.push(created);
    return send(created,201);
  }
  const scheduleMatch = path.match(/^teacher\/schedule-rules\/([^/]+)(?:\/(disable))?$/);
  if (scheduleMatch) {
    const row = scheduleRules.find(x=>x.id===scheduleMatch[1]);
    if (!row) return send({title:'Not found'},404);
    const body = request.postDataJSON();
    if (body.expectedRevision!==row.revision) return send({title:'Stale revision'},409);
    if (scheduleMatch[2]==='disable' && request.method()==='POST') {
      row.isActive = false; row.revision++; scheduleDisables++; return send(row);
    }
    if (request.method()==='PATCH' && !scheduleMatch[2]) {
      const overlap = scheduleRules.some(x=>x!==row && x.classId===row.classId &&
        x.classKind===row.classKind && x.isActive && body.isActive &&
        (x.timeZoneId!==body.timeZoneId || ((x.daysMask&body.daysMask)!==0 &&
          x.startMinute<body.startMinute+body.durationMinutes &&
          body.startMinute<x.startMinute+x.durationMinutes)));
      if (overlap) return send({title:'Schedule conflict'},409);
      Object.assign(row,body); delete row.expectedRevision;
      row.revision++; scheduleEdits++; return send(row);
    }
    return send({title:'Bad request'},405);
  }
  if (path === 'teacher/lessons' && request.method() === 'POST') {
    const body = request.postDataJSON();
    assert.ok(body.requestId, 'planned lesson is idempotent');
    assert.ok(body.title);
    assert.equal(body.participants.every(p => p.attendanceStatus === 'Unknown'), true,
      'planning a lesson does not mark attendance');
    const id = 'aaaaaaa0-aaaa-4aaa-8aaa-' + String(plannedLessonWrites + 1).padStart(12, '0');
    plannedLessonRequests.push(body);
    plannedLessonWrites++;
    lessons.push({ ...body, id, revision:'synthetic', participants:body.participants });
    return send({lessonId:id,legacyLessonId:'api:'+body.requestId,participantCount:body.participants.length},201);
  }
  if (path === 'teacher/groups' && request.method() === 'POST') {
    const body = request.postDataJSON();
    assert.equal(body.title, 'Синтетическая группа ЕГЭ');
    assert.deepEqual(body.memberIds, [students[0].membershipId, students[1].membershipId]);
    assert.equal(body.capacity, 3);
    assert.equal(body.autoApproveInvites, false);
    assert.ok(body.requestId);
    const item = { ...body, id:createdGroupId, kind:'group', revision:1, isArchived:false,
      invitationStatus:null, invitationExpiresAt:null, createdAt:new Date().toISOString(),
      members:body.memberIds.map(id => {
        const student = students.find(x => x.membershipId === id);
        return { membershipId:id, studentName:student.studentName,
          programName:student.programName, isApproved:true };
      }) };
    groups.push(item); groupWrites++;
    return send(item, 201);
  }
  const groupMatch = path.match(/^teacher\/groups\/([^/]+)(?:\/(archive|restore|invitation(?:\/revoke)?|members\/[^/]+\/approve))?$/);
  if (groupMatch) {
    const item = groups.find(x => x.id === groupMatch[1]);
    if (!item) return send({title:'Not found'},404);
    const body = request.postDataJSON();
    if (body.expectedRevision !== item.revision) return send({title:'Conflict'},409);
    if (request.method() === 'PATCH' && !groupMatch[2]) {
      Object.assign(item,body);
      item.members = body.memberIds.map(id => {
        const student = students.find(x => x.membershipId === id);
        const existing = item.members.find(x => x.membershipId === id);
        return { membershipId:id, studentName:student.studentName,
          programName:student.programName,isApproved:existing?.isApproved ?? true };
      });
      item.revision++; groupEdits++;
      return send(item);
    }
    if (groupMatch[2] === 'archive' || groupMatch[2] === 'restore') {
      item.isArchived = groupMatch[2] === 'archive';
      item.revision++;
      item.isArchived ? groupArchives++ : groupRestores++;
      return send(item);
    }
    if (groupMatch[2] === 'invitation') {
      item.invitationStatus = 'pending';
      item.invitationExpiresAt = new Date(Date.now() + 86400000).toISOString();
      item.revision++; groupInvites++;
      return send({code:groupInviteCode,expiresAt:item.invitationExpiresAt,revision:item.revision});
    }
    if (groupMatch[2] === 'invitation/revoke') {
      item.invitationStatus = 'revoked'; item.revision++;
      return send({status:'revoked',revision:item.revision});
    }
    if (groupMatch[2]?.endsWith('/approve')) {
      const id=groupMatch[2].split('/')[1];
      const member=item.members.find(x=>x.membershipId===id);
      if(!member)return send({title:'Not found'},404);
      member.isApproved=true; item.revision++; return send(item);
    }
    return send({title:'Bad request'},405);
  }
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
  if (path === 'teacher/groups') return send(groups);
  if (path === 'teacher/schedule-rules') return send(scheduleRules);
  if (path === 'teacher/students') return send(students);
  if (path === 'teacher/programs') return send([
    {id:'66666666-6666-4666-8666-666666666666', displayName:'Профильная математика'}
  ]);
  if (path === 'teacher/homework/catalog') return send([]);
  if (path === 'teacher/lessons') return send(lessons);
  if (path === 'teacher/homework/assignments') return send(homeworkAssignments);
  if (path === 'teacher/homework/native/assignments') return send([]);
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
  // Screen 32: month-scoped attendance and homework, no invented zero percentages.
  await page.locator('[data-class-tab="statistics"]').click();
  await page.locator('.class-statistics .class-stats-row').first().waitFor();
  assert.equal(await page.locator('.class-stats-entry').count(), 3);
  const statRow = page.locator('.class-stats-row').filter({ hasText:'Алексей Смирнов' });
  await statRow.locator('[aria-label="Посещение: 50%"]').waitFor();
  await statRow.locator('[aria-label="Задания: 50%"]').waitFor();
  await page.screenshot({ path: output + '/32_class_statistics.png' });
  await statRow.locator('[data-stat-expand]').click();
  await statRow.getByText('1 из 2').first().waitFor();
  await page.locator('[data-stats-month="-1"]').click();
  assert.ok((await statRow.locator('[aria-label="Посещение: нет данных"]').count()) === 1);
  await page.locator('[data-stats-month="1"]').click();
  await page.locator('[data-class-tab="classes"]').click();
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
  assert.equal(await page.locator('.class-detail-tabs button').count(), 7);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: output + '/09_class_summary.png' });
  await page.locator('.class-detail-tabs [data-class-detail-tab="information"]').click();
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
  await page.locator('.class-detail-tabs [data-class-detail-tab="information"]').click();
  await page.getByText(description, { exact: true }).waitFor();
  await page.getByText(/90 мин/).waitFor();
  await page.getByText(/EUR/).waitFor();

  // Existing details survive reload, cancel never writes, and edit preserves membership.
  await page.locator('.class-detail-menu summary').click();
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
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: output + '/31_class_edit.png' });
  await edit.locator('[name="title"]').fill('Не сохранять');
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('[data-cancel-class-edit]').click();
  await edit.waitFor();
  assert.equal(await edit.locator('[name="title"]').inputValue(), 'Не сохранять');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-cancel-class-edit]').click();
  assert.equal(classEdits, 0);

  await page.locator('.class-detail-menu summary').click();
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
  await page.screenshot({ path: output + '/31_class_edit_changes.png' });
  await editAgain.locator('[type="submit"]').click();
  await page.getByText('Класс после редактирования', { exact: true }).waitFor();
  await page.getByText('Настройки обновлены', { exact: true }).waitFor();
  await page.getByText(/120 мин/).waitFor();
  assert.equal(classEdits, 1);
  assert.equal(classes[0].studentMembershipId, students[0].membershipId);
  assert.equal(classes[0].revision, 2);
  assert.equal(classes[0].priceAmount, null);
  assert.equal(classes[0].coverStyle, 'mint');

  await page.locator('.class-detail-menu summary').click();
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
  await page.locator('.class-detail-tabs [data-class-detail-tab="information"]').click();
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
  await page.locator('.class-detail-tabs [data-class-detail-tab="information"]').click();
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
    if (routePath === 'student/groups/invitations/accept' && request.method() === 'POST') {
      assert.equal(request.headers().authorization, 'Bearer synthetic-student-token');
      assert.equal(request.postDataJSON().code, groupInviteCode);
      return respond({status:'pending'});
    }
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
  // Group classes remain distinct from individual classes and are persistent.
  await page.locator('[data-back-classes]').click();
  await page.locator('[data-open-learning]').click();
  await page.locator('[data-learning-type="group"]').click();
  const groupForm = page.locator('#groupForm');
  await groupForm.waitFor();
  await groupForm.locator('[name="title"]').fill('Синтетическая группа ЕГЭ');
  await groupForm.locator('[name="description"]').fill('Группа с двумя участниками');
  await groupForm.locator('[name="capacity"]').fill('3');
  await groupForm.locator('[name="autoApproveInvites"]').uncheck();
  await groupForm.locator('[name="candidateMember"]').selectOption(students[0].membershipId);
  await groupForm.locator('[data-add-group-member]').click();
  await groupForm.locator('[name="candidateMember"]').selectOption(students[1].membershipId);
  await groupForm.locator('[data-add-group-member]').click();
  assert.equal(await groupForm.locator('[name="groupMember"]').count(), 2);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({path:output+'/05_group_create_top.png'});
  await groupForm.locator('.group-settings').scrollIntoViewIfNeeded();
  await page.screenshot({path:output+'/06_group_create_bottom.png'});
  await groupForm.locator('[name="candidateMember"]').selectOption(students[0].membershipId);
  await groupForm.locator('[data-add-group-member]').click();
  assert.equal(await groupForm.locator('[name="groupMember"]').count(), 2, 'duplicate student must not be added');
  await groupForm.locator('button[type="submit"]').click();
  await page.locator(`[data-open-class="${createdGroupId}"]`).waitFor();
  assert.equal(groupWrites,1);
  await page.locator(`[data-open-class="${createdGroupId}"]`).click();
  await page.locator('.group-roster-member').first().waitFor();
  assert.equal(await page.locator('.group-roster-member').count(),2);
  await page.locator('.group-roster [data-edit-group]').click();
  const groupEdit = page.locator('#groupEditForm');
  await groupEdit.waitFor();
  assert.equal(await groupEdit.locator('[name="groupMember"]').count(),2);
  await groupEdit.locator('[name="title"]').fill('Синтетическая группа обновлена');
  await groupEdit.locator('[data-remove-group-member="'+students[1].membershipId+'"]').click();
  await groupEdit.locator('[name="candidateMember"]').selectOption(students[2].membershipId);
  await groupEdit.locator('[data-add-group-member]').click();
  await groupEdit.locator('button[type="submit"]').click();
  await page.getByText('Синтетическая группа обновлена',{exact:true}).first().waitFor();
  assert.equal(groupEdits,1);
  assert.deepEqual(groups[0].members.map(x=>x.membershipId),
    [students[0].membershipId,students[2].membershipId]);
  await page.locator('.class-detail-menu summary').click();
  page.once('dialog', d=>d.dismiss());
  await page.locator('[data-archive-class]').click();
  assert.equal(groupArchives,0,'cancelled group archive must not write');
  page.once('dialog', d=>d.accept());
  await page.locator('[data-archive-class]').click();
  await page.locator('[data-class-tab="archive"].active').waitFor();
  assert.equal(groupArchives,1);
  page.once('dialog',d=>d.dismiss());
  await page.locator('[data-restore-class="'+createdGroupId+'"]').click();
  assert.equal(groupRestores,0,'cancelled group restore must not write');
  page.once('dialog',d=>d.accept());
  await page.locator('[data-restore-class="'+createdGroupId+'"]').click();
  await page.locator('[data-class-tab="classes"].active').waitFor();
  assert.equal(groupRestores,1);
  await page.locator('[data-open-class="'+createdGroupId+'"]').click();
  await page.locator('.class-detail-tabs [data-class-detail-tab="information"]').click();
  page.once('dialog',d=>d.accept());
  await page.locator('[data-issue-class-invite]').click();
  await page.locator('[data-invite-code]').waitFor();
  assert.equal(await page.locator('[data-invite-code]').textContent(),groupInviteCode);
  assert.equal(groupInvites,1);
  await page.reload();
  await page.locator('#loginForm [name="workspace"]').fill('synthetic');
  await page.locator('#loginForm [name="email"]').fill('teacher@example.invalid');
  await page.locator('#loginForm [name="password"]').fill('synthetic-password');
  await page.locator('#loginForm button[type="submit"]').click();
  await page.locator('[data-open-class="'+createdGroupId+'"]').click();
  await page.locator('.class-detail-tabs [data-class-detail-tab="information"]').click();
  assert.equal(await page.locator('[data-invite-code]').count(),0,'group invite secret must not leak on refresh');
  assert.equal(unexpectedWrites,0);

  await studentPage.locator('#groupInvitationForm [name="code"]').fill(groupInviteCode);
  await studentPage.locator('#groupInvitationForm button[type="submit"]').click();
  await studentPage.getByText('Заявка на вступление отправлена преподавателю на подтверждение.').waitFor();
  await studentPage.close();
  // An individual class directly opens the matching one-lesson planning form.
  await page.locator('[data-back-classes]').click();
  await page.locator('[data-open-class="'+createdClassId+'"]').click();
  await page.locator('[data-schedule-class="'+createdClassId+'"]').first().click();
  const linkedPlan = page.locator('#lessonPlannerForm');
  await linkedPlan.waitFor();
  assert.equal(await linkedPlan.getAttribute('data-class-kind'),'individual');
  assert.equal(await linkedPlan.locator('[name="planMember"]:checked').count(),1);
  await linkedPlan.locator('[name="title"]').fill('Синтетическая планиметрия');
  page.once('dialog',d=>d.dismiss());
  await linkedPlan.locator('[data-cancel-lesson-plan]').click();
  assert.equal(plannedLessonWrites,0,'cancelled planning never writes');
  page.once('dialog',d=>d.accept());
  await linkedPlan.locator('[data-cancel-lesson-plan]').click();
  assert.equal(plannedLessonWrites,0);
  await page.locator('[data-create-one-time]').click();
  await page.locator('#lessonPlannerForm [name="title"]').fill('Синтетическое разовое');
  await page.locator('#lessonPlannerForm [name="planMember"][value="'+students[0].membershipId+'"]').check();
  await page.locator('#lessonPlannerForm [name="planMember"][value="'+students[2].membershipId+'"]').check();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:output+'/07_onetime_create.png'});
  await page.locator('#planDescription').scrollIntoViewIfNeeded();
  await page.screenshot({path:output+'/13_lesson_create_bottom.png'});
  await page.locator('#lessonPlannerForm button[type="submit"]').click();
  await page.locator('[data-create-one-time]').waitFor();
  assert.equal(plannedLessonWrites,1);
  assert.equal(plannedLessonRequests[0].individualClassId,null);
  assert.equal(plannedLessonRequests[0].groupClassId,null);
  assert.equal(plannedLessonRequests[0].participants.length,2);
  await page.locator('[data-view="overview"]').click();
  await page.locator('[data-open-class="'+createdClassId+'"]').click();
  await page.locator('[data-schedule-class="'+createdClassId+'"]').first().click();
  await page.locator('#lessonPlannerForm [name="title"]').fill('Синтетическая планиметрия');
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:output+'/12_lesson_create_top.png'});
  await page.locator('#lessonPlannerForm button[type="submit"]').click();
  await page.locator('[data-create-one-time]').waitFor();
  assert.equal(plannedLessonWrites,2);
  assert.equal(plannedLessonRequests[1].individualClassId,createdClassId);
  assert.equal(plannedLessonRequests[1].groupClassId,null);
  await page.locator('[data-view="overview"]').click();
  await page.locator('[data-open-class="'+createdGroupId+'"]').click();
  await page.locator('.class-detail-tabs [data-class-detail-tab="schedule"]').click();
  await page.locator('[data-schedule-class="'+createdGroupId+'"]').click();
  await page.locator('#lessonPlannerForm [name="title"]').fill('Синтетическая групповая тема');
  await page.locator('#lessonPlannerForm button[type="submit"]').click();
  await page.locator('[data-create-one-time]').waitFor();
  assert.equal(plannedLessonWrites,3);
  assert.equal(plannedLessonRequests[2].groupClassId,createdGroupId);
  assert.deepEqual(plannedLessonRequests[2].participants.map(x=>x.membershipId),
    [students[0].membershipId,students[2].membershipId]);
  // UI-03 reference 15: create, cancel, conflict, edit, reload, disable/re-enable.
  await page.locator('[data-view="overview"]').click();
  await page.locator('[data-open-class="'+createdClassId+'"]').click();
  await page.locator('.class-detail-tabs [data-class-detail-tab="schedule"]').click();
  await page.locator('[data-new-schedule-rule]').click();
  await page.locator('#classScheduleRuleForm [name="startTime"]').fill('15:30');
  page.once('dialog',d=>d.dismiss());
  await page.locator('[data-cancel-schedule-rule]').click();
  await page.locator('#classScheduleRuleForm').waitFor();
  page.once('dialog',d=>d.accept());
  await page.locator('[data-cancel-schedule-rule]').click();
  assert.equal(scheduleWrites,0,'cancelled schedule never writes');
  await page.locator('[data-new-schedule-rule]').click();
  await page.locator('#classScheduleRuleForm [name="scheduleDay"][value="1"]').check();
  await page.locator('#classScheduleRuleForm [name="scheduleDay"][value="4"]').check();
  await page.locator('#classScheduleRuleForm [name="startTime"]').fill('15:00');
  await page.locator('#classScheduleRuleForm button[type="submit"]').click();
  await page.locator('.class-rule-row').first().waitFor();
  assert.equal(scheduleWrites,1);
  assert.equal(scheduleRules[0].daysMask,5);
  assert.equal(scheduleRules[0].classId,createdClassId);
  assert.equal(scheduleRules[0].timeZoneId,'Europe/Moscow');
  await page.locator('[data-new-schedule-rule]').click();
  await page.locator('#classScheduleRuleForm [name="scheduleDay"][value="1"]').check();
  await page.locator('#classScheduleRuleForm [name="startTime"]').fill('15:30');
  await page.locator('#classScheduleRuleForm button[type="submit"]').click();
  await page.locator('#notice').filter({hasText:'Конфликт'}).waitFor();
  assert.equal(scheduleWrites,1,'overlapping active slot rejected');
  page.once('dialog',d=>d.accept());
  await page.locator('[data-cancel-schedule-rule]').click();
  await page.locator('[data-edit-schedule-rule]').first().click();
  await page.locator('#classScheduleRuleForm [name="startTime"]').fill('16:00');
  await page.locator('#classScheduleRuleForm button[type="submit"]').click();
  await page.locator('.class-rule-row').getByText(/16:00/).waitFor();
  assert.equal(scheduleEdits,1);
  await page.reload();
  await page.locator('#loginForm [name="workspace"]').fill('synthetic');
  await page.locator('#loginForm [name="email"]').fill('teacher@example.invalid');
  await page.locator('#loginForm [name="password"]').fill('synthetic-password');
  await page.locator('#loginForm button[type="submit"]').click();
  await page.locator('[data-open-class="'+createdClassId+'"]').click();
  await page.locator('.class-detail-tabs [data-class-detail-tab="schedule"]').click();
  await page.locator('.class-rule-row').getByText(/16:00/).waitFor();
  page.once('dialog',d=>d.accept());
  await page.locator('[data-disable-schedule-rule]').first().click();
  await page.locator('.class-rule-row.is-disabled').waitFor();
  assert.equal(scheduleDisables,1);
  await page.locator('[data-edit-schedule-rule]').first().click();
  await page.locator('#classScheduleRuleForm [name="isActive"]').check();
  await page.locator('#classScheduleRuleForm button[type="submit"]').click();
  await page.locator('.class-rule-row:not(.is-disabled)').waitFor();
  assert.equal(scheduleEdits,2);
  await page.locator('[data-back-classes]').click();
  await page.locator('[data-open-class="'+createdGroupId+'"]').click();
  await page.locator('.class-detail-tabs [data-class-detail-tab="schedule"]').click();
  await page.locator('[data-new-schedule-rule]').click();
  await page.locator('#classScheduleRuleForm [name="scheduleDay"][value="1"]').check();
  await page.locator('#classScheduleRuleForm [name="startTime"]').fill('16:00');
  await page.locator('#classScheduleRuleForm button[type="submit"]').click();
  assert.equal(scheduleWrites,2,'group rules are distinct from individual class');
  assert.equal(scheduleRules[1].classKind,'group');
  await page.screenshot({path:output+'/15_class_schedule.png'});
  assert.equal(unexpectedWrites,0);
  // Day calendar: reads survive reload, with no writes merely by browsing.
  lessons.push({id:'calendar-saved',lessonAt:'2026-11-16T13:00:00Z',title:'Сохранённый урок календаря',
    participants:[{membershipId:students[0].membershipId,durationMinutes:60,attendanceStatus:'Unknown'}]});
  const beforeCalendar = JSON.stringify({lessons,scheduleRules});
  const writesBeforeCalendar = plannedLessonWrites;
  await page.reload();
  await page.locator('#loginForm [name="workspace"]').fill('synthetic');
  await page.locator('#loginForm [name="email"]').fill('teacher@example.invalid');
  await page.locator('#loginForm [name="password"]').fill('synthetic-password');
  await page.locator('#loginForm button[type="submit"]').click();
  await page.locator('[data-view="lessons"]').click();
  const chooseDay = async day => {
    await page.locator('#calendarDate').fill(day);
    await page.locator('#calendarDate').dispatchEvent('change');
  };
  await chooseDay('2026-11-16');
  await page.locator('[data-calendar-lesson="calendar-saved"]').waitFor();
  assert.equal(await page.locator('[data-calendar-rule]').count(),2);
  assert.match(await page.locator('[data-calendar-lesson="calendar-saved"]').innerText(),/16:00–17:00/);
  await page.locator('[data-calendar-shift="1"]').click();
  assert.equal(await page.locator('#calendarDate').inputValue(),'2026-11-17');
  assert.equal(await page.locator('[data-calendar-rule]').count(),0);
  await page.locator('[data-calendar-shift="-1"]').click();
  await page.locator('[data-calendar-today]').click();
  assert.equal(await page.locator('#calendarDate').inputValue(),calendarDay());
  await chooseDay('2030-01-01');
  await page.locator('[data-calendar-empty]').waitFor();
  await page.locator('[data-calendar-new]').click();
  assert.equal(await page.locator('#lessonPlannerForm [name="lessonDate"]').inputValue(),'2030-01-01');
  await page.locator('#lessonPlannerForm [data-cancel-lesson-plan]').click();
  await chooseDay('2026-11-16');
  const slot = page.locator('[data-calendar-rule]').first();
  const slotRuleId = await slot.getAttribute('data-calendar-rule');
  const slotRule = scheduleRules.find(r=>r.id === slotRuleId);
  await slot.locator('[data-plan-rule]').click();
  const slotPlan = page.locator('#lessonPlannerForm');
  assert.equal(await slotPlan.locator('[name="lessonDate"]').inputValue(),'2026-11-16');
  assert.equal(await slotPlan.locator('[name="lessonStart"]').inputValue(),'16:00');
  assert.equal(await slotPlan.locator('[name="lessonEnd"]').inputValue(),calendarTime(Date.parse('2026-11-16T13:00:00Z')+slotRule.durationMinutes*60000));
  await slotPlan.locator('[data-cancel-lesson-plan]').click();
  assert.equal(JSON.stringify({lessons,scheduleRules}),beforeCalendar,'calendar projections never mutate persisted records');
  assert.equal(plannedLessonWrites,writesBeforeCalendar);
  await page.locator('[data-calendar-rule]').first().locator('[data-plan-rule]').click();
  await page.locator('#lessonPlannerForm [name="title"]').fill('Из слота календаря');
  await page.locator('#lessonPlannerForm button[type="submit"]').click();
  await page.locator('[data-calendar-lesson]').filter({hasText:'Из слота календаря'}).waitFor();
  assert.equal(plannedLessonWrites,writesBeforeCalendar+1);
  assert.equal(plannedLessonRequests.at(-1).participants[0].durationMinutes,slotRule.durationMinutes);
  assert.equal(plannedLessonRequests.at(-1).lessonAt,'2026-11-16T13:00:00.000Z', 'planner preserves Moscow time despite Los Angeles device zone');
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:output+'/37_calendar_day.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'calendar fits mobile width');
  await page.screenshot({path:output+'/37_calendar_day_mobile.png'});
  assert.equal(unexpectedWrites,0);
  console.log('PASS: day calendar reload, navigation, separate lesson/rule states and timezone-safe planner');
  console.log('PASS: Meleto 15 recurring schedule (create/edit/disable, no phantom lessons)');
  console.log('PASS: Meleto 07/12/13 lesson planning and linked individual/group classes');
  console.log('PASS: group creation/edit/enrollment/archive/restore/invitation at Meleto 1348×926');
} finally {
  await browser.close();
}
