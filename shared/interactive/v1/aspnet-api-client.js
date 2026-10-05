const SESSION_PATH = '/api/v1/student-sessions';

export class AspNetApiError extends Error {
  constructor(message, { status = null, code = 'API_ERROR' } = {}) {
    super(message);
    this.name = 'AspNetApiError';
    this.status = status;
    this.code = code;
  }
}

function validateConfig({ baseUrl, workspace, fetchImpl, timeoutMs }) {
  let parsed;
  try { parsed = new URL(baseUrl); } catch { throw new TypeError('A valid API baseUrl is required'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new TypeError('A valid API baseUrl is required');
  }
  const normalizedWorkspace = typeof workspace === 'string' ? workspace.trim() : '';
  if (!normalizedWorkspace) throw new TypeError('A workspace is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs must be a positive number');
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

function httpError(status) {
  if (status === 400) return new AspNetApiError('The request was not accepted.', { status, code: 'INVALID_REQUEST' });
  if (status === 401) return new AspNetApiError('The student code could not be verified.', { status, code: 'UNAUTHORIZED' });
  if (status === 403) return new AspNetApiError('Access is forbidden.', { status, code: 'FORBIDDEN' });
  if (status === 404) return new AspNetApiError('The requested service was not found.', { status, code: 'NOT_FOUND' });
  if (status === 429) return new AspNetApiError('Too many requests. Try again later.', { status, code: 'RATE_LIMITED' });
  if (status >= 500) return new AspNetApiError('The service is temporarily unavailable.', { status, code: 'SERVER_ERROR' });
  return new AspNetApiError('The request failed.', { status, code: 'HTTP_ERROR' });
}

export function createAspNetApiClient({ baseUrl, workspace, fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  const config = validateConfig({ baseUrl, workspace, fetchImpl, timeoutMs });

  async function validateStudentCode(code) {
    if (typeof code !== 'string' || !code.trim()) throw new TypeError('A student code is required');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${config.baseUrl}${SESSION_PATH}`, {
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

  return { validateStudentCode };
}
