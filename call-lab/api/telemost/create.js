'use strict';
// Vercel Function: OAuth-токен берётся только из серверных переменных окружения.
const crypto = require('node:crypto');

function json(res, code, payload) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

function allowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return { ok: true };
  const own = 'https://' + req.headers.host;
  const other = (process.env.ALLOWED_ORIGINS || 'https://arthur200014.github.io')
    .split(',').map(s => s.trim());
  if (origin === own || other.includes(origin)) return { ok: true, origin };
  return { ok: false };
}

function samePin(candidate) {
  const correct = process.env.ADMIN_PIN;
  if (!correct || correct.length < 8 || typeof candidate !== 'string') return false;
  const a = Buffer.from(correct, 'utf8');
  const b = Buffer.from(candidate, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  const access = allowedOrigin(req);
  if (!access.ok) return json(res, 403, { error: 'Источник запроса не разрешён.' });
  if (access.origin) {
    res.setHeader('Access-Control-Allow-Origin', access.origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'X-Admin-Pin, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return json(res, 405, { error: 'Используй POST-запрос.' });
  }
  if (!process.env.TELEMOST_TOKEN || !process.env.ADMIN_PIN) {
    return json(res, 503, { error: 'Не настроены серверные переменные TELEMOST_TOKEN и ADMIN_PIN.' });
  }
  if (!samePin(req.headers['x-admin-pin'])) {
    return json(res, 401, { error: 'Неверный код администратора.' });
  }

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
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json(res, response.status, {
        error: 'Яндекс отклонил создание встречи (HTTP ' + response.status + ').',
        code: typeof result.error === 'string' ? result.error.slice(0, 120) : '',
        detail: typeof result.message === 'string' ? result.message.slice(0, 240) : ''
      });
    }
    let join;
    try { join = new URL(result.join_url); } catch {}
    if (!join || join.protocol !== 'https:' || join.hostname !== 'telemost.yandex.ru') {
      return json(res, 502, { error: 'Яндекс вернул неожиданную ссылку встречи.' });
    }
    return json(res, 201, { id: result.id || null, join_url: join.href });
  } catch (error) {
    return json(res, 502, {
      error: error.name === 'TimeoutError' ? 'Таймаут API Яндекса.' : 'Не удалось связаться с API Яндекса.'
    });
  }
};
