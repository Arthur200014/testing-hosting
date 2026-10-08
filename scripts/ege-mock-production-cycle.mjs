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
  process.env.EGE_MOCK_ALLOW_PRODUCTION_WRITES,
  '1',
  'set EGE_MOCK_ALLOW_PRODUCTION_WRITES=1 to create real test rows'
);

const root = new URL('..', import.meta.url).pathname;
const outerHtml = readFileSync(`${root}/EGA/config/probnic.html`, 'utf8');
const egeBase64 = outerHtml.match(
  /ege:\{label:'ЕГЭ-2027',teacherButton:'[^']+',htmlB64:'([^']+)'\}/
)?.[1];
assert.ok(egeBase64, 'embedded EGE form was not found');
const egeHtml = Buffer.from(egeBase64, 'base64').toString('utf8');
const apiUrl = egeHtml.match(/const API_URL='([^']+)'/)?.[1];
assert.ok(apiUrl, 'EGE GAS URL was not found');

const sheetId = '1TTwFlfhYPy4T4J_obqPUSLE1IpkExS_orLmEJ8JxM0k';
const publishedUrl = 'https://arthur200014.github.io/testing-hosting/EGA/config/probnic.html?program=ege';
const executablePath = process.env.EGE_CHROMIUM_PATH
  || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
  args: ['--no-sandbox']
});

const clean = value => String(value ?? '').trim();
const truthy = value => value === true || value === 1
  || ['1', 'true', 'да', 'yes'].includes(clean(value).toLowerCase());
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const runStamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const eventPrefix = `CODEX-EGE-LIVE-${runStamp}`;
const variantTag = `НАГРУЗОЧНЫЙ ТЕСТ 30 УЧЕНИКОВ · ${runStamp}`;
const verificationPrefix = clean(process.env.EGE_MOCK_VERIFY_PREFIX);

async function readDownloadedText(url) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true });
  try {
    const page = await context.newPage();
    const downloadPromise = page.waitForEvent('download');
    await page.goto(url, { timeout: 45_000 }).catch(error => {
      if (!/Download is starting/.test(error.message)) throw error;
    });
    const download = await downloadPromise;
    return readFileSync(await download.path(), 'utf8');
  } finally {
    await context.close();
  }
}

async function readSheet(sheetName) {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`);
  url.searchParams.set('tqx', 'out:json');
  url.searchParams.set('sheet', sheetName);
  url.searchParams.set('headers', '1');
  url.searchParams.set('_production_cycle', `${Date.now()}-${Math.random()}`);
  const body = await readDownloadedText(url.href);
  const data = JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1));
  const columns = data.table.cols.map(column => clean(column.label || column.id));
  return data.table.rows.map(row => Object.fromEntries(columns.map((column, index) => [
    column,
    row.c?.[index]?.v ?? ''
  ])));
}

async function childFrame(page) {
  await page.waitForSelector('#frame', { timeout: 45_000 });
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const frame = page.frames().find(candidate => candidate.parentFrame() === page.mainFrame());
    if (frame) {
      const ready = await frame.evaluate(() => Boolean(globalThis.__EGE_MOCK_PERSISTENCE__?.ready))
        .catch(() => false);
      if (ready) return frame;
    }
    await sleep(100);
  }
  throw new Error('EGE iframe persistence bridge did not become ready');
}

async function openAttempt(page, student) {
  const frame = await childFrame(page);
  await frame.locator('#studentCode').fill(student.code);
  await frame.locator('#loginBtn').click();
  await frame.locator('#exam:not(.hidden), #resultOverlay:not(.hidden)').first().waitFor({ timeout: 30_000 });
  await frame.waitForFunction(() => globalThis.__EGE2027_MOCK_DIAGNOSTICS__.getState().verified, null, {
    timeout: 15_000
  });
  return frame;
}

async function configureRoutes(context, student, clientIndex, attempts) {
  await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'globalThis.MathJax={typesetPromise:()=>Promise.resolve(),typeset:()=>{}};'
  }));
  await context.route('https://script.google.com/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST') {
      let payload = {};
      try { payload = JSON.parse(request.postData() || '{}'); } catch {}
      if (payload.action === 'submitAssignedMock') {
        const eventId = clean(payload.eventId);
        const currentAttempt = (attempts.get(eventId) || 0) + 1;
        attempts.set(eventId, currentAttempt);
        if (clientIndex % 3 === 0 && currentAttempt === 1) {
          await route.abort('internetdisconnected');
          return;
        }
      }
      await route.continue();
      return;
    }
    const action = url.searchParams.get('action');
    if (action === 'validateStudent') {
      const data = {
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
      const callback = url.searchParams.get('callback');
      await route.fulfill({
        status: 200,
        contentType: callback ? 'application/javascript' : 'application/json',
        body: callback ? `${callback}(${JSON.stringify(data)});` : JSON.stringify(data)
      });
      return;
    }
    await route.continue();
  });
}

async function waitForAllConfirmed(frames, attempts, timeout = 300_000) {
  const deadline = Date.now() + timeout;
  let lastPending = -1;
  while (Date.now() < deadline) {
    const pending = await Promise.all(frames.map(frame => frame.evaluate(
      () => globalThis.__EGE_MOCK_PERSISTENCE__.persistence.readOutbox().length
    ).catch(() => 1)));
    const count = pending.reduce((sum, value) => sum + value, 0);
    if (count !== lastPending) {
      console.log(`[delivery] confirmed=${frames.length - count}/${frames.length} requests=${[
        ...attempts.values()
      ].reduce((sum, value) => sum + value, 0)}`);
      lastPending = count;
    }
    if (count === 0) return;
    await Promise.all(frames.map((frame, index) => pending[index]
      ? frame.evaluate(() => globalThis.__EGE_MOCK_PERSISTENCE__.flush()).catch(() => null)
      : null));
    await sleep(5_000);
  }
  throw new Error('not all production submissions were confirmed before timeout');
}

async function pollRows(eventIds, timeout = 120_000) {
  const wanted = new Set(eventIds);
  const deadline = Date.now() + timeout;
  let lastFound = -1;
  while (Date.now() < deadline) {
    const rows = await readSheet('Пробники');
    const found = rows.filter(row => wanted.has(clean(row.eventId)));
    if (found.length !== lastFound) {
      console.log(`[sheet] visible=${found.length}/${eventIds.length}`);
      lastFound = found.length;
    }
    if (found.length === eventIds.length) return { rows, found };
    await sleep(5_000);
  }
  throw new Error('new production rows did not become visible in the sheet');
}

async function submitInactiveChecks(inactiveStudents) {
  if (!inactiveStudents.length) return [];
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    await context.route('https://arthur200014.github.io/testing-hosting/__ege_inactive_probe__', route => route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><title>inactive probe</title>'
    }));
    const page = await context.newPage();
    await page.goto('https://arthur200014.github.io/testing-hosting/__ege_inactive_probe__');
    const results = [];
    for (let index = 0; index < inactiveStudents.length; index += 1) {
      const student = inactiveStudents[index];
      const eventId = `${eventPrefix}-INACTIVE-${String(index + 1).padStart(2, '0')}`;
      let response = null;
      for (let attempt = 1; attempt <= 3 && !response; attempt += 1) {
        response = await page.evaluate(async ({ endpoint, payload }) => {
          try {
            const raw = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify(payload),
              redirect: 'follow',
              credentials: 'omit',
              cache: 'no-store'
            });
            return await raw.json();
          } catch { return null; }
        }, {
          endpoint: apiUrl,
          payload: {
            action: 'submitAssignedMock',
            programId: 'EGE_MATH',
            eventId,
            studentId: student.studentId,
            mockId: 'EGE2027-MOCK-INACTIVE-CHECK',
            variantName: variantTag,
            mockDate: new Date().toISOString().slice(0, 10),
            primaryScore: 1,
            maxPrimaryScore: 13,
            durationSeconds: 60,
            schemaVersion: 5
          }
        });
        if (!response) await sleep(2_000);
      }
      assert.equal(response?.ok, false, 'inactive student submission was unexpectedly accepted');
      assert.match(clean(response.error), /неактив/i);
      results.push({ eventId, rejected: true });
    }
    return results;
  } finally {
    await context.close();
  }
}

async function replayExistingRows(rows) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    await context.route('https://arthur200014.github.io/testing-hosting/__ege_duplicate_probe__', route => route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><title>duplicate probe</title>'
    }));
    const pages = await Promise.all(rows.map(async () => {
      const page = await context.newPage();
      await page.goto('https://arthur200014.github.io/testing-hosting/__ege_duplicate_probe__');
      return page;
    }));
    let pending = rows.map((row, index) => ({ row, page: pages[index], index }));
    const attempts = Array(rows.length).fill(0);
    for (let round = 1; round <= 4 && pending.length; round += 1) {
      const results = await Promise.all(pending.map(async item => {
        attempts[item.index] += 1;
        const response = await item.page.evaluate(async ({ endpoint, payload }) => {
          try {
            const raw = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify(payload),
              redirect: 'follow',
              credentials: 'omit',
              cache: 'no-store'
            });
            return await raw.json();
          } catch { return null; }
        }, {
          endpoint: apiUrl,
          payload: {
            action: 'submitAssignedMock',
            studentId: clean(item.row.studentId),
            eventId: clean(item.row.eventId)
          }
        });
        return {
          ...item,
          confirmed: response?.ok === true
            && response?.duplicate === true
            && clean(response?.eventId) === clean(item.row.eventId)
        };
      }));
      pending = results.filter(result => !result.confirmed);
      console.log(`[dedupe] confirmed=${rows.length - pending.length}/${rows.length} round=${round}`);
      if (pending.length && round < 4) await sleep(10_000);
    }
    assert.equal(pending.length, 0, 'not all duplicate replays were confirmed');
    return {
      receipts: rows.length,
      totalAttempts: attempts.reduce((sum, value) => sum + value, 0),
      clientsRequiringRetry: attempts.filter(value => value > 1).length
    };
  } finally {
    await context.close();
  }
}

const contexts = [];
try {
  const baselineSheets = ['Пробники', 'Тесты', 'ДЗ_Назначения', 'Пробник_Задания'];
  const [studentRows, ...baselineRows] = await Promise.all([
    readSheet('Ученики'),
    ...baselineSheets.map(readSheet)
  ]);
  const students = studentRows.map(row => ({
    studentId: clean(row.studentId),
    studentName: clean(row.studentName || 'Ученик'),
    code: clean(row.inviteCode || row.studentId),
    programId: clean(row.programId || 'EGE_MATH'),
    active: truthy(row.active)
  })).filter(student => student.studentId);
  const activeStudents = students.filter(student => student.active && student.code);
  const inactiveStudents = students.filter(student => !student.active);
  const inactivePlaceholders = studentRows.filter(row => !clean(row.studentId) && !truthy(row.active));
  assert.equal(studentRows.length, 24, 'student table row count changed unexpectedly');
  assert.equal(students.length, 21, 'valid student count changed unexpectedly');
  assert.equal(activeStudents.length, 21, 'active student count changed unexpectedly');
  assert.equal(inactiveStudents.length, 0, 'unexpected inactive student with an identifier');
  assert.equal(inactivePlaceholders.length, 3, 'inactive placeholder count changed unexpectedly');

  if (verificationPrefix) {
    const matching = baselineRows[0].filter(row => clean(row.eventId).startsWith(verificationPrefix));
    assert.equal(matching.length, 30, 'verification prefix does not have exactly 30 rows');
    assert.equal(new Set(matching.map(row => clean(row.eventId))).size, 30, 'verification prefix contains duplicate events');
    assert.equal(new Set(matching.map(row => clean(row.studentId))).size, activeStudents.length);
    assert.equal(matching.filter(row => clean(row.variantName).startsWith('НАГРУЗОЧНЫЙ ТЕСТ 30 УЧЕНИКОВ')).length, 30);
    assert.equal(matching.filter(row => clean(row.programId) === 'EGE_MATH').length, 30);
    assert.equal(matching.filter(row => Number(row.maxPrimaryScore) === 13).length, 30);
    assert.equal(matching.filter(row => clean(row.serverSubmittedAt)).length, 30);
    const scores = matching.map(row => Number(row.primaryScore));
    assert.equal(Math.min(...scores), 2);
    assert.equal(Math.max(...scores), 13);
    const duplicateReplay = await replayExistingRows(matching);
    const afterRows = await readSheet('Пробники');
    const afterMatching = afterRows.filter(row => clean(row.eventId).startsWith(verificationPrefix));
    assert.equal(afterMatching.length, 30, 'duplicate replay changed the number of production rows');
    const afterUnrelated = await Promise.all(baselineSheets.slice(1).map(readSheet));
    afterUnrelated.forEach((rows, index) => {
      assert.equal(rows.length, baselineRows[index + 1].length, `${baselineSheets[index + 1]} changed during verification`);
    });
    console.log(JSON.stringify({
      passed: true,
      mode: 'verify-existing-production-cycle',
      eventPrefix: verificationPrefix,
      productionRows: afterMatching.length,
      uniqueEvents: new Set(afterMatching.map(row => clean(row.eventId))).size,
      uniqueStudents: new Set(afterMatching.map(row => clean(row.studentId))).size,
      everyActiveStudentUsed: new Set(afterMatching.map(row => clean(row.studentId))).size === activeStudents.length,
      scoreMinimum: Math.min(...scores),
      scoreMaximum: Math.max(...scores),
      duplicateReplay,
      rowsAddedByReplay: afterMatching.length - matching.length,
      unrelatedSheetRowCountsUnchanged: baselineSheets.slice(1)
    }, null, 2));
  } else {

  const clients = Array.from({ length: 30 }, (_, index) => ({
    ...activeStudents[index % activeStudents.length],
    clientIndex: index,
    eventId: `${eventPrefix}-${String(index + 1).padStart(2, '0')}`,
    expectedPrimary: 2 + ((index * 7) % 12)
  }));
  const eventIds = clients.map(client => client.eventId);
  const baselineMatches = baselineRows[0].filter(row => eventIds.includes(clean(row.eventId)));
  assert.equal(baselineMatches.length, 0, 'event prefix already exists in the mock sheet');
  console.log(`[setup] rows=${studentRows.length} students=${students.length} active=${activeStudents.length} inactivePlaceholders=${inactivePlaceholders.length}`);
  console.log(`[setup] eventPrefix=${eventPrefix}`);

  const attempts = new Map();
  for (let index = 0; index < clients.length; index += 1) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      ignoreHTTPSErrors: true
    });
    contexts.push(context);
    await configureRoutes(context, clients[index], index, attempts);
  }

  const errors = clients.map(() => []);
  const pages = await Promise.all(contexts.map(async (context, index) => {
    const page = await context.newPage();
    page.on('pageerror', error => errors[index].push(error.message));
    await page.goto(`${publishedUrl}&productionCycle=${encodeURIComponent(runStamp)}-${index}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    return page;
  }));
  console.log('[browser] 30 published pages loaded');
  const frames = await Promise.all(pages.map((page, index) => openAttempt(page, clients[index])));
  console.log('[browser] 30 isolated attempts opened');

  await Promise.all(frames.map((frame, index) => frame.evaluate(({ eventId, variantName, score }) => {
    const current = globalThis.__EGE2027_MOCK_DIAGNOSTICS__.getState();
    const attemptKey = [
      'egeMock:v1:attempt',
      encodeURIComponent('EGE_MATH'),
      encodeURIComponent(String(current.code || '').trim().toUpperCase()),
      encodeURIComponent(String(current.variantId || '').trim())
    ].join(':');
    // The production test uses a recognizable event id. Remove the state that
    // was created during login before replacing it, otherwise saveAttempt()
    // intentionally preserves the original durable event id.
    localStorage.removeItem(attemptKey);
    current.eventId = eventId;
    current.variantName = variantName;
    current.answers = current.questions.map((question, questionIndex) => {
      const numeric = Number(question.numeric);
      return String(questionIndex < score ? numeric : numeric + 12345).replace('.', ',');
    });
    document.querySelectorAll('[id^="answer-"]').forEach((input, questionIndex) => {
      input.value = current.answers[questionIndex] || '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const badge = document.getElementById('studentBadge');
    if (badge) badge.textContent = `${current.student?.studentName || 'Ученик'} · ${variantName}`;
    globalThis.storeLocal();
  }, {
    eventId: clients[index].eventId,
    variantName: variantTag,
    score: clients[index].expectedPrimary
  })));

  await Promise.all(frames.map(async frame => {
    await frame.locator('#submitBtn').click();
    await frame.locator('#confirmOverlay:not(.hidden)').waitFor();
    await frame.locator('#confirmSubmit').click();
    await frame.locator('#resultOverlay:not(.hidden)').waitFor();
  }));
  console.log('[browser] 30 forms submitted through the student UI');
  await waitForAllConfirmed(frames, attempts);

  const browserStates = await Promise.all(frames.map(frame => frame.evaluate(() => {
    const current = globalThis.__EGE2027_MOCK_DIAGNOSTICS__.getState();
    const saved = globalThis.__EGE_MOCK_PERSISTENCE__.persistence.loadCurrent({
      programId: 'EGE_MATH',
      studentCode: current.code
    });
    return {
      eventId: current.eventId,
      phase: saved?.phase,
      outbox: globalThis.__EGE_MOCK_PERSISTENCE__.persistence.readOutbox().length,
      visibleTransport: ['saveState', 'resultSubmitState', 'popupSubmitState'].some(id => {
        const element = document.getElementById(id);
        return element && !element.hidden && getComputedStyle(element).display !== 'none'
          && element.textContent.trim();
      })
    };
  })));
  browserStates.forEach((state, index) => {
    assert.equal(state.eventId, clients[index].eventId);
    assert.equal(state.phase, 'confirmed');
    assert.equal(state.outbox, 0);
    assert.equal(Boolean(state.visibleTransport), false);
  });
  assert.deepEqual(errors, clients.map(() => []));

  const { found } = await pollRows(eventIds);
  const countsByEvent = new Map();
  found.forEach(row => countsByEvent.set(clean(row.eventId), (countsByEvent.get(clean(row.eventId)) || 0) + 1));
  const clientByEvent = new Map(clients.map(client => [client.eventId, client]));
  found.forEach(row => {
    const client = clientByEvent.get(clean(row.eventId));
    assert.equal(countsByEvent.get(client.eventId), 1, `duplicate row for ${client.eventId}`);
    assert.equal(clean(row.studentId), client.studentId);
    assert.equal(clean(row.variantName), variantTag);
    assert.equal(Number(row.primaryScore), client.expectedPrimary);
    assert.equal(Number(row.maxPrimaryScore), 13);
    assert.equal(clean(row.programId), 'EGE_MATH');
    assert.ok(clean(row.serverSubmittedAt), 'serverSubmittedAt is missing');
  });

  const inactiveChecks = await submitInactiveChecks(inactiveStudents);
  const inactiveRows = (await readSheet('Пробники')).filter(row => (
    inactiveChecks.some(check => check.eventId === clean(row.eventId))
  ));
  assert.equal(inactiveRows.length, 0, 'inactive rejection unexpectedly wrote mock rows');

  const afterUnrelated = await Promise.all(baselineSheets.slice(1).map(readSheet));
  afterUnrelated.forEach((rows, index) => {
    assert.equal(
      rows.length,
      baselineRows[index + 1].length,
      `${baselineSheets[index + 1]} row count changed during the mock test`
    );
  });

  const attemptValues = [...attempts.values()];
  const summary = {
    passed: true,
    eventPrefix,
    targetSheet: 'Пробники',
    studentTable: {
      rows: studentRows.length,
      validStudents: students.length,
      active: activeStudents.length,
      inactive: inactiveStudents.length,
      inactivePlaceholdersWithoutIdOrCode: inactivePlaceholders.length,
      activeEge: activeStudents.filter(student => student.programId === 'EGE_MATH').length,
      activeOge: activeStudents.filter(student => student.programId === 'OGE_MATH').length,
      everyActiveStudentUsed: new Set(clients.map(client => client.studentId)).size === activeStudents.length
    },
    productionCycle: {
      simultaneousBrowsers: clients.length,
      uniqueEvents: new Set(eventIds).size,
      confirmedInBrowser: browserStates.filter(state => state.phase === 'confirmed').length,
      rowsVisibleInSheet: found.length,
      exactlyOnceRows: [...countsByEvent.values()].filter(count => count === 1).length,
      firstRequestsAborted: clients.filter(client => client.clientIndex % 3 === 0).length,
      clientsRequiringRetry: attemptValues.filter(value => value > 1).length,
      totalPostAttempts: attemptValues.reduce((sum, value) => sum + value, 0),
      scoreMinimum: Math.min(...clients.map(client => client.expectedPrimary)),
      scoreMaximum: Math.max(...clients.map(client => client.expectedPrimary)),
      hiddenTechnicalStatuses: browserStates.filter(state => !state.visibleTransport).length
    },
    inactiveChecks: {
      attempted: inactiveChecks.length,
      rejected: inactiveChecks.filter(check => check.rejected).length,
      rowsCreated: inactiveRows.length
    },
    unrelatedSheetRowCountsUnchanged: baselineSheets.slice(1),
    publishedUrl
  };
  console.log(JSON.stringify(summary, null, 2));
  }
} finally {
  await Promise.all(contexts.map(context => context.close().catch(() => null)));
  await browser.close();
}
