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
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8']
]);
const remoteBase = String(process.env.OGE_MOCK_BASE_URL || '').replace(/\/$/, '');
const server = remoteBase ? null : createServer((request, response) => {
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
if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = remoteBase || `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.EGE_CHROMIUM_PATH
  || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
  args: ['--no-sandbox']
});

let savedPayload = null;
const browserErrors = [];
const context = await browser.newContext({ ignoreHTTPSErrors: Boolean(remoteBase) });
try {
  await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'globalThis.MathJax={typesetPromise:()=>Promise.resolve(),typeset:()=>{}};'
  }));
  await context.route('https://docs.google.com/spreadsheets/**/gviz/tq**', route => {
    const url = new URL(route.request().url());
    const callback = url.searchParams.get('tqx')?.split('responseHandler:')[1];
    const data = { status: 'ok', table: { cols: [], rows: [] } };
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: callback ? `${callback}(${JSON.stringify(data)});` : JSON.stringify(data)
    });
  });
  await context.route('https://script.google.com/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    let payload = Object.fromEntries(url.searchParams);
    if (request.method() === 'POST') payload = JSON.parse(request.postData() || '{}');
    let data = { ok: true };
    if (payload.action === 'getActiveMockVariantV2') {
      data = { ok: true, programId: 'OGE_MATH', activeId: '', variant: null };
    } else if (payload.action === 'listMockVariantsV2') {
      data = { ok: true, programId: 'OGE_MATH', activeId: '', variants: [] };
    } else if (payload.action === 'saveMockVariantV2') {
      savedPayload = structuredClone(payload);
      data = { ok: true, saved: true, variantId: payload.variant?.id };
    }
    const callback = url.searchParams.get('callback');
    await route.fulfill({
      status: 200,
      contentType: callback ? 'application/javascript' : 'application/json',
      body: callback ? `${callback}(${JSON.stringify(data)});` : JSON.stringify(data)
    });
  });

  const page = await context.newPage();
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.goto(`${base}/EGA/config/probnic.html`, {
    waitUntil: 'domcontentloaded', timeout: 30_000
  });
  await page.locator('#teacherBtn').click();
  await page.locator('#teacherCode').fill('A7K4P9');
  await page.locator('#teacherLoginBtn').click();
  await page.locator('[data-program="oge"]').click();
  await page.waitForSelector('#frame');
  let frame;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    for (const candidate of page.frames().filter(item => item.parentFrame() === page.mainFrame())) {
      if (await candidate.evaluate(() => Boolean(globalThis.__OGE2027_MOCK_DIAGNOSTICS__)).catch(() => false)) {
        frame = candidate;
        break;
      }
    }
    if (frame) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(frame, 'OGE iframe must load');
  await frame.locator('#teacherDashboard:not(.hidden)').waitFor();

  await frame.locator('[data-bank-practice="1"]').click();
  await frame.locator('[data-choose-practice]').first().click();
  await frame.locator('[data-bank-task="25"]').click();
  await frame.locator('[data-choose-bank]').first().click();
  await frame.locator('#teacherVariantName').fill('Browser save contract test');
  await frame.locator('#teacherSave').click();
  await frame.waitForFunction(() => document.getElementById('teacherMessage')?.textContent.includes('Вариант сохранён'));

  assert.ok(savedPayload, 'saveMockVariantV2 POST must be created');
  const variant = savedPayload.variant;
  assert.equal(variant.programId, 'OGE_MATH');
  assert.equal(variant.questions.length, 19);
  assert.equal(variant.secondPart.length, 6);
  assert.deepEqual(variant.questions.map(question => question.task), Array.from({ length: 19 }, (_, i) => i + 1));
  assert.deepEqual(variant.secondPart.map(question => question.task), Array.from({ length: 6 }, (_, i) => i + 20));
  assert.ok(variant.questions.every(question => Number.isFinite(Number(question.numeric))));
  assert.equal(variant.questionIds.length, 19);
  assert.equal(variant.secondPartIds.length, 6);
  assert.match(variant.questions[0].source, /^oge-practice:\d+$/);
  assert.match(variant.secondPart[5].source, /^oge-bank:OGE-BANK-25-/);

  const normalizedLikeGas = {
    ...variant,
    practiceGroup: undefined,
    questionIds: undefined,
    secondPartIds: undefined,
    questions: variant.questions.map(question => ({
      task: question.task,
      topic: question.topic,
      prototypeId: question.prototypeId,
      text: question.text,
      numeric: question.numeric,
      answer: question.answer,
      answerBlank: question.answerBlank,
      explain: question.explain,
      diagram: question.diagram,
      source: question.source
    })),
    secondPart: variant.secondPart.map(question => ({
      task: question.task,
      topic: question.topic,
      text: question.text,
      source: question.source
    }))
  };
  assert.ok(JSON.stringify(normalizedLikeGas).length < 48_000,
    'GAS-normalized variant must fit the configured storage limit');
  const restored = await frame.evaluate(value => {
    const result = globalThis.fillVariant(value);
    return {
      practiceGroup: result.practiceGroup,
      firstIds: result.questions.map(question => question.prototypeId),
      secondIds: result.secondPart.map(question => question.prototypeId)
    };
  }, normalizedLikeGas);
  assert.equal(restored.practiceGroup, variant.practiceGroup);
  assert.deepEqual(restored.firstIds, variant.questionIds);
  assert.equal(restored.secondIds.at(-1), variant.secondPartIds.at(-1));
  assert.deepEqual(browserErrors, []);

  console.log(JSON.stringify({
    ok: true,
    source: remoteBase ? remoteBase : 'local',
    firstPart: variant.questions.length,
    secondPart: variant.secondPart.length,
    practiceGroup: restored.practiceGroup,
    productionWrites: 0
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
