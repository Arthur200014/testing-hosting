import {readFile} from 'node:fs/promises';
import {request} from 'node:http';
import {fileURLToPath} from 'node:url';
import {apiAccess} from './api-access.mjs';
import {openPilotPostgresJournal, openStagingPostgresJournal} from './postgres.mjs';
import {startPilotTransport, startStagingTransport} from './transport.mjs';
import {pilotOrigin as readPilotOrigin, productionApi} from './pilot-settings.mjs';

const pilot = process.env.TAS_BOARD_PILOT_ORIGIN ? readPilotOrigin(process.env.TAS_BOARD_PILOT_ORIGIN) : null;
const apiOrigin = process.env.TAS_BOARD_STAGING_API;
const authorize = apiAccess(apiOrigin, {https: !pilot});
const signingKey = Buffer.from(process.env.TAS_BOARD_STAGING_SIGNING_KEY ?? '', 'base64');
if (signingKey.length < 32) throw new Error('Board staging signing key is required');

const contentTypes = {
  html: 'text/html; charset=utf-8', mjs: 'text/javascript', js: 'text/javascript',
  css: 'text/css', woff2: 'font/woff2', txt: 'text/plain; charset=utf-8',
};
const cabinet = new URL('../', import.meta.url);
const editor = new URL('./editor/dist/', import.meta.url);
const cabinetApi = /^\/api\/v1\/(?:teacher|student|teacher-signups|teacher-registrations|teacher-sessions|student-sessions|teacher-invitation-acceptance|files|homework|homework-assignments|homework-submissions|recordings|test-attempts)(?:\/|$)/;
await readFile(new URL('index.html', editor));

function proxyApi(req, res, url) {
  if (req.headers.origin && req.headers.origin !== pilot.origin) return res.writeHead(403).end();
  const headers = {};
  for (const name of ['accept', 'authorization', 'content-type', 'content-length', 'origin']) {
    if (req.headers[name]) headers[name] = req.headers[name];
  }
  const upstream = request(apiOrigin, {method: req.method, path: url.pathname + url.search, headers}, response => {
    const {connection, 'transfer-encoding': transferEncoding, ...responseHeaders} = response.headers;
    res.writeHead(response.statusCode, {...responseHeaders, 'cache-control': 'no-store'});
    response.on('error', () => res.destroy());
    response.pipe(res);
  });
  upstream.setTimeout(30_000, () => upstream.destroy());
  upstream.on('error', () => res.headersSent ? res.destroy() : res.writeHead(502).end());
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
}

async function handler(req, res) {
  try {
    const url = new URL(req.url, 'https://127.0.0.1');
    const path = url.pathname;
    if (pilot && (cabinetApi.test(path) || /^\/health\/(live|ready|migrations)$/.test(path)))
      return proxyApi(req, res, url);
    const entry = /^\/cabinet\/(teacher\.html|student\.html|[a-z0-9-]+\.(?:mjs|css))$/.exec(path);
    const asset = /^\/board\/((?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+)?$/.exec(path);
    if (req.method !== 'GET' || (!entry && !asset)) return res.writeHead(404).end();
    const name = entry ? entry[1] : asset[1] || 'index.html';
    const kind = name.split('.').at(-1);
    if (!contentTypes[kind]) return res.writeHead(404).end();
    let body = await readFile(fileURLToPath(new URL(name, entry ? cabinet : editor)));
    if (entry && kind === 'html') {
      const page = body.toString();
      if (!page.includes(productionApi)) return res.writeHead(503).end();
      body = page.replaceAll(productionApi, pilot?.origin ?? new URL(apiOrigin).origin);
    }
    if (pilot && kind === 'html') body = body.toString().replace(/<meta charset="utf-8">/i,
      tag => tag + `<meta name="tas-board-pilot" content="${pilot.origin}">`);
    res.writeHead(200, {
      'Content-Type': contentTypes[kind], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'SAMEORIGIN',
    }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}

const journal = pilot
  ? await openPilotPostgresJournal(process.env.TAS_BOARD_STAGING_DB, process.env.TAS_BOARD_PILOT_DB_HOST,
    process.env.TAS_BOARD_PILOT_DB_CA)
  : await openStagingPostgresJournal(process.env.TAS_BOARD_STAGING_DB);
try {
  const options = {handler, key: signingKey, journal, authorize,
    port: Number(process.env.TAS_BOARD_STAGING_PORT ?? (pilot ? 8080 : 18448))};
  const relay = pilot
    ? await startPilotTransport({...options, host: '0.0.0.0', origin: pilot})
    : await startStagingTransport({...options, tls: {
      key: await readFile(process.env.TAS_BOARD_STAGING_TLS_KEY),
      cert: await readFile(process.env.TAS_BOARD_STAGING_TLS_CERT),
    }});
  console.log(relay.url);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
    try { await relay.close(); } finally { await journal.close(); }
  });
} catch (error) {
  await journal.close();
  throw error;
}
