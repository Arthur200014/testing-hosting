import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const roles = new Set(['editor', 'viewer']);
function keyCheck(key) {
  if (!Buffer.isBuffer(key) || key.length < 32) throw new Error('Dedicated 256-bit room key required');
}
export function issuePermit(key, claims, now = Date.now()) {
  keyCheck(key);
  const body = { ...claims, aud: 'tas-board-prototype', iat: Math.floor(now / 1000), jti: randomUUID() };
  validate(body, now);
  const data = Buffer.from(JSON.stringify(body)).toString('base64url');
  return data + '.' + createHmac('sha256', key).update(data).digest('base64url');
}
function validate(c, now) {
  const seconds = Math.floor(now / 1000);
  if (!c || c.aud !== 'tas-board-prototype' || !roles.has(c.role)
    || !['workspace', 'board', 'user', 'jti'].every(k => id(c[k]))
    || !Number.isSafeInteger(c.iat) || !Number.isSafeInteger(c.exp)
    || c.iat > seconds || c.exp <= seconds || c.exp <= c.iat || c.exp - c.iat > 300) {
    throw new Error('Invalid room permit');
  }
}
export function verifyPermit(key, token, expected, { now = Date.now(), revoked = () => false } = {}) {
  keyCheck(key);
  if (typeof token !== 'string' || token.length > 2048) throw new Error('Invalid room permit');
  const parts = token.split('.');
  if (parts.length !== 2 || !parts.every(p => /^[A-Za-z0-9_-]+$/.test(p))) throw new Error('Invalid room permit');
  const signature = Buffer.from(parts[1], 'base64url');
  const correct = createHmac('sha256', key).update(parts[0]).digest();
  if (signature.length !== correct.length || !timingSafeEqual(signature, correct)) throw new Error('Invalid room permit');
  let claims;
  try { claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString()); } catch { throw new Error('Invalid room permit'); }
  validate(claims, now);
  if (!expected || claims.workspace !== expected.workspace || claims.board !== expected.board
      || revoked(claims)) throw new Error('Room access denied');
  return Object.freeze(claims);
}
// Call on EVERY inbound event, not merely at socket connection.
// Caller obtains expected scope from the authorized room binding, never a client roomID.
export function authorizeEvent(key, token, boundScope, event, options) {
  const claims = verifyPermit(key, token, boundScope, options);
  if (!['scene', 'presence', 'replay'].includes(event)) throw new Error('Unsupported room event');
  if (event === 'scene' && claims.role !== 'editor') throw new Error('Read-only board');
  return claims;
}
