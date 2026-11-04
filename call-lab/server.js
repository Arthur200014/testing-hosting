'use strict';
// Call Lab — серверный прокси для API Яндекс Телемоста.
// TELEMOST_TOKEN используется ТОЛЬКО на сервере.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const port = Number(process.env.PORT || 3000);
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || 'https://arthur200014.github.io,http://localhost:3000')
    .split(',').map(v => v.trim()).filter(Boolean)
);
const attempts = new Map();

function send(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(data));
}
function authorizedPin(candidate) {
  const expected = process.env.ADMIN_PIN || '';
  if (!expected || expected.length < 8 || typeof candidate !== 'string') return false;
  const a = Buffer.from(expected), b = Buffer.from(candidate);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function limited(ip) {
  const now = Date.now();
  let entry = attempts.get(ip);
  if (!entry || now > entry.until) entry = { count: 0, until: now + 60_000 };
  entry.count++;
  attempts.set(ip, entry);
  return entry.count > 20;
}
function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Pin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    return true;
  }
  return !origin;
}
async function createConference(req, res) {
  if (!process.env.TELEMOST_TOKEN || !process.env.ADMIN_PIN) {
    return send(res, 503, { error: 'Сервер ещё не настроен: нужны TELEMOST_TOKEN и ADMIN_PIN.' });
  }
  if (limited(req.socket.remoteAddress || 'unknown')) {
    return send(res, 429, { error: 'Слишком много запросов. Попробуй через минуту.' });
  }
  if (!authorizedPin(req.headers['x-admin-pin'])) {
    return send(res, 401, { error: 'Неверный код администратора.' });
  }

  // Параметры встречи жёстко определены — клиент не может инициировать трансляции.
  try {
    const response = await fetch('https://cloud-api.yandex.net/v1/telemost-api/conferences', {
      method: 'POST',
      headers: {
        Authorization: 'OAuth ' + process.env.TELEMOST_TOKEN.trim(),
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ waiting_room_level: 'PUBLIC' }),
      signal: AbortSignal.timeout(15000)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = typeof body.error === 'string' ? body.error.slice(0, 120) : '';
      const message = typeof body.message === 'string' ? body.message.slice(0, 250) : '';
      return send(res, response.status, {
        error: 'Яндекс отклонил запрос (HTTP ' + response.status + ').',
        code,
        detail: message
      });
    }
    const link = body.join_url;
    let url;
    try { url = new URL(link); } catch {}
    if (!url || url.protocol !== 'https:' || url.hostname !== 'telemost.yandex.ru') {
      return send(res, 502, { error: 'Яндекс не вернул корректную ссылку на видеовстречу.' });
    }
    return send(res, 201, { id: body.id || null, join_url: url.toString() });
  } catch (err) {
    return send(res, 502, { error: 'Нет связи с API Яндекса: ' + (err.name === 'TimeoutError' ? 'истекло время ожидания' : 'ошибка соединения') });
  }
}

http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  const originOK = cors(req, res);
  if (!originOK && pathname.startsWith('/api/')) return send(res, 403, { error: 'Недопустимый источник запроса.' });
  if (req.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    res.writeHead(204);
    return res.end();
  }
  if (pathname === '/api/health' && req.method === 'GET') {
    return send(res, 200, { status: 'ok', telemostReady: Boolean(process.env.TELEMOST_TOKEN && process.env.ADMIN_PIN) });
  }
  if (pathname === '/api/telemost/create' && req.method === 'POST') {
    return createConference(req, res);
  }
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    const file = path.join(__dirname, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    return fs.createReadStream(file).pipe(res);
  }
  return send(res, 404, { error: 'Не найдено.' });
}).listen(port, '0.0.0.0', () => console.log('Call Lab работает на порту ' + port));
