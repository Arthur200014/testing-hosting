import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const api = process.env.TAS_REAL_API, site = process.env.TAS_REAL_SITE;
const password = process.env.TAS_REAL_TEST_PASSWORD;
for(const address of [api,site]) {
  const url=new URL(address);
  assert.equal(url.protocol,'http:'); assert.equal(url.hostname,'127.0.0.1');
}
assert.ok(password?.length>=16,'isolated credentials required');
const output=process.env.TAS_SCREENSHOT_DIR || 'test-results/calendar-real';
await mkdir(output,{recursive:true});
async function call(path,token,body,expected=200,method=body?'POST':'GET') {
  const res=await fetch(api+'/api/v1/'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  assert.equal(res.status,expected,method+' '+path+' status');
  const text=await res.text();
  return text?JSON.parse(text):null;
}
const accounts={};
for(const side of ['north','south']) {
  const workspace='tas-calendar-'+side, email='calendar-'+side+'@example.invalid';
  const login=await call('teacher-sessions',null,{workspace,email,password});
  const token=login.accessToken;
  const [program]=await call('teacher/programs',token);
  const students=[];
  for(let i=1;i<=(side==='north'?2:1);i++) students.push(await call('teacher/students',token,{requestId:randomUUID(),programId:program.id,studentName:'Тест '+side+' ученик '+i},201));
  const item=await call('teacher/classes',token,{requestId:randomUUID(),studentMembershipId:students[0].membershipId,title:'Тестовый класс '+side,durationMinutes:side==='north'?90:60},201);
  const rule=await call('teacher/schedule-rules',token,{requestId:randomUUID(),classId:item.id,classKind:'individual',daysMask:1,startMinute:960,durationMinutes:60,timeZoneId:'Europe/Moscow'},201);
  accounts[side]={workspace,email,token,students,item,rule};
}
const north=accounts.north, south=accounts.south;
const group=await call('teacher/groups',north.token,{requestId:randomUUID(),title:'Тестовая пара',memberIds:north.students.map(s=>s.membershipId),durationMinutes:120},201);
for(let i=0;i<3;i++) {
  const body={requestId:randomUUID(),title:'Сохранённое занятие '+(i+1),lessonAt:`2026-11-16T${String(6+i).padStart(2,'0')}:00:00Z`,
    ...(i===2?{groupClassId:group.id}:{individualClassId:north.item.id}),
    participants:(i===2?north.students:[north.students[0]]).map(s=>({membershipId:s.membershipId,durationMinutes:60,attendanceStatus:'Unknown'}))};
  await call('teacher/lessons',north.token,body,201);
  if(i===0) await call('teacher/lessons',north.token,body); // persisted idempotency replay
}
const southLesson={requestId:randomUUID(),title:'Чужое контрольное занятие',lessonAt:'2026-11-16T06:00:00Z',individualClassId:south.item.id,
  participants:[{membershipId:south.students[0].membershipId,durationMinutes:60,attendanceStatus:'Unknown'}]};
await call('teacher/lessons',south.token,southLesson,201);
await call('teacher/lessons',north.token,{...southLesson,requestId:randomUUID()},404);
await call('teacher/schedule-rules/'+north.rule.id,south.token,{expectedRevision:1,daysMask:1,startMinute:960,durationMinutes:60,timeZoneId:'Europe/Moscow',isActive:true},404,'PATCH');
const beforeLessons=await call('teacher/lessons',north.token);
const beforeRules=await call('teacher/schedule-rules',north.token);
assert.equal(beforeLessons.length,3);
const browser=await chromium.launch({headless:true});
try {
  const context=await browser.newContext({viewport:{width:1348,height:926},timezoneId:'America/Los_Angeles',locale:'ru-RU'});
  // Safety guard only; responses are served by the real API, never fixtures.
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/api/v1/') && url.origin!==api) return route.abort('blockedbyclient');
    return route.continue();
  });
  const page=await context.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  async function login(account) {
    await page.goto(site+'/platform/teacher.html');
    await page.locator('#loginForm [name="workspace"]').fill(account.workspace);
    await page.locator('#loginForm [name="email"]').fill(account.email);
    await page.locator('#loginForm [name="password"]').fill(password);
    await page.locator('#loginForm button[type="submit"]').click();
    await page.locator('#app:not([hidden])').waitFor();
    await page.locator('#notice').waitFor({state:'hidden'});
  }
  async function month(day='2026-11-16') {
    await page.locator('[data-view="lessons"]').click();
    await page.locator('#calendarDate').fill(day);
    await page.locator('#calendarDate').dispatchEvent('change');
    await page.locator('[data-calendar-mode="month"]').click();
  }
  await login(north); await month();
  const cell=page.locator('[data-calendar-month-day="2026-11-16"]');
  assert.equal(await cell.locator('.calendar-month-event').count(),2);
  assert.equal(await cell.locator('[data-calendar-more]').innerText(),'ещё 2');
  assert.equal(await page.getByText('Чужое контрольное занятие',{exact:true}).count(),0);
  await cell.locator('[data-calendar-more]').click();
  assert.equal(await page.locator('[data-calendar-lesson]').count(),3);
  assert.equal(await page.locator('[data-calendar-rule]').count(),1);
  await page.locator('[data-plan-rule]').click();
  assert.equal(await page.locator('#lessonPlannerForm [name="lessonStart"]').inputValue(),'16:00');
  await page.locator('#lessonPlannerForm [data-cancel-lesson-plan]').click();
  assert.deepEqual(await call('teacher/lessons',north.token),beforeLessons);
  assert.deepEqual(await call('teacher/schedule-rules',north.token),beforeRules);
  await page.locator('[data-calendar-new]').click();
  await page.locator('#calendarLessonDialog').waitFor();
  await page.locator('#lessonPlannerForm [name="title"]').fill('Урок через настоящий браузер');
  await page.locator('[data-calendar-plan-kind="class"]').click();
  assert.equal(await page.locator('#lessonPlannerForm [name="title"]').inputValue(),'Урок через настоящий браузер');
  assert.equal(await page.locator('#lessonPlannerForm [name="lessonDate"]').inputValue(),'2026-11-16');
  assert.equal(await page.locator('#lessonPlannerForm button[type="submit"]').isDisabled(),true);
  await page.locator('[data-calendar-plan-kind="one-time"]').click();
  await page.locator('#lessonPlannerForm [name="description"]').fill('Проверка реального сохранения');
  await page.screenshot({path:output+'/40_calendar_create_real.png'});
  await page.locator('#lessonPlannerForm [name="planMember"][value="'+north.students[0].membershipId+'"]').check();
  await page.locator('#lessonPlannerForm button[type="submit"]').click();
  await page.locator('[data-calendar-lesson]').filter({hasText:'Урок через настоящий браузер'}).waitFor();
  const saved=await call('teacher/lessons',north.token);
  assert.equal(saved.length,4);
  assert.equal(saved.find(l=>l.title==='Урок через настоящий браузер').lessonAt.slice(0,19),'2026-11-16T06:00:00');
  await page.reload(); await login(north); await month();
  assert.equal(await page.locator('[data-calendar-month-day="2026-11-16"] [data-calendar-more]').innerText(),'ещё 3');
  await page.screenshot({path:output+'/39_calendar_month_real.png'});
  await page.locator('[data-calendar-shift="1"]').click();
  assert.equal(await page.locator('#calendarDate').inputValue(),'2026-12-16');
  await page.locator('[data-calendar-shift="-1"]').click();
  assert.equal(await page.locator('#calendarDate').inputValue(),'2026-11-16');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:output+'/39_calendar_month_real_mobile.png'});
  await page.setViewportSize({width:1348,height:926});
  // Calendar class selection: drafts survive switching; only own active classes appear.
  await page.locator('[data-calendar-new]').click();
  await page.locator('[data-calendar-plan-kind="class"]').click();
  assert.equal(await page.locator('#calendarPlanClass option').count(),3);
  assert.equal((await page.locator('#calendarPlanClass').innerText()).includes('south'),false);
  await page.locator('#calendarPlanClass').selectOption('individual:'+north.item.id);
  assert.equal(await page.locator('#lessonPlannerForm [name="lessonEnd"]').inputValue(),'10:30');
  assert.equal(await page.locator('#lessonPlannerForm [name="planMember"]:checked').count(),1);
  await page.locator('#lessonPlannerForm [name="title"]').fill('Индивидуальное из календаря');
  page.once('dialog',d=>d.dismiss());
  await page.keyboard.press('Escape');
  await page.locator('#calendarLessonDialog').waitFor();
  assert.equal((await call('teacher/lessons',north.token)).length,4);
  await page.locator('#lessonPlannerForm button[type="submit"]').click();
  await page.locator('#calendarLessonDialog').waitFor({state:'hidden'});
  const individual= (await call('teacher/lessons',north.token)).find(l=>l.title==='Индивидуальное из календаря');
  assert.equal(individual.individualClassId,north.item.id);
  assert.equal(individual.groupClassId,null);
  assert.equal(individual.participants[0].durationMinutes,90);
  await page.locator('[data-view="overview"]').click();
  await page.locator('[data-open-class="'+north.item.id+'"]').click();
  await page.locator('[data-class-detail-tab="schedule"]').click();
  await page.locator('.class-subsection').getByText('Индивидуальное из календаря',{exact:false}).waitFor();
  await page.locator('[data-view="lessons"]').click();
  await page.locator('[data-calendar-new]').click();
  await page.locator('[data-calendar-plan-kind="class"]').click();
  await page.locator('#calendarPlanClass').selectOption('group:'+group.id);
  assert.equal(await page.locator('#lessonPlannerForm [name="lessonEnd"]').inputValue(),'11:00');
  assert.equal(await page.locator('#lessonPlannerForm [name="planMember"]:checked').count(),2);
  await page.locator('#lessonPlannerForm [name="lessonDate"]').fill('2026-11-18');
  await page.locator('#lessonPlannerForm [name="title"]').fill('Группа из календаря');
  await page.screenshot({path:output+'/41_calendar_class_create_real.png'});
  // A server-side archive while the form is open must fail visibly without adding a Lesson.
  const archived=await call('teacher/groups/'+group.id+'/archive',north.token,{expectedRevision:group.revision});
  await page.locator('#lessonPlannerForm button[type="submit"]').click();
  await page.locator('[data-calendar-plan-error]:not([hidden])').waitFor();
  assert.equal((await call('teacher/lessons',north.token)).length,5);
  await call('teacher/groups/'+group.id+'/restore',north.token,{expectedRevision:archived.revision});
  await page.locator('#lessonPlannerForm button[type="submit"]').click();
  await page.locator('#calendarLessonDialog').waitFor({state:'hidden'});
  const all=await call('teacher/lessons',north.token);
  assert.equal(all.length,6);
  const grouped=all.find(l=>l.title==='Группа из календаря');
  assert.equal(grouped.groupClassId,group.id);
  assert.equal(grouped.individualClassId,null);
  assert.equal(grouped.participants.length,2);
  assert.ok(grouped.participants.every(p=>p.durationMinutes===120));
  assert.equal(grouped.lessonAt.slice(0,19),'2026-11-18T06:00:00');
  await page.locator('[data-calendar-month-day="2026-11-18"] .calendar-month-event').filter({hasText:'Группа из календаря'}).waitFor();
  await page.locator('[data-view="overview"]').click();
  await page.locator('[data-open-class="'+group.id+'"]').click();
  await page.locator('[data-class-detail-tab="schedule"]').click();
  await page.locator('.class-subsection').getByText('Группа из календаря',{exact:false}).waitFor();
  await page.locator('[data-view="lessons"]').click();
  const countBeforeCancel=all.length;
  await page.locator('[data-calendar-new]').click();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'modal fits mobile');
  await page.screenshot({path:output+'/40_calendar_create_real_mobile.png'});
  await page.locator('[aria-label="Закрыть окно занятия"]').click();
  assert.equal((await call('teacher/lessons',north.token)).length,countBeforeCancel);
  console.log('PASS: real calendar one-time/individual/group dialog, draft/date/duration/members, class schedules, archived-class error/retry and cancel without writes');
  await page.locator('#logout').click(); await login(south); await month();
  await page.locator('[data-calendar-month-day="2026-11-16"] .calendar-month-event.is-saved').filter({hasText:'Чужое контрольное занятие'}).waitFor();
  assert.equal(await page.getByText('Урок через настоящий браузер',{exact:true}).count(),0);
  assert.equal((await call('teacher/lessons',south.token)).length,1);
  assert.deepEqual(errors,[]);
  console.log('PASS: TWO persisted test teachers, students/classes/group/rules/lessons; REAL API+PostgreSQL browser save/reload, month, idempotency and tenant boundaries. No production accounts used.');
} finally { await browser.close(); }
