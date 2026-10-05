const SESSION_PATH = '/api/v1/student-sessions';
const TEST_ATTEMPT_PATH = '/api/v1/test-attempts';
const SESSION_EXPIRY_SKEW_MS = 30_000;

export class AspNetApiError extends Error {
  constructor(message, { status = null, code = 'API_ERROR' } = {}) {
    super(message);
    this.name = 'AspNetApiError';
    this.status = status;
    this.code = code;
  }
}

function validateConfig({ baseUrl, workspace, fetchImpl, timeoutMs, getStudentCode }) {
  let parsed;
  try { parsed = new URL(baseUrl); } catch { throw new TypeError('A valid API baseUrl is required'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new TypeError('A valid API baseUrl is required');
  }
  const normalizedWorkspace = typeof workspace === 'string' ? workspace.trim() : '';
  if (!normalizedWorkspace) throw new TypeError('A workspace is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs must be a positive number');
  if (getStudentCode != null && typeof getStudentCode !== 'function') throw new TypeError('getStudentCode must be a function');
  return { baseUrl: parsed.href.replace(/\/$/, ''), workspace: normalizedWorkspace };
}

function normalizeSession(data) {
  const student = data?.student;
  const required = [data?.accessToken, data?.tokenType, data?.expiresAt,
    student?.id, student?.displayName, student?.programId, student?.workspaceId];
  if (!required.every(value => typeof value === 'string' && value.trim())) return null;
  if (data.tokenType !== 'Bearer' || !Number.isFinite(Date.parse(data.expiresAt))) return null;
  return {
    ok: true,
    studentId: student.id,
    studentName: student.displayName,
    programId: student.programId,
    workspaceId: student.workspaceId,
    student: { ...student },
    accessToken: data.accessToken,
    tokenType: data.tokenType,
    expiresAt: data.expiresAt
  };
}


function normalizeAttemptResponse(data, canonical) {
  const monthlyBest = data?.monthlyBest;
  if (typeof data?.attemptId !== 'string' || !data.attemptId.trim() ||
      typeof data?.eventId !== 'string' || !data.eventId.trim() ||
      typeof data?.duplicate !== 'boolean' || !Number.isFinite(Date.parse(data?.createdAt)) ||
      typeof monthlyBest?.attemptId !== 'string' || !monthlyBest.attemptId.trim() ||
      !Number.isInteger(monthlyBest?.percent) || !Number.isInteger(monthlyBest?.durationSeconds) ||
      !Number.isFinite(Date.parse(monthlyBest?.completedAt))) return null;
  return {
    ok: true,
    saved: true,
    duplicate: data.duplicate,
    eventId: data.eventId,
    attemptId: data.attemptId,
    createdAt: data.createdAt,
    keptBest: monthlyBest.attemptId === data.attemptId,
    scorePercent: canonical.percent,
    monthlyBest: { ...monthlyBest }
  };
}

function httpError(status) {
  if (status === 400) return new AspNetApiError('The request was not accepted.', { status, code: 'INVALID_REQUEST' });
  if (status === 401) return new AspNetApiError('The student session is invalid.', { status, code: 'UNAUTHORIZED' });
  if (status === 403) return new AspNetApiError('Access is forbidden.', { status, code: 'FORBIDDEN' });
  if (status === 404) return new AspNetApiError('The requested service was not found.', { status, code: 'NOT_FOUND' });
  if (status === 409) return new AspNetApiError('The event ID conflicts with an existing test attempt.', { status, code: 'CONFLICT' });
  if (status === 429) return new AspNetApiError('Too many requests. Try again later.', { status, code: 'RATE_LIMITED' });
  if (status >= 500) return new AspNetApiError('The service is temporarily unavailable.', { status, code: 'SERVER_ERROR' });
  return new AspNetApiError('The request failed.', { status, code: 'HTTP_ERROR' });
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
  if (!normalized) throw new AspNetApiError('The test result is missing ' + name + '.', { code: 'INVALID_RESULT' });
  return normalized;
}

function requiredInteger(source, keys, name, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = Number(firstDefined(source, keys));
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AspNetApiError('The test result has an invalid ' + name + '.', { code: 'INVALID_RESULT' });
  }
  return value;
}

function parseTimestamp(value, name) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new AspNetApiError('The test result has an invalid ' + name + '.', { code: 'INVALID_RESULT' });
  }
  return milliseconds;
}

export function mapLegacyTestAttempt(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new AspNetApiError('A test result payload is required.', { code: 'INVALID_RESULT' });
  }
  if (payload.action != null && payload.action !== 'submitTest') {
    throw new AspNetApiError('This provider only accepts test results.', { code: 'UNSUPPORTED_ACTION' });
  }

  const eventId = requiredString(payload, ['eventId'], 'eventId');
  const testId = requiredString(payload, ['testId'], 'testId');
  const topic = requiredString(payload, ['topic', 'topicName', 'topicId'], 'topic');
  const taskNumber = requiredInteger(payload, ['taskNumber'], 'taskNumber', { min: 1 });
  const correct = requiredInteger(payload, ['correct', 'correctCount', 'score'], 'correct', { min: 0 });
  const total = requiredInteger(payload, ['total', 'totalCount', 'maxScore'], 'total', { min: 1 });
  if (correct > total) throw new AspNetApiError('The test result has correct greater than total.', { code: 'INVALID_RESULT' });
  const durationSeconds = requiredInteger(payload, ['durationSeconds', 'durationSec'], 'durationSeconds', { min: 0, max: 86_400 });
  const completedSource = firstDefined(payload, ['finishedAt', 'completedAt']);
  const completedMs = parseTimestamp(completedSource, 'completedAt');
  const sourceStarted = firstDefined(payload, ['startedAt']);
  const sourceStartedMs = sourceStarted == null ? NaN : Date.parse(sourceStarted);
  const startedMs = Number.isFinite(sourceStartedMs) &&
    Math.round((completedMs - sourceStartedMs) / 1000) === durationSeconds
    ? sourceStartedMs
    : completedMs - durationSeconds * 1000;

  return {
    eventId,
    testId,
    topic,
    taskNumber,
    correct,
    total,
    percent: Math.trunc(correct * 100 / total),
    startedAt: new Date(startedMs).toISOString(),
    completedAt: new Date(completedMs).toISOString(),
    durationSeconds,
    schemaVersion: requiredString(payload, ['schemaVersion'], 'schemaVersion')
  };
}

function normalizeCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function sessionIsUsable(session, nowMs) {
  const expiresAt = Date.parse(session?.expiresAt);
  return typeof session?.accessToken === 'string' && session.accessToken &&
    Number.isFinite(expiresAt) && expiresAt - nowMs > SESSION_EXPIRY_SKEW_MS;
}

export function createAspNetApiClient({ baseUrl, workspace, fetchImpl = globalThis.fetch, timeoutMs = 15000,
  getStudentCode = null, now = () => Date.now() } = {}) {
  const config = validateConfig({ baseUrl, workspace, fetchImpl, timeoutMs, getStudentCode });
  const sessions = new Map();
  const pendingSessions = new Map();

  async function validateStudentCode(code) {
    if (typeof code !== 'string' || !code.trim()) throw new TypeError('A student code is required');
    const normalizedCode = normalizeCode(code);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(config.baseUrl + SESSION_PATH, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: config.workspace, code }),
        signal: controller.signal
      });
      if (!response?.ok) throw httpError(Number(response?.status) || 0);
      let data;
      try { data = await response.json(); } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError') {
          throw new AspNetApiError('The request timed out.', { code: 'TIMEOUT' });
        }
        throw new AspNetApiError('The service returned an invalid response.', { status: response.status, code: 'INVALID_RESPONSE' });
      }
      const normalized = normalizeSession(data);
      if (!normalized) throw new AspNetApiError('The service returned an invalid response.', { status: response.status, code: 'INVALID_RESPONSE' });
      sessions.set(normalizedCode, normalized);
      return normalized;
    } catch (error) {
      if (error instanceof AspNetApiError) throw error;
      if (controller.signal.aborted || error?.name === 'AbortError') {
        throw new AspNetApiError('The request timed out.', { code: 'TIMEOUT' });
      }
      throw new AspNetApiError('The service could not be reached.', { code: 'NETWORK_ERROR' });
    } finally {
      clearTimeout(timer);
    }
  }

  function codeForPayload(payload) {
    const fromPayload = normalizeCode(payload?.studentCode);
    if (fromPayload) return fromPayload;
    try { return normalizeCode(getStudentCode?.(payload)); } catch { return ''; }
  }

  async function sessionForPayload(payload) {
    const code = codeForPayload(payload);
    if (!code) throw new AspNetApiError('A verified student session is required.', { code: 'SESSION_REQUIRED' });
    const cached = sessions.get(code);
    if (sessionIsUsable(cached, now())) return cached;
    if (pendingSessions.has(code)) return pendingSessions.get(code);
    const pending = validateStudentCode(code).finally(() => pendingSessions.delete(code));
    pendingSessions.set(code, pending);
    return pending;
  }

  async function submitResult(payload) {
    const canonical = mapLegacyTestAttempt(payload);
    const code = codeForPayload(payload);
    const session = await sessionForPayload(payload);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(config.baseUrl + TEST_ATTEMPT_PATH, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: session.tokenType + ' ' + session.accessToken
        },
        body: JSON.stringify(canonical),
        signal: controller.signal
      });
      if (!response?.ok) throw httpError(Number(response?.status) || 0);
      let data;
      try { data = await response.json(); } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError') {
          throw new AspNetApiError('The request timed out.', { code: 'TIMEOUT' });
        }
        throw new AspNetApiError('The service returned an invalid response.', { status: response.status, code: 'INVALID_RESPONSE' });
      }
      const normalized = normalizeAttemptResponse(data, canonical);
      if (!normalized) throw new AspNetApiError('The service returned an invalid response.', { status: response.status, code: 'INVALID_RESPONSE' });
      return normalized;
    } catch (error) {
      if (error instanceof AspNetApiError && error.status === 401 && code) sessions.delete(code);
      if (error instanceof AspNetApiError) throw error;
      if (controller.signal.aborted || error?.name === 'AbortError') {
        throw new AspNetApiError('The request timed out.', { code: 'TIMEOUT' });
      }
      throw new AspNetApiError('The service could not be reached.', { code: 'NETWORK_ERROR' });
    } finally {
      clearTimeout(timer);
    }
  }

  function sendResultOnExit(payload) {
    let canonical;
    try { canonical = mapLegacyTestAttempt(payload); } catch { return false; }
    const code = codeForPayload(payload);
    const session = sessions.get(code);
    if (!code || !sessionIsUsable(session, now())) return false;
    try {
      Promise.resolve(fetchImpl(config.baseUrl + TEST_ATTEMPT_PATH, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: session.tokenType + ' ' + session.accessToken
        },
        body: JSON.stringify(canonical),
        keepalive: true
      })).catch(() => {});
      return true;
    } catch { return false; }
  }

  return { validateStudentCode, submitResult, sendResultOnExit };
}
