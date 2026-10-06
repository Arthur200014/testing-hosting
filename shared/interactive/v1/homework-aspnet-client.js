import { AspNetApiError, createAspNetApiClient } from './aspnet-api-client.js';

const ASSIGNMENTS_PATH = '/api/v1/homework-assignments';
const SUBMISSIONS_PATH = '/api/v1/homework-submissions';
const SESSION_EXPIRY_SKEW_MS = 30_000;

function normalizeCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function firstDefined(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function requiredString(source, keys, name) {
  const value = firstDefined(source, keys);
  const normalized = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  if (!normalized) throw new AspNetApiError(`The homework result is missing ${name}.`, { code: 'INVALID_RESULT' });
  return normalized;
}

function requiredInteger(source, keys, name, { min, max }) {
  const value = Number(firstDefined(source, keys));
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AspNetApiError(`The homework result has an invalid ${name}.`, { code: 'INVALID_RESULT' });
  }
  return value;
}

function parseTimestamp(value, name) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new AspNetApiError(`The homework result has an invalid ${name}.`, { code: 'INVALID_RESULT' });
  }
  return new Date(milliseconds).toISOString();
}

export function mapLegacyHomeworkSubmission(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new AspNetApiError('A homework result payload is required.', { code: 'INVALID_RESULT' });
  }
  if (payload.action != null && payload.action !== 'submitHomework') {
    throw new AspNetApiError('This provider only accepts homework results.', { code: 'UNSUPPORTED_ACTION' });
  }
  return {
    assignmentId: requiredString(payload, ['assignmentId', 'homeworkId'], 'assignmentId'),
    eventId: requiredString(payload, ['eventId'], 'eventId'),
    scorePercent: requiredInteger(payload, ['scorePercent', 'percent'], 'scorePercent', { min: 0, max: 100 }),
    durationSeconds: requiredInteger(payload, ['durationSeconds', 'durationSec'], 'durationSeconds', { min: 0, max: 86_400 }),
    completedAt: parseTimestamp(firstDefined(payload, ['completedAt', 'finishedAt', 'submittedAt']), 'completedAt'),
    schemaVersion: requiredString(payload, ['schemaVersion'], 'schemaVersion')
  };
}

function sessionIsUsable(session, nowMs) {
  const expiresAt = Date.parse(session?.expiresAt);
  return typeof session?.accessToken === 'string' && session.accessToken &&
    session?.tokenType === 'Bearer' && Number.isFinite(expiresAt) && expiresAt - nowMs > SESSION_EXPIRY_SKEW_MS;
}

function httpError(status) {
  if (status === 400) return new AspNetApiError('The homework request was not accepted.', { status, code: 'INVALID_REQUEST' });
  if (status === 401) return new AspNetApiError('The student session is invalid.', { status, code: 'UNAUTHORIZED' });
  if (status === 403) return new AspNetApiError('Access is forbidden.', { status, code: 'FORBIDDEN' });
  if (status === 404) return new AspNetApiError('No matching homework assignment was found.', { status, code: 'NOT_FOUND' });
  if (status === 409) return new AspNetApiError('The homework event conflicts with an existing submission.', { status, code: 'CONFLICT' });
  if (status === 429) return new AspNetApiError('Too many requests. Try again later.', { status, code: 'RATE_LIMITED' });
  if (status >= 500) return new AspNetApiError('The service is temporarily unavailable.', { status, code: 'SERVER_ERROR' });
  return new AspNetApiError('The homework request failed.', { status, code: 'HTTP_ERROR' });
}

export function createAspNetHomeworkClient({
  baseUrl,
  workspace,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
  getStudentCode = null,
  now = () => Date.now()
} = {}) {
  const parsedBase = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsedBase.protocol) || parsedBase.username || parsedBase.password || parsedBase.search || parsedBase.hash) {
    throw new TypeError('A valid API baseUrl is required');
  }
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs must be a positive number');
  if (getStudentCode != null && typeof getStudentCode !== 'function') throw new TypeError('getStudentCode must be a function');

  const sessionClient = createAspNetApiClient({ baseUrl, workspace, fetchImpl, timeoutMs, getStudentCode, now });
  const base = parsedBase.href.replace(/\/$/, '');
  const sessions = new Map();
  const pendingSessions = new Map();

  async function validateStudentCode(code) {
    const normalizedCode = normalizeCode(code);
    if (!normalizedCode) throw new TypeError('A student code is required');
    const session = await sessionClient.validateStudentCode(code);
    sessions.set(normalizedCode, session);
    return {
      id: session.studentId,
      name: session.studentName,
      code: normalizedCode,
      verified: true,
      programId: session.programId,
      workspaceId: session.workspaceId
    };
  }

  function codeForPayload(payload) {
    const direct = normalizeCode(payload?.studentCode);
    if (direct) return direct;
    try { return normalizeCode(getStudentCode?.(payload)); } catch { return ''; }
  }

  async function sessionFor(payload) {
    const code = codeForPayload(payload);
    if (!code) throw new AspNetApiError('A verified student session is required.', { code: 'SESSION_REQUIRED' });
    const cached = sessions.get(code);
    if (sessionIsUsable(cached, now())) return { code, session: cached };
    if (pendingSessions.has(code)) return { code, session: await pendingSessions.get(code) };
    const pending = sessionClient.validateStudentCode(code).then(session => {
      sessions.set(code, session);
      return session;
    }).finally(() => pendingSessions.delete(code));
    pendingSessions.set(code, pending);
    return { code, session: await pending };
  }

  async function authorizedJson(path, { method = 'GET', payload = null, body = null, keepalive = false } = {}) {
    const { code, session } = await sessionFor(payload);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(base + path, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body == null ? {} : { 'Content-Type': 'application/json' }),
          Authorization: `${session.tokenType} ${session.accessToken}`
        },
        ...(body == null ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
        keepalive
      });
      if (!response?.ok) throw httpError(Number(response?.status) || 0);
      try { return await response.json(); } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError') throw new AspNetApiError('The request timed out.', { code: 'TIMEOUT' });
        throw new AspNetApiError('The service returned an invalid response.', { status: response.status, code: 'INVALID_RESPONSE' });
      }
    } catch (error) {
      if (error instanceof AspNetApiError && error.status === 401) sessions.delete(code);
      if (error instanceof AspNetApiError) throw error;
      if (controller.signal.aborted || error?.name === 'AbortError') throw new AspNetApiError('The request timed out.', { code: 'TIMEOUT' });
      throw new AspNetApiError('The service could not be reached.', { code: 'NETWORK_ERROR' });
    } finally {
      clearTimeout(timer);
    }
  }

  async function listAssignments(payload = {}) {
    const data = await authorizedJson(ASSIGNMENTS_PATH, { payload });
    if (!Array.isArray(data)) throw new AspNetApiError('The service returned an invalid response.', { code: 'INVALID_RESPONSE' });
    return data;
  }

  async function submitResult(payload) {
    const canonical = mapLegacyHomeworkSubmission(payload);
    const data = await authorizedJson(SUBMISSIONS_PATH, { method: 'POST', payload, body: canonical });
    if (typeof data?.submissionId !== 'string' || !data.submissionId.trim() ||
        typeof data?.assignmentRecordId !== 'string' || !data.assignmentRecordId.trim() ||
        typeof data?.homeworkId !== 'string' || !data.homeworkId.trim() ||
        typeof data?.eventId !== 'string' || !data.eventId.trim() ||
        typeof data?.duplicate !== 'boolean' || typeof data?.late !== 'boolean' ||
        !Number.isInteger(data?.scorePercent) || !Number.isFinite(Date.parse(data?.completedAt))) {
      throw new AspNetApiError('The service returned an invalid response.', { code: 'INVALID_RESPONSE' });
    }
    return { ok: true, success: true, submitted: true, ...data };
  }

  function sendResultOnExit(payload) {
    let canonical;
    try { canonical = mapLegacyHomeworkSubmission(payload); } catch { return false; }
    const code = codeForPayload(payload);
    const session = sessions.get(code);
    if (!code || !sessionIsUsable(session, now())) return false;
    try {
      Promise.resolve(fetchImpl(base + SUBMISSIONS_PATH, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `${session.tokenType} ${session.accessToken}`
        },
        body: JSON.stringify(canonical),
        keepalive: true
      })).catch(() => {});
      return true;
    } catch { return false; }
  }

  return { validateStudentCode, listAssignments, submitResult, sendResultOnExit };
}
