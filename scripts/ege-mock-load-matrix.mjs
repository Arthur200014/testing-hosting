import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (error) {
  const runtimeRoot = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node';
  if (!existsSync(`${runtimeRoot}/node_modules/playwright/package.json`)) throw error;
  ({ chromium } = createRequire(`${runtimeRoot}/index.js`)('playwright'));
}

const root = new URL('..', import.meta.url).pathname;
const outerHtml = readFileSync(join(root, 'EGA/config/probnic.html'), 'utf8');
const egeBase64 = outerHtml.match(
  /ege:\{label:'ЕГЭ-2027',teacherButton:'[^']+',htmlB64:'([^']+)'\}/
)?.[1];
assert.ok(egeBase64, 'embedded EGE form was not found');
const egeHtml = Buffer.from(egeBase64, 'base64').toString('utf8');
const apiUrl = egeHtml.match(/const API_URL='([^']+)'/)?.[1];
assert.ok(apiUrl, 'EGE GAS URL was not found');

const sheetId = '1TTwFlfhYPy4T4J_obqPUSLE1IpkExS_orLmEJ8JxM0k';
const liveReads = process.env.EGE_MOCK_LIVE_READS === '1';
const liveValidationEnabled = process.env.EGE_MOCK_LIVE_VALIDATE !== '0';
const liveDuplicateLoad = process.env.EGE_MOCK_LIVE_DUPLICATE_LOAD === '1';
const browserMatrixEnabled = process.env.EGE_MOCK_BROWSER_MATRIX !== '0';
assert.ok(liveReads, 'set EGE_MOCK_LIVE_READS=1 to run the read-only live checks');

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8']
]);
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const relative = normalize(pathname).replace(/^[/\\]+/, '');
  const file = join(root, relative || 'index.html');
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': mime.get(extname(file)) || 'application/octet-stream' });
  response.end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const localBase = `http://127.0.0.1:${server.address().port}`;

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
const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] || 0;
};

async function readDownloadedJson(url) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true });
  try {
    const page = await context.newPage();
    const downloadPromise = page.waitForEvent('download');
    await page.goto(url, { timeout: 30_000 }).catch(error => {
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
  url.searchParams.set('_stage3', String(Date.now()));
  const body = await readDownloadedJson(url.href);
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
    for (const [key, value] of Object.entries({ action, ...params })) {
      url.searchParams.set(key, value);
    }
    const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    assert.ok(response, `${action} returned no response`);
    return JSON.parse(await response.text());
  } finally {
    await context.close();
  }
}

function selectClients(students, count = 30) {
  assert.ok(students.length, 'no active EGE students are available');
  return Array.from({ length: count }, (_, index) => ({
    ...students[index % students.length],
    clientIndex: index
  }));
}

async function liveValidationLoad(clients) {
  const contexts = await Promise.all(clients.map(() => browser.newContext({ ignoreHTTPSErrors: true })));
  try {
    const pages = await Promise.all(contexts.map(async context => {
      await context.route('https://arthur200014.github.io/testing-hosting/__ege_stage3_validate__', route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><title>validate</title>'
      }));
      const page = await context.newPage();
      await page.goto('https://arthur200014.github.io/testing-hosting/__ege_stage3_validate__');
      return page;
    }));
    const startedAt = Date.now();
    const results = await Promise.all(pages.map(async (page, index) => {
      const requestStartedAt = Date.now();
      let lastError = '';
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        try {
          const data = await page.evaluate(({ endpoint, code, requestId }) => new Promise((resolve, reject) => {
            const callback = `stage3Validate_${requestId}_${Math.random().toString(36).slice(2)}`;
            const script = document.createElement('script');
            let done = false;
            const finish = (error, value) => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              try { delete globalThis[callback]; } catch { globalThis[callback] = undefined; }
              script.remove();
              error ? reject(error) : resolve(value);
            };
            const timer = setTimeout(() => finish(new Error('validation timeout')), 20_000);
            globalThis[callback] = value => finish(null, value);
            script.onerror = () => finish(new Error('validation transport error'));
            const url = new URL(endpoint);
            for (const [key, value] of Object.entries({
              action: 'validateStudent',
              code,
              callback,
              requestId
            })) url.searchParams.set(key, value);
            script.src = url.href;
            document.head.appendChild(script);
          }), {
            endpoint: apiUrl,
            code: clients[index].code,
            requestId: `${Date.now()}-${index}-${attempt}`
          });
          assert.equal(data.ok, true);
          assert.equal(clean(data.studentId), clean(clients[index].studentId));
          assert.equal(clean(data.programId), 'EGE_MATH');
          return { durationMs: Date.now() - requestStartedAt, attempts: attempt };
        } catch (error) {
          lastError = clean(error?.message || error);
          if (attempt < 10) {
            const backoff = Math.min(8_000, 500 * (2 ** (attempt - 1))) + index * 23;
            await new Promise(resolve => setTimeout(resolve, backoff));
          }
        }
      }
      return {
        durationMs: Date.now() - requestStartedAt,
        attempts: 10,
        failed: true,
        errorType: /transport/i.test(lastError) ? 'transport' : 'other'
      };
    }));
    const durations = results.map(result => result.durationMs);
    return {
      passed: results.filter(result => !result.failed).length,
      failed: results.filter(result => result.failed).length,
      elapsedMs: Date.now() - startedAt,
      p95Ms: percentile(durations, 0.95),
      maxMs: Math.max(...durations),
      totalAttempts: results.reduce((sum, result) => sum + result.attempts, 0),
      clientsRequiringRetry: results.filter(result => result.attempts > 1).length
    };
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
}

function existingReplayTarget(students, mockRows) {
  const studentById = new Map(students.map(student => [clean(student.studentId), student]));
  const counts = new Map();
  for (const row of mockRows) {
    const eventId = clean(row.eventId);
    if (eventId) counts.set(eventId, (counts.get(eventId) || 0) + 1);
  }
  const candidates = mockRows.filter(row => clean(row.eventId)
    && counts.get(clean(row.eventId)) === 1
    && clean(row.programId || 'EGE_MATH') === 'EGE_MATH'
    && studentById.has(clean(row.studentId)));
  const preferred = candidates.find(row => /хан/i.test(studentById.get(clean(row.studentId))?.studentName || ''));
  const row = preferred || candidates[0];
  assert.ok(row, 'no existing EGE mock row is available for a mutation-free replay');
  return { row, student: studentById.get(clean(row.studentId)) };
}

async function liveDuplicateSubmissionLoad(target, beforeCount) {
  if (!liveDuplicateLoad) return { skipped: true, reason: 'EGE_MOCK_LIVE_DUPLICATE_LOAD is not enabled' };
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    await context.route('https://arthur200014.github.io/testing-hosting/__ege_stage3_probe__', route => route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><title>probe</title>'
    }));
    const pages = await Promise.all(Array.from({ length: 30 }, async () => {
      const page = await context.newPage();
      await page.goto('https://arthur200014.github.io/testing-hosting/__ege_stage3_probe__');
      return page;
    }));
    const payload = {
      action: 'submitAssignedMock',
      studentId: target.student.studentId,
      eventId: target.row.eventId
    };
    const startedAt = Date.now();
    const attempts = Array(30).fill(0);
    const durations = Array(30).fill(0);
    let pending = pages.map((page, index) => ({ page, index }));
    for (let round = 1; round <= 3 && pending.length; round += 1) {
      const roundResults = await Promise.all(pending.map(async ({ page, index }) => {
        const requestStartedAt = Date.now();
        attempts[index] += 1;
        try {
          const data = await page.evaluate(async ({ endpoint, body }) => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 20_000);
            try {
              const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(body),
                redirect: 'follow',
                credentials: 'omit',
                cache: 'no-store',
                signal: controller.signal
              });
              return await response.json();
            } finally {
              clearTimeout(timer);
            }
          }, { endpoint: apiUrl, body: payload });
          assert.equal(data.ok, true);
          assert.equal(data.duplicate, true);
          assert.equal(clean(data.eventId), clean(target.row.eventId));
          durations[index] += Date.now() - requestStartedAt;
          return { page, index, confirmed: true };
        } catch {
          durations[index] += Date.now() - requestStartedAt;
          return { page, index, confirmed: false };
        }
      }));
      pending = roundResults.filter(result => !result.confirmed);
      if (pending.length && round < 3) await new Promise(resolve => setTimeout(resolve, 15_000));
    }
    const afterRows = await readSheet('Пробники');
    const afterCount = afterRows.filter(row => clean(row.eventId) === clean(target.row.eventId)).length;
    assert.equal(afterCount, beforeCount, 'duplicate replay changed the number of mock rows');
    return {
      clients: pages.length,
      duplicateReceipts: pages.length - pending.length,
      unconfirmedAfterThreeRounds: pending.length,
      elapsedMs: Date.now() - startedAt,
      p95Ms: percentile(durations, 0.95),
      maxMs: Math.max(...durations),
      totalAttempts: attempts.reduce((sum, value) => sum + value, 0),
      clientsRequiringRetry: attempts.filter(value => value > 1).length,
      rowsBefore: beforeCount,
      rowsAfter: afterCount,
      newRows: afterCount - beforeCount
    };
  } finally {
    await context.close();
  }
}

function createFakeSubmissionServer() {
  const rows = new Map();
  const calls = new Map();
  return {
    rows,
    calls,
    async respond(payload, clientIndex) {
      const eventId = clean(payload.eventId);
      assert.ok(eventId);
      const attempt = (calls.get(eventId) || 0) + 1;
      calls.set(eventId, attempt);
      await new Promise(resolve => setTimeout(resolve, 30 + (clientIndex % 7) * 15));
      if (attempt === 1 && clientIndex % 3 === 0) {
        rows.set(eventId, structuredClone(payload));
        return { type: 'html', body: '<html>Page Not Found</html>' };
      }
      if (attempt === 1 && clientIndex % 3 === 1) {
        return { type: 'json', body: { ok: true, saved: true, eventId: 'mismatched-event' } };
      }
      if (rows.has(eventId)) {
        return { type: 'json', body: { ok: true, duplicate: true, eventId } };
      }
      rows.set(eventId, structuredClone(payload));
      return { type: 'json', body: { ok: true, saved: true, eventId } };
    }
  };
}

async function configureStudentRoutes(context, student, clientIndex, activeResponse, fakeServer) {
  await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'globalThis.MathJax={typesetPromise:()=>Promise.resolve(),typeset:()=>{}};'
  }));
  await context.route('https://script.google.com/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    let payload = Object.fromEntries(url.searchParams);
    if (request.method() === 'POST') {
      try { payload = JSON.parse(request.postData() || '{}'); } catch { payload = {}; }
    }
    if (request.method() === 'POST' && payload.action === 'submitAssignedMock') {
      const result = await fakeServer.respond(payload, clientIndex);
      await route.fulfill(result.type === 'html'
        ? { status: 200, contentType: 'text/html', body: result.body }
        : { status: 200, contentType: 'application/json', body: JSON.stringify(result.body) });
      return;
    }
    let data = { ok: true };
    if (payload.action === 'getActiveMockVariantV2') data = activeResponse;
    else if (payload.action === 'validateStudent') {
      data = {
        ok: true,
        studentId: student.studentId,
        studentName: student.studentName,
        programId: 'EGE_MATH',
        student: {
          studentId: student.studentId,
          studentName: student.studentName,
          programId: 'EGE_MATH'
        }
      };
    }
    const callback = url.searchParams.get('callback');
    await route.fulfill({
      status: 200,
      contentType: callback ? 'application/javascript' : 'application/json',
      body: callback ? `${callback}(${JSON.stringify(data)});` : JSON.stringify(data)
    });
  });
}

async function childFrame(page) {
  await page.waitForSelector('#frame');
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const frame = page.frames().find(candidate => candidate.parentFrame() === page.mainFrame());
    if (frame) {
      const ready = await frame.evaluate(() => Boolean(globalThis.__EGE_MOCK_PERSISTENCE__?.ready))
        .catch(() => false);
      if (ready) return frame;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('EGE iframe persistence bridge did not become ready');
}

async function openAttempt(page, code) {
  const frame = await childFrame(page);
  await frame.locator('#studentCode').fill(code);
  await frame.locator('#loginBtn').click();
  await frame.locator('#exam:not(.hidden), #resultOverlay:not(.hidden)').first().waitFor({ timeout: 20_000 });
  return frame;
}

async function waitFor(predicate, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('condition timed out');
}

async function browserLoadMatrix(clients, activeResponse) {
  const fakeServer = createFakeSubmissionServer();
  const contexts = await Promise.all(clients.map(() => browser.newContext({
    viewport: { width: 390, height: 844 }
  })));
  const errors = clients.map(() => []);
  try {
    await Promise.all(contexts.map((context, index) => configureStudentRoutes(
      context,
      clients[index],
      index,
      activeResponse,
      fakeServer
    )));
    const pages = await Promise.all(contexts.map(async (context, index) => {
      const page = await context.newPage();
      page.on('pageerror', error => errors[index].push(error.message));
      return page;
    }));
    const url = `${localBase}/EGA/config/probnic.html?program=ege`;
    await Promise.all(pages.map(page => page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000
    })));
    let frames = await Promise.all(pages.map((page, index) => openAttempt(page, clients[index].code)));
    const correct = clean(activeResponse.variant?.questions?.[0]?.numeric || '1').replace('.', ',');
    await Promise.all(frames.map(async (frame, index) => {
      await frame.locator('#answer-1').fill(index % 2 === 0 ? correct : '999999');
      await frame.locator('#answer-1').dispatchEvent('input');
      await frame.locator('#submitBtn').click();
      await frame.locator('#confirmOverlay:not(.hidden)').waitFor();
      await frame.locator('#confirmSubmit').click();
      await frame.locator('#resultOverlay:not(.hidden)').waitFor();
    }));
    await waitFor(() => [...fakeServer.calls.values()].reduce((sum, value) => sum + value, 0) >= 30);

    const firstStates = await Promise.all(frames.map(frame => frame.evaluate(() => {
      const current = globalThis.__EGE2027_MOCK_DIAGNOSTICS__.getState();
      const persistence = globalThis.__EGE_MOCK_PERSISTENCE__.persistence;
      return {
        eventId: current.eventId,
        outbox: persistence.readOutbox().length,
        phase: persistence.loadCurrent({ programId: 'EGE_MATH', studentCode: current.code })?.phase
      };
    })));
    assert.equal(new Set(firstStates.map(state => state.eventId)).size, 30);
    const pendingObservedAfterFirstWave = firstStates.filter(state => state.outbox === 1).length;
    assert.ok(pendingObservedAfterFirstWave > 0 && pendingObservedAfterFirstWave <= 20);
    assert.equal(firstStates.filter(state => (
      state.outbox === 1 && state.phase === 'queued'
    ) || (
      state.outbox === 0 && state.phase === 'confirmed'
    )).length, 30);

    await Promise.all(frames.map(frame => frame.evaluate(() => globalThis.__EGE_MOCK_PERSISTENCE__.flush())));
    await waitFor(async () => {
      const pending = await Promise.all(frames.map(frame => frame.evaluate(
        () => globalThis.__EGE_MOCK_PERSISTENCE__.persistence.readOutbox().length
      )));
      return pending.every(count => count === 0);
    });
    assert.equal(fakeServer.rows.size, 30);
    assert.equal([...fakeServer.calls.values()].reduce((sum, value) => sum + value, 0), 50);

    const postsBeforeReload = [...fakeServer.calls.values()].reduce((sum, value) => sum + value, 0);
    await Promise.all(pages.map(page => page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 })));
    frames = await Promise.all(pages.map((page, index) => openAttempt(page, clients[index].code)));
    const reopened = await Promise.all(frames.map(frame => frame.evaluate(() => {
      const current = globalThis.__EGE2027_MOCK_DIAGNOSTICS__.getState();
      const persistence = globalThis.__EGE_MOCK_PERSISTENCE__.persistence;
      const saved = persistence.loadCurrent({ programId: 'EGE_MATH', studentCode: current.code });
      const visibleTransport = ['saveState', 'resultSubmitState', 'popupSubmitState'].some(id => {
        const element = document.getElementById(id);
        return element && !element.hidden && getComputedStyle(element).display !== 'none'
          && element.textContent.trim();
      });
      return {
        eventId: current.eventId,
        answer: current.answers[0],
        finished: current.finished,
        phase: saved?.phase,
        outbox: persistence.readOutbox().length,
        visibleTransport
      };
    })));
    reopened.forEach((state, index) => {
      assert.equal(state.eventId, firstStates[index].eventId);
      assert.equal(state.finished, true);
      assert.equal(state.phase, 'confirmed');
      assert.equal(state.outbox, 0);
      assert.equal(Boolean(state.visibleTransport), false);
    });
    assert.equal(
      [...fakeServer.calls.values()].reduce((sum, value) => sum + value, 0),
      postsBeforeReload,
      'confirmed attempts were posted again after reopening'
    );
    assert.deepEqual(errors, clients.map(() => []));
    return {
      clients: clients.length,
      uniqueEvents: firstStates.length,
      ambiguousResponsesInjected: 20,
      pendingObservedAfterFirstWave,
      confirmedAfterRetry: 20,
      acceptedRows: fakeServer.rows.size,
      deliveryCalls: postsBeforeReload,
      reopenedConfirmed: reopened.length,
      productionWrites: 0
    };
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
}

try {
  const [studentRows, mockRows, activeResponse] = await Promise.all([
    readSheet('Ученики'),
    readSheet('Пробники'),
    getLiveJson('getActiveMockVariantV2', { programId: 'EGE_MATH' })
  ]);
  assert.equal(activeResponse.ok, true);
  assert.ok(activeResponse.variant, 'no active EGE mock variant is configured');
  const activeEgeStudents = studentRows.map(row => ({
    studentId: clean(row.studentId),
    studentName: clean(row.studentName || 'Ученик'),
    code: clean(row.inviteCode || row.studentId),
    programId: clean(row.programId || 'EGE_MATH'),
    active: truthy(row.active)
  })).filter(student => student.active && student.studentId && student.code
    && student.programId === 'EGE_MATH');
  const clients = selectClients(activeEgeStudents);
  const validation = liveValidationEnabled
    ? await liveValidationLoad(clients)
    : { skipped: true, reason: 'EGE_MOCK_LIVE_VALIDATE=0' };
  let duplicateLoad = { skipped: true, reason: 'EGE_MOCK_LIVE_DUPLICATE_LOAD is not enabled' };
  if (liveDuplicateLoad) {
    const target = existingReplayTarget(activeEgeStudents, mockRows);
    const beforeCount = mockRows.filter(row => clean(row.eventId) === clean(target.row.eventId)).length;
    duplicateLoad = await liveDuplicateSubmissionLoad(target, beforeCount);
  }
  const browserMatrix = browserMatrixEnabled
    ? await browserLoadMatrix(clients, activeResponse)
    : { skipped: true, reason: 'EGE_MOCK_BROWSER_MATRIX=0' };
  const passed = (validation.skipped || validation.failed === 0)
    && (duplicateLoad.skipped || duplicateLoad.unconfirmedAfterThreeRounds === 0)
    && (browserMatrix.skipped || (
      browserMatrix.acceptedRows === 30
      && browserMatrix.reopenedConfirmed === 30
    ));
  console.log(JSON.stringify({
    passed,
    source: {
      studentRows: studentRows.length,
      activeEgeStudents: activeEgeStudents.length,
      clients: clients.length,
      everyActiveEgeStudentUsed: new Set(clients.map(client => client.studentId)).size === activeEgeStudents.length
    },
    liveValidation: validation,
    liveDuplicateSubmission: duplicateLoad,
    browserMatrix,
    tableContract: {
      targetSheet: 'Пробники',
      unrelatedSheetsWritten: 0,
      productionRowsCreated: 0
    }
  }, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
