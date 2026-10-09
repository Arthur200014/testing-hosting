import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (error) {
  const runtimeRoot = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node';
  if (!existsSync(`${runtimeRoot}/node_modules/playwright/package.json`)) throw error;
  ({ chromium } = createRequire(`${runtimeRoot}/index.js`)('playwright'));
}

assert.equal(
  process.env.MOCK_ALLOW_PRODUCTION_WRITES,
  '1',
  'set MOCK_ALLOW_PRODUCTION_WRITES=1 to create real test rows'
);

const root = new URL('..', import.meta.url).pathname;
const outerHtml = readFileSync(`${root}/EGA/config/probnic.html`, 'utf8');
const egeBase64 = outerHtml.match(
  /ege:\{label:'ЕГЭ-2027',teacherButton:'[^']+',htmlB64:'([^']+)'\}/
)?.[1];
assert.ok(egeBase64, 'embedded EGE form was not found');
const egeHtml = Buffer.from(egeBase64, 'base64').toString('utf8');
const apiUrl = egeHtml.match(/const API_URL='([^']+)'/)?.[1];
assert.ok(apiUrl, 'mock GAS URL was not found');

const sheetId = '1TTwFlfhYPy4T4J_obqPUSLE1IpkExS_orLmEJ8JxM0k';
const publishedUrl = 'https://arthur200014.github.io/testing-hosting/EGA/config/probnic.html';
const clean = value => String(value ?? '').trim();
const truthy = value => value === true || value === 1
  || ['1', 'true', 'да', 'yes'].includes(clean(value).toLowerCase());
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const executablePath = process.env.EGE_CHROMIUM_PATH
  || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
  args: ['--no-sandbox']
});

async function readDownloadedText(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true });
    try {
      const page = await context.newPage();
      const downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
      await page.goto(url, { timeout: 45_000 }).catch(error => {
        if (!/Download is starting/.test(error.message)) throw error;
      });
      const download = await downloadPromise;
      return readFileSync(await download.path(), 'utf8');
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(1_000 * attempt);
    } finally {
      await context.close().catch(() => null);
    }
  }
  throw lastError;
}

async function readSheet(sheetName) {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`);
  url.searchParams.set('tqx', 'out:json');
  url.searchParams.set('headers', '1');
  url.searchParams.set('sheet', sheetName);
  url.searchParams.set('_active_cycle', `${Date.now()}-${Math.random()}`);
  const body = await readDownloadedText(url.href);
  const data = JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1));
  const columns = data.table.cols.map(column => clean(column.label || column.id));
  return data.table.rows.map(row => Object.fromEntries(columns.map((column, index) => [
    column,
    row.c?.[index]?.v ?? ''
  ])));
}

async function getLiveJson(action, params = {}) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const page = await context.newPage();
    const url = new URL(apiUrl);
    for (const [key, value] of Object.entries({ action, ...params })) url.searchParams.set(key, value);
    const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    assert.ok(response, `${action} returned no response`);
    return JSON.parse(await response.text());
  } finally {
    await context.close();
  }
}

async function childFrame(page, program) {
  await page.waitForSelector('#frame', { timeout: 45_000 });
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const frame = page.frames().find(candidate => candidate.parentFrame() === page.mainFrame());
    if (frame) {
      const ready = await frame.evaluate(selected => selected === 'EGE_MATH'
        ? Boolean(globalThis.__EGE_MOCK_PERSISTENCE__?.ready)
        : Boolean(globalThis.__OGE_MOCK_PERSISTENCE__?.ready), program).catch(() => false);
      if (ready) return frame;
    }
    await sleep(100);
  }
  throw new Error(`${program} iframe did not become ready`);
}

async function configureRoutes(context, student, activeResponses, posts) {
  await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'globalThis.MathJax={typesetPromise:()=>Promise.resolve(),typeset:()=>{}};'
  }));
  await context.route('https://script.google.com/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST') {
      try {
        const payload = JSON.parse(request.postData() || '{}');
        if (payload.action === 'submitAssignedMock') posts.push({
          eventId: clean(payload.eventId),
          studentId: clean(payload.studentId),
          programId: clean(payload.programId),
          variantId: clean(payload.variantId),
          variantName: clean(payload.variantName),
          primaryScore: Number(payload.primaryScore),
          maxPrimaryScore: Number(payload.maxPrimaryScore)
        });
      } catch {}
      await route.continue();
      return;
    }

    const action = url.searchParams.get('action');
    let data = null;
    if (action === 'validateStudent') {
      data = {
        ok: true,
        studentId: student.studentId,
        studentName: student.studentName,
        programId: student.programId,
        student: {
          studentId: student.studentId,
          studentName: student.studentName,
          programId: student.programId
        }
      };
    } else if (action === 'getActiveMockVariantV2') {
      data = activeResponses[clean(url.searchParams.get('programId'))];
    }
    if (!data) {
      await route.continue();
      return;
    }
    const callback = url.searchParams.get('callback');
    await route.fulfill({
      status: 200,
      contentType: callback ? 'application/javascript' : 'application/json',
      body: callback ? `${callback}(${JSON.stringify(data)});` : JSON.stringify(data)
    });
  });
}

async function openStudentAttempt(page, student) {
  const programSlug = student.programId === 'OGE_MATH' ? 'oge' : 'ege';
  await page.goto(`${publishedUrl}?program=${programSlug}&activeCycle=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  const frame = await childFrame(page, student.programId);
  await frame.locator('#studentCode').fill(student.code);
  await frame.locator('#loginBtn').click();
  if (student.programId === 'EGE_MATH') {
    await frame.locator('#exam:not(.hidden)').waitFor({ timeout: 30_000 });
    await frame.waitForFunction(() => globalThis.__EGE2027_MOCK_DIAGNOSTICS__.getState().verified, null, {
      timeout: 15_000
    });
  } else {
    await frame.locator('#examMain:not(.hidden)').waitFor({ timeout: 30_000 });
    await frame.waitForFunction(expected => (
      globalThis.__OGE2027_MOCK_DIAGNOSTICS__.getState().app.student?.studentId === expected
    ), student.studentId, { timeout: 15_000 });
  }
  return frame;
}

async function assertFreshDeviceBlocked(page, student) {
  const programSlug = student.programId === 'OGE_MATH' ? 'oge' : 'ege';
  await page.goto(`${publishedUrl}?program=${programSlug}&freshCheck=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  const frame = await childFrame(page, student.programId);
  await frame.locator('#studentCode').fill(student.code);
  await frame.locator('#loginBtn').click();
  const persistenceKey = student.programId === 'OGE_MATH'
    ? '__OGE_MOCK_PERSISTENCE__'
    : '__EGE_MOCK_PERSISTENCE__';
  await frame.waitForFunction(key => globalThis[key]?.isLocked(), persistenceKey, { timeout: 30_000 });
  const examId = student.programId === 'OGE_MATH' ? 'examMain' : 'exam';
  assert.equal(await frame.locator(`#${examId}`).evaluate(element => element.classList.contains('hidden')), true);
  assert.match(await frame.locator('#loginError').textContent(), /уже сдан/i);
}

async function prepareAnswers(frame, student, studentIndex, activeResponses) {
  if (student.programId === 'EGE_MATH') {
    const expectedScore = 3 + ((studentIndex * 5) % 11);
    const state = await frame.evaluate(score => {
      const current = globalThis.__EGE2027_MOCK_DIAGNOSTICS__.getState();
      current.answers = current.questions.map((question, index) => {
        const numeric = Number(question.numeric);
        return String(index < score ? numeric : numeric + 12345).replace('.', ',');
      });
      document.querySelectorAll('[id^="answer-"]').forEach((input, index) => {
        input.value = current.answers[index] || '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      globalThis.storeLocal();
      return {
        eventId: current.eventId,
        variantId: current.variantId,
        variantName: current.variantName
      };
    }, expectedScore);
    const active = activeResponses.EGE_MATH.variant;
    assert.equal(state.variantId, active.id);
    assert.equal(state.variantName, active.name);
    return { ...state, expectedScore, maxPrimaryScore: 13 };
  }

  const expectedScore = studentIndex % 2 === 0 ? 8 : 14;
  const state = await frame.evaluate(score => {
    const current = globalThis.__OGE2027_MOCK_DIAGNOSTICS__.getState();
    current.variant.questions.forEach((question, index) => {
      const numeric = Number(question.numeric);
      current.answers[question.task] = String(index < score ? numeric : numeric + 12345).replace('.', ',');
    });
    document.querySelectorAll('.answer-input').forEach(input => {
      input.value = current.answers[Number(input.dataset.task)] || '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return {
      eventId: current.app.eventId,
      variantId: current.app.variantId,
      variantName: current.app.variantName
    };
  }, expectedScore);
  const active = activeResponses.OGE_MATH.variant;
  assert.equal(state.variantId, active.id);
  assert.equal(state.variantName, active.name);
  return { ...state, expectedScore, maxPrimaryScore: 19 };
}

async function submitAttempt(frame, student) {
  if (student.programId === 'EGE_MATH') {
    await frame.locator('#submitBtn').click();
    await frame.locator('#confirmOverlay:not(.hidden)').waitFor();
    await frame.locator('#confirmSubmit').click();
    await frame.locator('#resultOverlay:not(.hidden)').waitFor();
    await frame.waitForFunction(() => {
      const current = globalThis.__EGE2027_MOCK_DIAGNOSTICS__.getState();
      const persistence = globalThis.__EGE_MOCK_PERSISTENCE__.persistence;
      const saved = persistence.loadCurrent({ programId: 'EGE_MATH', studentCode: current.code });
      return persistence.readOutbox().length === 0 && saved?.phase === 'confirmed';
    }, null, { timeout: 90_000 });
    return;
  }
  await frame.locator('#finishBtn').click();
  await frame.locator('#confirmOverlay:not(.hidden)').waitFor();
  await frame.locator('#confirmFinish').click();
  await frame.locator('#resultOverlay:not(.hidden)').waitFor();
  await frame.waitForFunction(() => document.getElementById('sendState')?.classList.contains('ok'), null, {
    timeout: 90_000
  });
}

async function confirmedEventId(frame, student) {
  return frame.evaluate(program => {
    if (program === 'EGE_MATH') return globalThis.__EGE2027_MOCK_DIAGNOSTICS__.getState().eventId;
    return globalThis.__OGE2027_MOCK_DIAGNOSTICS__.getState().app.eventId;
  }, student.programId);
}

async function pollRows(eventIds, timeout = 120_000) {
  const wanted = new Set(eventIds);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const rows = await readSheet('Пробники');
    const found = rows.filter(row => wanted.has(clean(row.eventId)));
    if (found.length === eventIds.length) return { rows, found };
    await sleep(5_000);
  }
  throw new Error('new active-variant rows did not become visible in the sheet');
}

const contexts = [];
try {
  const studentRows = await readSheet('Ученики');
  const mockRowsBefore = await readSheet('Пробники');
  const [egeActive, ogeActive] = await Promise.all([
    getLiveJson('getActiveMockVariantV2', { programId: 'EGE_MATH' }),
    getLiveJson('getActiveMockVariantV2', { programId: 'OGE_MATH' })
  ]);
  assert.equal(egeActive.ok, true);
  assert.equal(ogeActive.ok, true);
  assert.ok(egeActive.variant);
  assert.ok(ogeActive.variant);
  const activeResponses = { EGE_MATH: egeActive, OGE_MATH: ogeActive };
  const allStudents = studentRows.map(row => ({
    studentId: clean(row.studentId),
    studentName: clean(row.studentName || 'Ученик'),
    code: clean(row.inviteCode || row.studentId),
    programId: clean(row.programId || 'EGE_MATH'),
    active: truthy(row.active)
  })).filter(student => student.studentId && student.code && student.active);
  const forceOgeForEgeStudents = process.env.MOCK_FORCE_OGE_FOR_EGE_STUDENTS === '1';
  const students = forceOgeForEgeStudents
    ? allStudents.filter(student => student.programId === 'EGE_MATH').map(student => ({
      ...student,
      sourceProgramId: student.programId,
      programId: 'OGE_MATH'
    }))
    : allStudents;
  assert.ok(students.length > 0, 'no active students with a code were found');
  if (forceOgeForEgeStudents) {
    assert.equal(students.length, 19, 'forced OGE verification must use exactly the expected 19 EGE test students');
  }
  const unsupportedPrograms = [...new Set(students
    .map(student => student.programId)
    .filter(programId => !activeResponses[programId]))];
  assert.deepEqual(unsupportedPrograms, [], 'students contain an unsupported exam program');

  const posts = [];
  const attempts = [];
  for (let index = 0; index < students.length; index += 1) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      ignoreHTTPSErrors: true
    });
    contexts.push(context);
    await configureRoutes(context, students[index], activeResponses, posts);
    const page = await context.newPage();
    const frame = await openStudentAttempt(page, students[index]);
    const prepared = await prepareAnswers(frame, students[index], index, activeResponses);
    attempts.push({ student: students[index], frame, ...prepared });
    console.log(`[open] ${index + 1}/${students.length} ${students[index].programId}`);
  }

  for (let index = 0; index < attempts.length; index += 1) {
    await submitAttempt(attempts[index].frame, attempts[index].student);
    attempts[index].eventId = clean(await confirmedEventId(attempts[index].frame, attempts[index].student));
    assert.match(attempts[index].eventId, /^mock_[a-f0-9]{32}$/);
    console.log(`[submit] ${index + 1}/${attempts.length} confirmed`);
  }

  const eventIds = attempts.map(attempt => attempt.eventId);
  assert.equal(new Set(eventIds).size, students.length);
  const { found } = await pollRows(eventIds);
  assert.equal(found.length, students.length);
  assert.equal(posts.length, students.length);
  const expectedByEvent = new Map(attempts.map(attempt => [attempt.eventId, attempt]));
  found.forEach(row => {
    const expected = expectedByEvent.get(clean(row.eventId));
    assert.ok(expected);
    assert.equal(clean(row.studentId), expected.student.studentId);
    assert.equal(clean(row.programId), expected.student.programId);
    assert.equal(clean(row.variantName), expected.variantName);
    assert.equal(Number(row.primaryScore), expected.expectedScore);
    assert.equal(Number(row.maxPrimaryScore), expected.maxPrimaryScore);
  });
  assert.equal(new Set(found.map(row => clean(row.studentId))).size, students.length);

  const postCountAfterSubmission = posts.length;
  let freshDeviceBlocks = 0;
  for (let index = 0; index < students.length; index += 1) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      ignoreHTTPSErrors: true
    });
    contexts.push(context);
    await configureRoutes(context, students[index], activeResponses, posts);
    await assertFreshDeviceBlocked(await context.newPage(), students[index]);
    freshDeviceBlocks += 1;
    console.log(`[fresh-device] ${index + 1}/${students.length} blocked`);
  }
  assert.equal(posts.length, postCountAfterSubmission, 'fresh-device checks must not submit another result');

  console.log(JSON.stringify({
    passed: true,
    students: students.length,
    ege: {
      students: students.filter(student => student.programId === 'EGE_MATH').length,
      variantId: egeActive.variant.id,
      variantName: egeActive.variant.name
    },
    oge: {
      students: students.filter(student => student.programId === 'OGE_MATH').length,
      variantId: ogeActive.variant.id,
      variantName: ogeActive.variant.name
    },
    uniqueEvents: eventIds.length,
    rowsBefore: mockRowsBefore.length,
    rowsCreated: found.length,
    oneRowPerStudent: true,
    freshDeviceBlocks,
    extraPostsFromFreshDevices: posts.length - postCountAfterSubmission
  }, null, 2));
} finally {
  await Promise.all(contexts.map(context => context.close().catch(() => null)));
  await browser.close();
}
