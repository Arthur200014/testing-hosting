import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {apiAccess} from './api-access.mjs';
import {openHostedPostgresJournal, openStagingPostgresJournal} from './postgres.mjs';
import {startHostedTransport, startStagingTransport} from './transport.mjs';

const hostedOrigin = process.env.TAS_BOARD_HOSTED_ORIGIN;
const hosted = hostedOrigin ? new URL(hostedOrigin) : null;
const relayKey = process.env.TAS_BOARD_HOSTED_RELAY_KEY;
if (hosted && (hosted.origin !== hostedOrigin || hosted.protocol !== 'https:' || !relayKey))
  throw new Error('Hosted pilot requires an HTTPS origin and a private relay key');
const apiOrigin = process.env.TAS_BOARD_STAGING_API;
const authorize = apiAccess(apiOrigin, {https: !hosted, relayKey: hosted ? relayKey : undefined});
const signingKey = Buffer.from(process.env.TAS_BOARD_STAGING_SIGNING_KEY ?? '', 'base64');
if (signingKey.length < 32) throw new Error('Board staging signing key is required');

const contentTypes = {
  html: 'text/html; charset=utf-8', mjs: 'text/javascript', js: 'text/javascript',
  css: 'text/css', woff2: 'font/woff2', txt: 'text/plain; charset=utf-8',
};
const publishedApi = 'https://arthur200014-testing-hosting-8c4e.twc1.net';
const cabinet = new URL('../', import.meta.url);
const editor = new URL('./editor/dist/', import.meta.url);
await readFile(new URL('index.html', editor));

async function handler(req, res) {
  try {
    const path = new URL(req.url, 'https://127.0.0.1').pathname;
    const entry = /^\/cabinet\/(teacher\.html|student\.html|[a-z0-9-]+\.(?:mjs|css))$/.exec(path);
    const asset = /^\/board\/((?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+)?$/.exec(path);
    if (req.method !== 'GET' || (!entry && !asset)) return res.writeHead(404).end();
    const name = entry ? entry[1] : asset[1] || 'index.html';
    const kind = name.split('.').at(-1);
    if (!contentTypes[kind]) return res.writeHead(404).end();
    let body = await readFile(fileURLToPath(new URL(name, entry ? cabinet : editor)));
    if (entry && kind === 'html') {
      const page = body.toString();
      if (!page.includes(publishedApi)) return res.writeHead(503).end();
      body = page.replaceAll(publishedApi, hosted?.origin ?? new URL(apiOrigin).origin);
    }
    if (kind === 'html' && hosted) body = body.toString().replace(/<meta charset="utf-8">/i,
      tag => tag + `<meta name="tas-board-hosted" content="${hosted.origin}">`);
    res.writeHead(200, {
      'Content-Type': contentTypes[kind], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'SAMEORIGIN',
    }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}

const journal = hosted
  ? await openHostedPostgresJournal(process.env.TAS_BOARD_HOSTED_WORKSPACE, process.env.TAS_BOARD_HOSTED_PG_CA)
  : await openStagingPostgresJournal(process.env.TAS_BOARD_STAGING_DB);
try {
  const options = {handler, key: signingKey, journal, authorize, port: Number(process.env.TAS_BOARD_STAGING_PORT ?? 18448)};
  const relay = hosted
    ? await startHostedTransport({...options, origin: hosted})
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
