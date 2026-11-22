import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {chromium} from 'playwright';

// Public application acceptance. Creates only fresh synthetic workspaces.
const origin = 'https://arthur200014-testing-hosting-8c4e.twc1.net';
const published = 'https://arthur200014.github.io/testing-hosting/platform/';
const hosted = origin + '/board-pilot/cabinet/';
const boardPath = '/board-pilot/api/v1/teacher/board-prototype/boards';
const password = 'Synthetic-9!' + randomBytes(24).toString('hex');
const run = randomUUID();

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
    deployed = response.ok && (await response.text()).includes("location.pathname === '/testing-hosting/platform/teacher.html'");
  } catch {}
  if (deployed) break;
  await new Promise(resolve => setTimeout(resolve, 10000));
}
assert.ok(deployed, 'Hosted all-teacher cabinet image must be published');
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
    await page.locator('#app:not([hidden])').waitFor();
    return {page,context,email,session};
  }
  async function createBoard(account, title) {
    const page = account.page;
    await page.getByRole('button', {name:'Доски',exact:true}).click();
    await page.getByRole('button', {name:'Новая доска',exact:true}).click();
    const dialog = page.getByRole('dialog', {name:'Новая доска',exact:true});
    await dialog.getByLabel('Название').fill(title);
    await dialog.getByRole('button', {name:'Сохранить',exact:true}).click();
    const launch = page.locator('[data-board-cards] article').filter({hasText:title}).locator('[data-open-independent-board]');
    await launch.waitFor();
    return {id:await launch.getAttribute('data-open-independent-board'),title};
  }
  async function openBoard(account, board) {
    await account.page.getByRole('button', {name:'Доски',exact:true}).click();
    await account.page.locator('[data-open-independent-board="' + board.id + '"]').click();
    await account.page.frameLocator('dialog iframe').locator('#status').filter({hasText:/^Сохранено$/}).waitFor();
    return account.page.frame({url:origin + '/board-pilot/board/'});
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
  const board = await createBoard(first, 'Synthetic live board ' + run);
  await createBoard(second, 'Synthetic separate board ' + run);
  await api(boardPath + '/' + board.id + '/permit', second.session.accessToken, 'POST', undefined, 404);
  await api(boardPath + '/' + board.id, second.session.accessToken, 'PUT', {title:'Foreign overwrite'}, 404);
  const foreignCatalog = await api(boardPath, second.session.accessToken);
  assert.equal(foreignCatalog.some(x => x.id === board.id), false);
  const frame = await openBoard(first, board);
  await draw(first.page, frame);
  await count(frame, 1);

  const [program] = await api('/api/v1/teacher/programs', first.session.accessToken);
  const pupil = await api('/api/v1/teacher/students', first.session.accessToken, 'POST',
    {requestId:randomUUID(),programId:program.id,studentName:'Synthetic live board pupil'}, 201);
  await api(boardPath + '/' + board.id + '/members/' + pupil.membershipId,
    first.session.accessToken, 'PUT', {role:'editor'}, 204);
  const pupilContext = await browser.newContext({viewport:{width:1348,height:926}});
  const pupilPage = await pupilContext.newPage();
  pupilPage.setDefaultTimeout(30000);
  await pupilPage.goto(published + 'student.html#board=' + board.id);
  await pupilPage.waitForURL(hosted + 'student.html#board=' + board.id);
  await pupilPage.locator('#loginForm [name="workspace"]').fill(first.session.workspace);
  await pupilPage.locator('#loginForm [name="code"]').fill(pupil.inviteCode);
  await pupilPage.locator('#loginForm button[type="submit"]').click();
  await pupilPage.frameLocator('dialog iframe').locator('#status').filter({hasText:/^Сохранено$/}).waitFor();
  const pupilFrame = pupilPage.frame({url:origin + '/board-pilot/board/'});
  await count(pupilFrame, 1);
  await draw(pupilPage, pupilFrame, 150);
  await count(pupilFrame, 2);
  await count(frame, 2);
  await first.page.getByRole('button', {name:'Назад к доскам',exact:true}).click();
  await first.page.reload();
  await first.page.locator('#loginForm [name="email"]').fill(first.email);
  await first.page.locator('#loginForm [name="password"]').fill(password);
  await first.page.locator('#loginForm button[type="submit"]').click();
  await first.page.locator('#app:not([hidden])').waitFor();
  const reopened = await openBoard(first, board);
  await count(reopened, 2);
  console.log('PASS: published entry, two new teachers, independent boards, cross-workspace denial, teacher/pupil drawing sync and fresh-login persistence on Timeweb');
} finally {
  await browser.close();
}
