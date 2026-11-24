import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const origin = 'https://arthur200014-testing-hosting-8c4e.twc1.net';
const hosted = origin + '/board-pilot/cabinet/';
const published = 'https://arthur200014.github.io/testing-hosting/platform/';
const password = 'Synthetic-9!' + randomBytes(24).toString('hex');
const output = process.env.TAS_CLOSEOUT_CAPTURES;
const secret = [password];
let stage = 'published Pages, Timeweb assets and migrations';
let browser;

async function current(url, markers) {
  try {
    const response = await fetch(url, {signal:AbortSignal.timeout(15000), cache:'no-store'});
    const responseBody = await response.text();
    return response.ok && markers.every(marker => responseBody.includes(marker));
  } catch { return false; }
}

async function api(path, token, body, expected = body ? 201 : 200) {
  const response = await fetch(origin + '/api/v1/' + path, {
    method:body ? 'POST' : 'GET',
    headers:{...(token ? {Authorization:'Bearer ' + token} : {}), ...(body ? {'Content-Type':'application/json'} : {})},
    body:body ? JSON.stringify(body) : undefined,
    signal:AbortSignal.timeout(20000)
  });
  assert.equal(response.status, expected, path.replace(/[a-f0-9-]{36}/g,'[id]'));
  const data = await response.text();
  return data ? JSON.parse(data) : null;
}

async function pupilSession(page, workspace, code) {
  await page.goto(published + 'student.html', {waitUntil:'domcontentloaded'});
  await page.waitForURL(hosted + 'student.html',{waitUntil:'domcontentloaded'});
  const form = page.locator('#loginForm');
  await form.getByLabel('Пространство преподавателя').fill(workspace);
  await form.getByLabel('Код ученика').fill(code);
  await form.getByRole('button',{name:'Войти',exact:true}).click();
  await page.locator('#dashboard:not([hidden])').waitFor();
}

async function capture(page, file) {
  if (output) await page.screenshot({path:output + '/' + file});
}

try {
  if (output) await mkdir(output,{recursive:true});
  let live = false;
  const teacherMarkers = ['id="classAnnouncementsDialog"', 'id="classRepresentativesDialog"'];
  const studentMarkers = ['id="studentAnnouncements"', 'id="representativeCabinet"'];
  for (let attempt=0; attempt<60; attempt++) {
    const checks = await Promise.all([
      current(published + 'teacher.html', teacherMarkers),
      current(published + 'student.html', studentMarkers),
      current(hosted + 'teacher.html', teacherMarkers),
      current(hosted + 'student.html', studentMarkers),
      current(origin + '/health/migrations', [])
    ]);
    if (checks.every(Boolean)) { live = true; break; }
    await new Promise(resolve => setTimeout(resolve,8000));
  }
  assert.ok(live, 'The final Pages assets, Timeweb assets and migrations did not become healthy within the deployment window');
  console.log('PASS: current GitHub Pages and Timeweb cabinet assets and migration health');

  stage = 'synthetic teacher and class';
  browser = await chromium.launch();
  const context = await browser.newContext({viewport:{width:1348,height:926},locale:'ru-RU'});
  const teacher = await context.newPage();
  await teacher.goto(published+'teacher.html',{waitUntil:'domcontentloaded'});
  await teacher.waitForURL(hosted+'teacher.html',{waitUntil:'domcontentloaded'});
  await teacher.getByRole('button',{name:'Зарегистрироваться',exact:true}).click();
  const signup = teacher.locator('#registerForm');
  await signup.locator('[name=email]').fill('tas-closeout-' + randomUUID() + '@example.invalid');
  await signup.locator('[name=password]').fill(password);
  await signup.locator('[name=confirmPassword]').fill(password);
  const sessionResponse = teacher.waitForResponse(response =>
    response.url() === origin+'/api/v1/teacher-sessions' && response.request().method() === 'POST');
  await signup.locator('[type=submit]').click();
  const response = await sessionResponse;
  assert.equal(response.status(),200);
  const {workspace,accessToken} = await response.json();
  secret.push(accessToken);
  const [program] = await api('teacher/programs',accessToken);
  const pupil = await api('teacher/students',accessToken,{
    requestId:randomUUID(),programId:program.id,studentName:'Synthetic transition pupil'
  });
  const outsider = await api('teacher/students',accessToken,{
    requestId:randomUUID(),programId:program.id,studentName:'Synthetic transition outsider'
  });
  secret.push(pupil.inviteCode,outsider.inviteCode);
  const classroom = await api('teacher/classes',accessToken,{
    requestId:randomUUID(),studentMembershipId:pupil.membershipId,title:'Synthetic transition class',durationMinutes:60
  });
  await teacher.locator('#app:not([hidden])').waitFor();
  await teacher.locator('#refresh').click();
  const openClass = teacher.locator('[data-open-class="'+classroom.id+'"]');
  await openClass.press('Enter');
  await teacher.locator('.class-detail-tabs [data-class-detail-tab="information"]').click();
  assert.equal(await teacher.getByText(/Настройка чатов|Оплата и чаты пока не подключены/).count(),0);

  stage = 'publication and withdrawal of a live class announcement';
  const openAnnouncements = teacher.locator('[data-class-announcements]');
  await openAnnouncements.press('Enter');
  const announcements = teacher.locator('#classAnnouncementsDialog');
  await announcements.getByText('Объявлений пока нет.',{exact:true}).waitFor();
  await announcements.getByLabel('Заголовок').fill('Synthetic announcement');
  await announcements.getByLabel('Текст').fill('Synthetic classroom message');
  await capture(teacher,'72_class_announcement.png');
  await announcements.getByRole('button',{name:'Опубликовать'}).press('Enter');
  await announcements.getByText('Объявление опубликовано.',{exact:true}).waitFor();
  await announcements.getByRole('button',{name:'Закрыть',exact:true}).press('Enter');
  await openAnnouncements.press('Enter');
  await announcements.getByText('Synthetic classroom message',{exact:true}).waitFor();
  const learnerContext = await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU'});
  const learner = await learnerContext.newPage();
  await pupilSession(learner,workspace,pupil.inviteCode);
  await learner.locator('#studentAnnouncements summary').press('Enter');
  await learner.getByText('Synthetic classroom message',{exact:true}).waitFor();
  const outsiderSession = await api('student-sessions',null,{workspace,code:outsider.inviteCode},200);
  secret.push(outsiderSession.accessToken);
  assert.deepEqual(await api('class-announcements',outsiderSession.accessToken),[]);
  await Promise.all([teacher.waitForEvent('dialog').then(dialog => dialog.accept()),
    announcements.getByRole('button',{name:'Снять с публикации'}).click()]);
  await announcements.getByText('Объявление снято с публикации.',{exact:true}).waitFor();
  await announcements.getByRole('button',{name:'Закрыть',exact:true}).press('Enter');
  await learner.locator('#refreshStudent').press('Enter');
  await learner.getByText('Объявлений пока нет.',{exact:true}).waitFor();
  console.log('PASS: persisted announcement, authorized pupil visibility, outsider isolation, withdrawal and live mobile refresh');

  stage = 'one-time representative entry and withdrawal';
  await teacher.locator('[data-class-representatives]').press('Enter');
  const representatives = teacher.locator('#classRepresentativesDialog');
  await representatives.getByLabel('Имя представителя').fill('Synthetic representative');
  await capture(teacher,'22_representative_invitation.png');
  await representatives.getByRole('button',{name:'Создать ссылку'}).press('Enter');
  await representatives.getByText('Ссылка создана.',{exact:true}).waitFor();
  const link = await representatives.locator('#representativeLinkValue').inputValue();
  const code = new URL(link).hash.replace(/^#representative=/,'');
  secret.push(code);
  assert.match(code,/^[a-f0-9]{64}$/);
  const representativeContext = await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU'});
  const guest = await representativeContext.newPage();
  await guest.goto(link,{waitUntil:'domcontentloaded'});
  await guest.getByRole('button',{name:'Открыть доступ'}).press('Enter');
  const cabinet = guest.locator('#representativeCabinet');
  await cabinet.getByText('Synthetic transition pupil',{exact:true}).waitFor();
  await guest.reload({waitUntil:'domcontentloaded'});
  await cabinet.getByText('Synthetic transition pupil',{exact:true}).waitFor();
  assert.equal(new URL(guest.url()).hash,'');
  await api('representative/accept',null,{code,sessionKey:randomBytes(32).toString('hex')},404);
  await Promise.all([teacher.waitForEvent('dialog').then(dialog=>dialog.accept()),
    representatives.getByRole('button',{name:'Закрыть доступ',exact:true}).click()]);
  await representatives.getByText('Доступ закрыт.',{exact:true}).waitFor();
  await guest.getByRole('button',{name:'Обновить данные'}).press('Enter');
  await guest.getByText('Доступ закрыт или срок истёк.',{exact:true}).waitFor();
  assert.equal(await cabinet.isVisible(),false);
  console.log('PASS: role-specific representative link, same-tab restoration, replay denial and immediate revocation on refresh');
} catch (error) {
  let message = String(error.message);
  for (const value of secret.filter(Boolean)) message = message.replaceAll(value,'[redacted]');
  console.error('FAIL at ' + stage + ': ' + message.replace(/\b[a-fA-F0-9]{64}\b/g,'[redacted]'));
  process.exitCode = 1;
} finally {
  await browser?.close();
}
