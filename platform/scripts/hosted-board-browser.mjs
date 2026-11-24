import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {chromium} from 'playwright';

// Public application acceptance. Creates only fresh synthetic workspaces.
const origin = 'https://arthur200014-testing-hosting-8c4e.twc1.net';
const published = 'https://arthur200014.github.io/testing-hosting/platform/';
const hosted = origin + '/board-pilot/cabinet/';
const password = 'Synthetic-9!' + randomBytes(24).toString('hex');
const run = randomUUID();
const secretValues = [password];

async function api(path, token, method = 'GET', body, status = 200) {
  const response = await fetch(origin + path, {
    method, headers:{...(token ? {Authorization:'Bearer ' + token} : {}),
      ...(body ? {'Content-Type':'application/json'} : {})},
    body:body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(20000)
  });
  assert.equal(response.status, status, method + ' ' + path.replace(/[0-9a-f-]{36}/g, '[id]'));
  return status === 204 || status === 404 ? null : response.json();
}

// Wait for the new hosted image before creating any fixtures.
let deployed = false;
for (let attempt = 0; attempt < 48; attempt++) {
  try {
    const response = await fetch(hosted + 'teacher.html', {signal:AbortSignal.timeout(15000), cache:'no-store'});
    const html = await response.text();
    deployed = response.ok && html.includes('aria-label="Доски классов"') && html.includes('id="sessionStartup"');
  } catch {}
  if (deployed) break;
  await new Promise(resolve => setTimeout(resolve, 10000));
}
assert.ok(deployed, 'Waiting for Timeweb deployment: hosted cabinet did not serve the class-only board version');
const browser = await chromium.launch({headless:true});
try {
  async function signup(side) {
    const context = await browser.newContext({viewport:{width:1348,height:926}, locale:'ru-RU'});
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const email = 'tas-board-' + run + '-' + side + '@example.invalid';
    await page.goto(published + 'teacher.html');
    await page.waitForURL(hosted + 'teacher.html');
    await page.getByRole('button', {name:'Зарегистрироваться', exact:true}).click();
    await page.locator('#registerForm [name="email"]').fill(email);
    await page.locator('#registerForm [name="password"]').fill(password);
    await page.locator('#registerForm [name="confirmPassword"]').fill(password);
    const sessionResponse = page.waitForResponse(r => r.url().endsWith('/api/v1/teacher-sessions') && r.request().method() === 'POST');
    await page.locator('#registerForm button[type="submit"]').click();
    const response = await sessionResponse;
    assert.equal(response.status(), 200);
    const session = await response.json();
    secretValues.push(session.accessToken);
    await page.locator('#app:not([hidden])').waitFor();
    return {page,context,email,session};
  }
  async function watchSignInFlash(page, loginId) {
    await page.addInitScript(id => {
      window.loginWasVisible = false;
      const check = () => {
        const login = document.getElementById(id);
        if (login && !login.hidden && login.getClientRects().length) window.loginWasVisible = true;
      };
      const observer = new MutationObserver(check);
      observer.observe(document, {subtree:true, childList:true, attributes:true, attributeFilter:['hidden']});
      document.addEventListener('DOMContentLoaded', check, {once:true});
    }, loginId);
  }
  async function count(frame, expected) {
    await frame.waitForFunction(n => window.__BOARD_EDITOR?.getSceneElements().filter(x => !x.isDeleted).length === n, expected);
    await frame.locator('#status').filter({hasText:/^Сохранено$/}).waitFor();
  }
  async function draw(page, frame, offset = 0) {
    await frame.getByTitle(/Rectangle/).first().click();
    const bounds = await page.locator('dialog iframe').boundingBox();
    await page.mouse.move(bounds.x + 310 + offset, bounds.y + 225);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 405 + offset, bounds.y + 290, {steps:5});
    await page.mouse.up();
  }
  const first = await signup('first');
  const second = await signup('second');
  assert.notEqual(first.session.workspaceId, second.session.workspaceId);
  const [program] = await api('/api/v1/teacher/programs', first.session.accessToken);
  const pupil = await api('/api/v1/teacher/students', first.session.accessToken, 'POST',
    {requestId:randomUUID(),programId:program.id,studentName:'Synthetic live board pupil'}, 201);
  secretValues.push(pupil.inviteCode);
  const classroom = await api('/api/v1/teacher/classes', first.session.accessToken, 'POST',
    {requestId:randomUUID(),studentMembershipId:pupil.membershipId,title:'Synthetic permanent class ' + run.slice(0, 8),durationMinutes:60}, 201);
  const lessons = [];
  for (let day = 1; day <= 2; day++) lessons.push(await api('/api/v1/teacher/lessons', first.session.accessToken, 'POST', {
    requestId:randomUUID(),title:'Synthetic class lesson ' + day,lessonAt:`2030-01-0${day}T10:00:00Z`,individualClassId:classroom.id,
    participants:[{membershipId:pupil.membershipId,durationMinutes:60,attendanceStatus:'Unknown'}]
  }, 201));
  await api('/board-pilot/api/v1/teacher/board-prototype/classes/individual/' + classroom.id + '/permit', second.session.accessToken, 'POST', undefined, 404);
  // The fixtures were created through the API after the cabinet loaded its class list.
  await first.page.locator('#refresh').click();
  await first.page.locator('[data-open-class="' + classroom.id + '"]').waitFor();
  await first.page.getByRole('button', {name:'Доски',exact:true}).click();
  const catalog = first.page.locator('[data-board-cards]');
  const teacherBoard = '[data-open-class-board="' + classroom.id + '"]';
  await catalog.locator(teacherBoard).waitFor();
  assert.equal(await catalog.locator('article').count(), 1);
  assert.equal(await first.page.getByText('Доски прежних занятий', {exact:true}).count(), 0);
  assert.equal(await first.page.getByRole('button', {name:'Новая доска',exact:true}).count(), 0);
  await first.page.getByRole('button', {name:'Мои классы',exact:true}).click();
  await first.page.locator('[data-open-class="' + classroom.id + '"]').click();
  await first.page.locator('.class-detail-tabs [data-class-detail-tab="schedule"]').click();
  for (const lesson of lessons) {
    await first.page.locator('[data-open-class-lesson="' + lesson.lessonId + '"]').click();
    const detail = first.page.locator('.class-lesson-detail');
    await detail.locator('h1').waitFor();
    assert.equal(await detail.getByRole('button', {name:/доск/i}).count(), 0);
    await first.page.locator('[data-back-class-lessons]').click();
  }
  await first.page.locator('.class-detail-banner').locator(teacherBoard).click();
  await first.page.frameLocator('dialog iframe').locator('#status').filter({hasText:/^Сохранено$/}).waitFor();
  const classFrame = first.page.frame({url:origin + '/board-pilot/board/'});
  await draw(first.page, classFrame);
  await count(classFrame, 1);

  const pupilContext = await browser.newContext({viewport:{width:1348,height:926}});
  const pupilPage = await pupilContext.newPage();
  pupilPage.setDefaultTimeout(30000);
  await pupilPage.goto(published + 'student.html');
  await pupilPage.waitForURL(hosted + 'student.html');
  await pupilPage.locator('#loginForm [name="workspace"]').fill(first.session.workspace);
  await pupilPage.locator('#loginForm [name="code"]').fill(pupil.inviteCode);
  await pupilPage.locator('#loginForm button[type="submit"]').click();
  const pupilBoards = pupilPage.locator('#studentBoardList');
  const pupilBoard = pupilBoards.locator('[data-open-class-board="individual/' + classroom.id + '"]');
  await pupilBoard.waitFor();
  assert.equal(await pupilBoards.getByRole('button').count(), 1);
  await pupilBoard.click();
  await pupilPage.frameLocator('dialog iframe').locator('#status').filter({hasText:/^Сохранено$/}).waitFor();
  const pupilClassFrame = pupilPage.frame({url:origin + '/board-pilot/board/'});
  await count(pupilClassFrame, 1);
  await draw(pupilPage, pupilClassFrame, 150);
  await count(pupilClassFrame, 2);
  await count(classFrame, 2);
  await first.page.getByRole('button', {name:'Назад к классу',exact:true}).click();
  await first.page.getByRole('button', {name:'Доски',exact:true}).click();
  await catalog.locator(teacherBoard).click();
  await first.page.frameLocator('dialog iframe').locator('#status').filter({hasText:/^Сохранено$/}).waitFor();
  await count(first.page.frame({url:origin + '/board-pilot/board/'}), 2);
  await watchSignInFlash(first.page, 'loginScreen');
  await watchSignInFlash(pupilPage, 'login');
  await first.page.reload();
  await first.page.frameLocator('dialog iframe').locator('#status').filter({hasText:/^Сохранено$/}).waitFor();
  assert.equal(await first.page.locator('#loginForm').isVisible(), false);
  assert.equal(await first.page.evaluate(() => window.loginWasVisible), false);
  assert.equal(await first.page.locator('[data-view="boards"]').getAttribute('aria-current'), 'page');
  await count(first.page.frame({url:origin + '/board-pilot/board/'}), 2);
  await pupilPage.reload();
  await pupilPage.frameLocator('dialog iframe').locator('#status').filter({hasText:/^Сохранено$/}).waitFor();
  assert.equal(await pupilPage.locator('#loginForm').isVisible(), false);
  assert.equal(await pupilPage.evaluate(() => window.loginWasVisible), false);
  await count(pupilPage.frame({url:origin + '/board-pilot/board/'}), 2);
  const storage = await first.context.storageState();
  assert.ok(storage.cookies.some(cookie => cookie.httpOnly && cookie.name === 'tas_teacher_session'));
  await first.context.close();
  const restarted = await browser.newContext({storageState:storage,viewport:{width:1348,height:926}});
  const restartedPage = await restarted.newPage();
  await restartedPage.goto(published + 'teacher.html#class-board=individual/' + classroom.id);
  await restartedPage.frameLocator('dialog iframe').locator('#status').filter({hasText:/^Сохранено$/}).waitFor();
  await count(restartedPage.frame({url:origin + '/board-pilot/board/'}), 2);
  await second.page.locator('#logout').click();
  await second.page.locator('#loginScreen:not([hidden])').waitFor();
  await second.page.reload();
  await second.page.locator('#loginForm button[type="submit"]:enabled').waitFor();
  assert.equal(await second.page.locator('#app').isVisible(), false);
  console.log('PASS: persistent teacher/pupil login without sign-in flash, same teacher section, class-only cabinet and catalog, joint drawings, reload and new browser context, logout and tenant isolation on Timeweb');
} catch (error) {
  let message = String(error.message);
  for (const secret of secretValues.filter(Boolean)) message = message.replaceAll(secret, '[redacted]');
  console.error('FAIL: ' + message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
