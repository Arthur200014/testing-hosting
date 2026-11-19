import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {apiAccess} from './api-access.mjs';
import {openStagingPostgresJournal} from './postgres.mjs';
import {startStagingTransport} from './transport.mjs';

const apiOrigin = process.env.TAS_BOARD_STAGING_API;
const authorize = apiAccess(apiOrigin, {https: true});
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
const tls = {
  key: await readFile(process.env.TAS_BOARD_STAGING_TLS_KEY),
  cert: await readFile(process.env.TAS_BOARD_STAGING_TLS_CERT),
};

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
      body = page.replaceAll(publishedApi, new URL(apiOrigin).origin);
    }
    res.writeHead(200, {
      'Content-Type': contentTypes[kind], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'SAMEORIGIN',
    }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}

const journal = await openStagingPostgresJournal(process.env.TAS_BOARD_STAGING_DB);
try {
  const relay = await startStagingTransport({
    tls, handler, key: signingKey, journal, authorize,
    port: Number(process.env.TAS_BOARD_STAGING_PORT ?? 18448),
  });
  console.log(relay.url);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
    try { await relay.close(); } finally { await journal.close(); }
  });
} catch (error) {
  await journal.close();
  throw error;
}
