import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {chromium} from 'playwright';

const origin = 'https://arthur200014-testing-hosting-8c4e.twc1.net';
const entry = 'https://arthur200014.github.io/testing-hosting/platform/teacher.html';
const hosted = origin + '/board-pilot/cabinet/teacher.html';
const run = randomUUID().slice(0, 12);
const ownerEmail = 'tas-ui07-' + run + '-owner@example.invalid';
const colleagueEmail = 'tas-ui07-' + run + '-teacher@example.invalid';
const password = 'Synthetic-9!' + randomBytes(24).toString('hex');
const secrets = [password];
const invoicePath = 'teacher/tuition-invoices';
const accessPath = 'teacher/workspace-access';
const settingsPath = 'teacher/profile/settings';
const browser = await chromium.launch({headless:true});
let stage = 'startup';

async function call(path, token, {method = 'GET', body, status = 200} = {}) {
  const response = await fetch(origin + '/api/v1/' + path, {
    method, headers:{...(token ? {Authorization:'Bearer ' + token} : {}),
      ...(body ? {'Content-Type':'application/json'} : {})},
    body:body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(20000)
  });
  assert.equal(response.status, status, method + ' ' + path.replace(/[0-9a-f-]{36}/g, '[id]'));
  return status === 200 || status === 201 ? response.json() : null;
}
function apiResponse(page, path, method) {
  return page.waitForResponse(r => r.url() === origin + '/api/v1/' + path && r.request().method() === method);
}
async function submit(page, form, path, method, status) {
  const pending = apiResponse(page, path, method);
  await form.locator('button[type="submit"]').click();
  const response = await pending;
  assert.equal(response.status(), status, method + ' ' + path.replace(/[0-9a-f-]{36}/g, '[id]'));
  return response;
}
async function newPage() {
  const context = await browser.newContext({viewport:{width:1348,height:926},locale:'ru-RU'});
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  await page.goto(entry);
  await page.waitForURL(hosted);
  return page;
}
async function openSession(page, form) {
  const response = await submit(page, form, 'teacher-sessions', 'POST', 200);
  const session = await response.json();
  assert.ok(session.accessToken && session.workspaceId && session.workspace, 'A workspace session was issued');
  secrets.push(session.accessToken);
  await page.locator('#app:not([hidden])').waitFor();
  return session;
}
async function login(page, email) {
  const form = page.locator('#loginForm');
  await form.locator('[name=email]').fill(email);
  await form.locator('[name=password]').fill(password);
  return openSession(page, form);
}
async function settled(page) {
  await page.locator('#refresh:enabled').waitFor();
}

try {
  stage = 'public signup and synthetic pupil';
  await call('teacher/tuition-invoices', null, {status:401});
  const owner = await newPage();
  await owner.getByRole('button',{name:'Зарегистрироваться',exact:true}).click();
  const register = owner.locator('#registerForm');
  for (const [field, value] of Object.entries({email:ownerEmail,password,confirmPassword:password}))
    await register.locator('[name="' + field + '"]').fill(value);
  let ownerSession = await openSession(owner, register);
  assert.equal(ownerSession.workspaceRole, 'owner');
  const [program] = await call('teacher/programs', ownerSession.accessToken);
  assert.ok(program?.id, 'The new workspace has an active program');
  const pupil = await call('teacher/students', ownerSession.accessToken, {method:'POST',status:201,
    body:{requestId:randomUUID(),programId:program.id,studentName:'Synthetic UI-07 pupil'}});
  secrets.push(pupil.inviteCode);
  await owner.locator('#refresh').click();
  await settled(owner);

  stage = 'profile and reminder writes';
  const displayName = 'Synthetic UI-07 owner';
  await owner.locator('#openTeacherProfile').click();
  const profile = owner.locator('#teacherProfileForm');
  await profile.locator('[name=displayName]').fill(displayName);
  await submit(owner, profile, 'teacher/profile', 'PATCH', 200);
  await settled(owner);
  const reminders = owner.locator('#teacherRemindersForm');
  const reminder = reminders.locator('[name=overdueInvoiceReminders]');
  const remind = !await reminder.isChecked();
  await reminder.setChecked(remind);
  await submit(owner, reminders, settingsPath + '/reminders', 'PATCH', 204);
  await settled(owner);
  assert.equal((await call(settingsPath,ownerSession.accessToken)).overdueInvoiceReminders,remind);

  stage = 'synthetic invoice and manual partial receipt';
  const title = 'Тестовый счёт UI-07';
  await owner.locator('.nav [data-view=invoices]').click();
  const invoice = owner.locator('#invoiceForm');
  await invoice.locator('[name=membershipId]').selectOption(pupil.membershipId);
  await invoice.locator('[name=description]').fill(title);
  await invoice.locator('[name=amount]').fill('1250.50');
  const created = await (await submit(owner, invoice, invoicePath, 'POST', 201)).json();
  const detail = owner.locator('[data-invoice-detail]');
  await detail.getByRole('heading',{name:title}).waitFor();
  const payment = owner.locator('#invoicePaymentForm');
  await payment.locator('[name=amount]').fill('500.25');
  await payment.locator('[name=note]').fill('Синтетическое поступление UI-07');
  const path = invoicePath + '/' + created.id + '/payments';
  await submit(owner, payment, path, 'POST', 201);
  await detail.getByText('Остаток 750,25 ₽',{exact:true}).waitFor();
  await detail.getByText(/Синтетическое поступление UI-07/).waitFor();

  stage = 'student package persistence';
  await owner.getByRole('button',{name:'Абонементы',exact:true}).click();
  await owner.locator('[data-edit-sub="' + pupil.membershipId + '"]').click();
  const packageForm = owner.locator('#subscriptionForm');
  await packageForm.locator('[name=packageSize]').fill('6');
  await packageForm.locator('[name=lessonPrice]').fill('1250');
  await submit(owner, packageForm, 'teacher/subscriptions/' + pupil.membershipId, 'POST', 201);
  await owner.locator('#subscriptionRows').getByText(/Стоимость пакета: 7\s500 ₽/).waitFor();

  stage = 'logout, new sign-in and persisted values';
  await owner.locator('#logout').click();
  await owner.locator('#loginForm').waitFor();
  ownerSession = await login(owner, ownerEmail);
  await owner.locator('#openTeacherProfile').click();
  await profile.locator('[name=displayName]').waitFor();
  assert.equal(await profile.locator('[name=displayName]').inputValue(),displayName);
  await reminder.waitFor();
  assert.equal(await reminder.isChecked(),remind);
  await owner.locator('.nav [data-view=invoices]').click();
  await owner.getByRole('button',{name:'Открыть счёт: ' + title}).click();
  await detail.getByText('Остаток 750,25 ₽',{exact:true}).waitFor();
  assert.equal((await call(path,ownerSession.accessToken)).length,1);
  await owner.getByRole('button',{name:'Абонементы',exact:true}).click();
  await owner.locator('#subscriptionRows').getByText(/Стоимость пакета: 7\s500 ₽/).waitFor();
  console.log('PASS: profile and reminder saved, invoice and one partial receipt persisted across logout/sign-in, remaining 750.25 RUB, student package persisted');

  stage = 'colleague permissions in the synthetic workspace';
  await owner.locator('#openTeacherProfile').click();
  await owner.getByRole('button',{name:'Управление доступом'}).click();
  const invite = owner.locator('#teacherInviteForm');
  await invite.locator('[name=email]').fill(colleagueEmail);
  await submit(owner, invite, accessPath + '/invitations', 'POST', 201);
  const field = owner.locator('#teacherInvitationCode');
  await field.waitFor();
  const code = await field.inputValue();
  secrets.push(code);
  assert.ok(/^[0-9A-F]{48}$/.test(code), 'Offline synthetic invitation code issued');

  const colleague = await newPage();
  await colleague.locator('#toggleTeacherInvitation').click();
  const accept = colleague.locator('#acceptTeacherInvitationForm');
  for (const [name,value] of Object.entries({email:colleagueEmail,workspace:ownerSession.workspace,password,code}))
    await accept.locator('[name="' + name + '"]').fill(value);
  await submit(colleague, accept, 'teacher-invitation-acceptance', 'POST', 204);
  await colleague.locator('#loginForm').waitFor();
  const teacher = await login(colleague, colleagueEmail);
  assert.equal(teacher.workspaceId,ownerSession.workspaceId);
  assert.equal(teacher.workspaceRole,'teacher');
  await colleague.locator('#openTeacherProfile').click();
  await colleague.getByText('Преподаватель · ' + ownerSession.workspace,{exact:true}).waitFor();
  assert.equal(await colleague.getByRole('button',{name:'Управление доступом'}).count(),0);
  await call(accessPath,teacher.accessToken,{status:403});
  const students = await call('teacher/students',teacher.accessToken);
  assert.deepEqual(students.map(x=>x.membershipId),[pupil.membershipId]);
  console.log('PASS: colleague sees ordinary workspace data, cannot manage access (HTTP 403)');

  stage = 'revoke the synthetic colleague session';
  const members = await call(accessPath,ownerSession.accessToken);
  const membership = members.members.find(x=>x.email === colleagueEmail);
  assert.ok(membership?.isActive);
  await owner.getByRole('button',{name:'Скрыть код'}).click();
  await owner.locator('#refresh').click();
  const revoke = owner.locator('[data-revoke-workspace-member="' + membership.id + '"]');
  await revoke.waitFor();
  owner.once('dialog',dialog => dialog.accept());
  await revoke.click();
  await owner.getByText('Преподаватель · Доступ закрыт',{exact:true}).waitFor();
  await call('teacher/me',teacher.accessToken,{status:403});
  await colleague.reload();
  await colleague.locator('#loginForm').waitFor();
  assert.equal(await colleague.locator('#app').isVisible(),false);
  console.log('PASS: owner revoke blocks the old teacher session and prevents re-entry on reload');
} catch (error) {
  let message = String(error.message);
  for (const secret of secrets.filter(Boolean)) message = message.replaceAll(secret,'[redacted]');
  console.error('FAIL at ' + stage + ': ' + message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
