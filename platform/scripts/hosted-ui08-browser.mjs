import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const origin = 'https://arthur200014-testing-hosting-8c4e.twc1.net';
const landing = 'https://arthur200014.github.io/testing-hosting/platform/';
const cabinet = origin + '/board-pilot/cabinet/';
const run = randomUUID().slice(0,12);
const password = 'Synthetic-9!' + randomBytes(24).toString('hex');
const secrets = [password];
const captures = process.env.TAS_PUBLIC_CAPTURES;
const browser = await chromium.launch({headless:true});
let stage = 'public landing';

async function api(path, token, body) {
  const response = await fetch(origin + '/api/v1/' + path, {
    method:body ? 'POST' : 'GET', headers:{Authorization:'Bearer ' + token,
      ...(body ? {'Content-Type':'application/json'} : {})},
    body:body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(20000)
  });
  assert.equal(response.status,body ? 201 : 200,path);
  return response.json();
}
async function context(width, storageState) {
  return browser.newContext({
    viewport:{width,height:width >= 1000 ? 926 : 844},
    locale:'ru-RU', isMobile:width < 1000, hasTouch:width < 1000,
    ...(storageState ? {storageState} : {})
  });
}
async function fit(page, width, name) {
  const sizes = await page.evaluate(() => ({
    viewport:document.documentElement.clientWidth,
    scroll:document.documentElement.scrollWidth
  }));
  assert.ok(sizes.viewport <= width && sizes.scroll <= width + 1, name + ' fits the viewport: ' + JSON.stringify(sizes));
}
async function focusIs(page, id) {
  await page.waitForFunction(target => document.activeElement.id === target,id);
}
async function publicPage(page, width) {
  await page.goto(landing);
  await page.getByRole('heading',{name:/Занятия и задания/}).waitFor();
  await fit(page,width,'Public landing');
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => document.activeElement.getAttribute('href') === '#main');
  await page.keyboard.press('Enter');
  await focusIs(page,'main');
  if (captures) {
    await mkdir(captures,{recursive:true});
    await page.screenshot({path:captures + '/public-' + width + '.png',fullPage:true});
  }
}
async function enterFromLanding(page, role) {
  const link = page.getByRole('link',{name:role === 'teacher' ? 'Войти преподавателю' : 'Войти ученику',exact:true});
  const navigations = [];
  const recordLocation = frame => {
    if (frame === page.mainFrame()) {
      const url = new URL(frame.url());
      navigations.push(url.origin + url.pathname);
    }
  };
  page.on('framenavigated',recordLocation);
  try {
    await link.press('Enter');
    await page.waitForURL(url => url.origin + url.pathname === cabinet + role + '.html',{waitUntil:'domcontentloaded'});
  } catch (error) {
    const url = new URL(page.url());
    throw new Error('Opening ' + role + ' via the landing link ended at ' + url.origin + url.pathname +
      '. Navigation history: ' + JSON.stringify(navigations) + '. ' + error.message);
  } finally {
    page.off('framenavigated',recordLocation);
  }
}

try {
  const narrowContext = await context(320);
  const narrow = await narrowContext.newPage();
  narrow.setDefaultTimeout(25000);
  await publicPage(narrow,320);
  stage = '320px teacher entry and return';
  await enterFromLanding(narrow,'teacher');
  await narrow.getByRole('button',{name:'Войти',exact:true}).waitFor();
  await fit(narrow,320,'Teacher sign-in');
  await narrow.getByRole('link',{name:'О платформе',exact:true}).press('Enter');
  await narrow.waitForURL(landing,{waitUntil:'domcontentloaded'});
  stage = '320px pupil entry';
  await enterFromLanding(narrow,'student');
  await narrow.locator('#loginForm [name=code]').waitFor();
  await fit(narrow,320,'Pupil sign-in');
  await narrowContext.close();
  console.log('PASS: public landing and both sign-in pages fit at 320px, keyboard skip link and role navigation work');

  stage = 'desktop teacher navigation and class fixture';
  const desktopContext = await context(1348);
  const teacher = await desktopContext.newPage();
  teacher.setDefaultTimeout(25000);
  await publicPage(teacher,1348);
  await enterFromLanding(teacher,'teacher');
  await teacher.getByRole('button',{name:'Зарегистрироваться',exact:true}).press('Enter');
  const signup = teacher.locator('#registerForm');
  for (const [name,value] of Object.entries({email:'tas-ui08-' + run + '@example.invalid',password,confirmPassword:password}))
    await signup.locator('[name="' + name + '"]').fill(value);
  const signedIn = teacher.waitForResponse(r => r.url() === origin + '/api/v1/teacher-sessions' && r.request().method() === 'POST');
  await signup.locator('button[type=submit]').press('Enter');
  const response = await signedIn;
  assert.equal(response.status(),200);
  const session = await response.json();
  secrets.push(session.accessToken);
  await teacher.locator('#app:not([hidden])').waitFor();
  await focusIs(teacher,'teacherMain');
  const [program] = await api('teacher/programs',session.accessToken);
  const pupil = await api('teacher/students',session.accessToken,
    {requestId:randomUUID(),programId:program.id,studentName:'Synthetic UI-08 pupil'});
  secrets.push(pupil.inviteCode);
  const classroom = await api('teacher/classes',session.accessToken,
    {requestId:randomUUID(),studentMembershipId:pupil.membershipId,title:'Synthetic UI-08 class',durationMinutes:60});
  await teacher.locator('#refresh').click();
  await teacher.locator('#refresh:enabled').waitFor();
  const classCard = teacher.locator('[data-open-class="' + classroom.id + '"]');
  await classCard.press('Enter');
  const back = teacher.locator('[data-back-classes]').first();
  assert.ok(await back.evaluate(node => node === document.activeElement),'Focus moves to the class back action');
  await back.press('Enter');
  assert.ok(await classCard.evaluate(node => node === document.activeElement),'Focus returns to the class card');
  await fit(teacher,1348,'Teacher cabinet');
  const teacherState = await desktopContext.storageState();
  await desktopContext.close();
  console.log('PASS: desktop teacher registration, session and class open/back keyboard focus at 1348px');

  stage = 'mobile teacher menu, access and logout';
  const phoneContext = await context(390,teacherState);
  const phone = await phoneContext.newPage();
  phone.setDefaultTimeout(25000);
  await phone.goto(landing);
  await enterFromLanding(phone,'teacher');
  await phone.locator('#app:not([hidden])').waitFor();
  assert.equal(await phone.locator('#loginForm').isVisible(),false);
  const menu = phone.locator('#teacherNavToggle');
  const navigation = phone.locator('#teacherNav');
  await navigation.waitFor({state:'hidden'});
  await menu.press('Enter');
  await phone.getByRole('navigation',{name:'Разделы кабинета'}).waitFor();
  assert.equal(await menu.getAttribute('aria-expanded'),'true');
  await navigation.locator('[aria-current="page"]').focus();
  await phone.keyboard.press('Escape');
  assert.equal(await menu.getAttribute('aria-expanded'),'false');
  await focusIs(phone,'teacherNavToggle');
  for (const [section,title] of [
    ['lessons','Календарь'],['students','Ученики'],['boards','Доски'],['homework','Задания'],
    ['library','Библиотека'],['results','Результаты'],['invoices','Оплата'],['report','Отчёт ученика'],['overview','Мои классы']
  ]) {
    stage = 'mobile teacher section ' + section;
    await menu.press('Enter');
    const trigger = navigation.locator('[data-view="' + section + '"]');
    await trigger.press('Enter');
    await phone.locator('#viewTitle').filter({hasText:title}).waitFor();
    await phone.locator('#refresh:enabled').waitFor();
    assert.equal(await trigger.getAttribute('aria-current'),'page');
    await navigation.waitFor({state:'hidden'});
    await focusIs(phone,'teacherMain');
    await fit(phone,390,'Teacher section ' + section);
    assert.equal(await phone.getByText('Не удалось загрузить раздел',{exact:true}).count(),0);
  }
  await phone.locator('#logout').press('Enter');
  await phone.locator('#loginForm').waitFor();
  assert.ok(await phone.locator('#loginForm [name=email]').evaluate(node => node === document.activeElement));
  await phone.getByRole('link',{name:'О платформе',exact:true}).press('Enter');
  await phone.waitForURL(landing);
  await phoneContext.close();
  console.log('PASS: nine live teacher sections at 390px, keyboard menu, current section, Escape/focus return, logout and landing return');

  stage = 'mobile pupil sign-in, class board and return';
  const pupilContext = await context(390);
  const student = await pupilContext.newPage();
  student.setDefaultTimeout(25000);
  await publicPage(student,390);
  await enterFromLanding(student,'student');
  const form = student.locator('#loginForm');
  await form.locator('[name=workspace]').fill(session.workspace);
  await form.locator('[name=code]').fill(pupil.inviteCode);
  await form.locator('button[type=submit]').press('Enter');
  await student.locator('#dashboard:not([hidden])').waitFor();
  await focusIs(student,'dashboard');
  const open = student.locator('[data-open-class-board="individual/' + classroom.id + '"]');
  await open.waitFor();
  await fit(student,390,'Pupil cabinet');
  await open.press('Enter');
  const dialog = student.getByRole('dialog',{name:'Доска класса'});
  await dialog.frameLocator('iframe').locator('#status').filter({hasText:/^Сохранено$/}).waitFor();
  const returnButton = dialog.getByRole('button',{name:'Назад к классу',exact:true});
  assert.ok(await returnButton.evaluate(node => node === document.activeElement),'Board focuses its return action');
  await student.keyboard.press('Alt+Shift+ArrowUp');
  await dialog.waitFor({state:'detached'});
  assert.ok(await open.evaluate(node => node === document.activeElement),'Board returns focus to its launcher');
  await student.locator('#logout').press('Enter');
  await form.waitFor();
  assert.ok(await form.locator('[name=workspace]').evaluate(node => node === document.activeElement));
  await student.getByRole('link',{name:'О платформе',exact:true}).press('Enter');
  await student.waitForURL(landing);
  await pupilContext.close();
  console.log('PASS: 390px pupil sign-in, class board keyboard open and close, focus restoration, logout and landing return');
} catch (error) {
  let message = String(error.message);
  for (const secret of secrets.filter(Boolean)) message = message.replaceAll(secret,'[redacted]');
  console.error('FAIL at ' + stage + ': ' + message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
