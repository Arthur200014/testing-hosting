import { createAspNetTestAttemptApi, platformApi } from './platform-api.js';
import { createStudentJsonpTransport } from './realtime-auth.js';
import { createRealtimeIdentityAdapter } from './identity-store.js';
import { createResultOutbox } from './result-outbox.js';
import { createRealtimeResultQueue, createRealtimeNestedResultQueue } from './realtime-result-queue.js';

export function createBrowserDataProvider({ api = platformApi } = {}) {
  if (!api) throw new TypeError('A data API is required');
  return {
    api,
    createStudentAuth: options => createStudentJsonpTransport(options),
    createIdentity: options => createRealtimeIdentityAdapter(options),
    createResultQueue({ format = 'nested', ...options }) {
      if (format === 'nested') return createRealtimeNestedResultQueue(options);
      if (format === 'flat') return createRealtimeResultQueue(options);
      if (format === 'outbox') return createResultOutbox(options);
      throw new TypeError('Unknown result queue format: ' + format);
    }
  };
}

export const browserDataProvider = createBrowserDataProvider();

export function createAspNetTestAttemptDataProvider(options = {}) {
  return createBrowserDataProvider({ api: createAspNetTestAttemptApi(options) });
}

export function createPlatformData({ provider = browserDataProvider, api = provider.api,
  studentAuth = {}, identity = null, resultQueue = null } = {}) {
  if (!api) throw new TypeError('A data API is required');
  const bind = name => typeof api[name] === 'function' ? api[name].bind(api) : undefined;
  const createIdentity = options => provider.createIdentity(options);
  const createResultQueue = options => provider.createResultQueue({ api, ...options });

  // Methods remain the underlying API methods: the facade does not rebuild or
  // reinterpret request payloads and responses.
  return {
    api,
    url: api.url,
    verifyTeacher: bind('verifyTeacher'),
    validateStudentCode: bind('validateStudentCode'),
    submitResult: bind('submitResult'),
    sendResultOnExit: bind('sendResultOnExit'),
    studentAuth: studentAuth === false ? null : provider.createStudentAuth({ api, ...studentAuth }),
    identity: identity ? createIdentity(identity) : null,
    results: resultQueue ? createResultQueue(resultQueue) : null,
    createIdentity,
    createResultQueue
  };
}
