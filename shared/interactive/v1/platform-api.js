import { createAspNetApiClient } from './aspnet-api-client.js';
import { createLegacyApiClient } from './legacy-api-client.js';

const legacyPlatformApi = createLegacyApiClient({
  url: 'https://script.google.com/macros/s/AKfycbw6iYfojO8VgkHU63peD2vWLybGyDm9AsYZ6TaLA_EFD4j56nQlY5SqpRANPVeTwVsj/exec',
  teacherCodeHash: 'b0a83a3919eba1d2a99034f2d94e5a47590f1710595c04bd64b5c8f21456a7c6'
});

// Production remains on the legacy provider until an explicit cutover task.
export const platformApi = legacyPlatformApi;

function browserStudentCode() {
  try { return globalThis.localStorage?.getItem('egeStudentCode') || ''; } catch { return ''; }
}

export function createAspNetTestAttemptApi({ baseUrl, workspace, fetchImpl = globalThis.fetch,
  timeoutMs = 15000, getStudentCode = browserStudentCode, legacyApi = legacyPlatformApi, now } = {}) {
  if (!legacyApi || typeof legacyApi !== 'object') throw new TypeError('A legacy API is required');
  const aspNet = createAspNetApiClient({ baseUrl, workspace, fetchImpl, timeoutMs, getStudentCode, now });
  const bindLegacy = name => typeof legacyApi[name] === 'function' ? legacyApi[name].bind(legacyApi) : undefined;
  return {
    // Keep legacy URL/auth behavior. Only test-attempt writes are opt-in ASP.NET.
    url: legacyApi.url,
    verifyTeacher: bindLegacy('verifyTeacher'),
    validateStudentCode: bindLegacy('validateStudentCode'),
    submitResult: aspNet.submitResult,
    sendResultOnExit: aspNet.sendResultOnExit
  };
}
