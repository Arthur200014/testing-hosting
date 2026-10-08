export const MOCK_ATTEMPT_PHASES = Object.freeze({
  IN_PROGRESS: 'in_progress',
  QUEUED: 'queued',
  CONFIRMED: 'confirmed'
});

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = value => String(value ?? '').trim();
const encode = value => encodeURIComponent(clean(value));

function responseBodies(data) {
  if (!isObject(data)) return [];
  const bodies = [data];
  for (const candidate of [data.result, data.data, data.data?.result, data.result?.data, data.receipt]) {
    if (isObject(candidate) && !bodies.includes(candidate)) bodies.push(candidate);
  }
  return bodies;
}

function responseEventId(bodies) {
  return bodies.map(body => body.eventId ?? body.submissionEventId ?? body.receiptEventId)
    .map(clean)
    .find(Boolean) || '';
}

// A HTTP 200 or { ok: true } alone is not a receipt. The server must explicitly
// acknowledge the same durable event that the browser queued.
export function confirmMockSubmissionResponse(data, payload = {}) {
  const expectedEventId = clean(payload.eventId);
  const bodies = responseBodies(data);
  if (!expectedEventId || !bodies.length) throw new Error('invalid mock submission receipt');
  if (bodies.some(body => body.ok === false || body.success === false || body.error)) {
    throw new Error('mock submission was rejected');
  }
  const receipt = bodies.find(body => body.ok === true || body.success === true);
  const actualEventId = responseEventId(bodies);
  if (!receipt || actualEventId !== expectedEventId) {
    throw new Error('mock submission receipt does not match the queued event');
  }
  return data;
}

export function createMockExamPersistence({
  storage = globalThis.localStorage,
  namespace = 'mockExam:v1',
  now = () => Date.now(),
  queueLimit = 100
} = {}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new TypeError('storage with getItem/setItem is required');
  }

  const outboxKey = `${namespace}:outbox`;
  const readJson = (key, fallback) => {
    try {
      const raw = storage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  };
  const writeJson = (key, value) => {
    const serialized = JSON.stringify(value);
    storage.setItem(key, serialized);
    if (storage.getItem(key) !== serialized) throw new Error('mock exam state was not persisted');
  };

  const identity = value => {
    const programId = clean(value?.programId);
    const studentKey = clean(value?.studentId || value?.studentCode || value?.studentKey).toUpperCase();
    if (!programId || !studentKey) throw new TypeError('programId and student identity are required');
    return { programId, studentKey };
  };
  const attemptKey = value => {
    const { programId, studentKey } = identity(value);
    const variantId = clean(value?.variantId);
    if (!variantId) throw new TypeError('variantId is required');
    return `${namespace}:attempt:${encode(programId)}:${encode(studentKey)}:${encode(variantId)}`;
  };
  const pointerKey = value => {
    const { programId, studentKey } = identity(value);
    return `${namespace}:current:${encode(programId)}:${encode(studentKey)}`;
  };

  const loadAttempt = value => {
    const item = readJson(attemptKey(value), null);
    return isObject(item) ? item : null;
  };

  const saveAttempt = value => {
    const key = attemptKey(value);
    const current = readJson(key, null);
    const eventId = clean(current?.eventId || value?.eventId);
    if (!eventId) throw new TypeError('eventId is required');
    const { programId, studentKey } = identity(value);
    const variantId = clean(value.variantId);
    const snapshot = {
      ...(isObject(current) ? current : {}),
      ...value,
      programId,
      studentKey,
      variantId,
      eventId,
      answers: isObject(value.answers) || Array.isArray(value.answers)
        ? structuredClone(value.answers)
        : (current?.answers ?? {}),
      phase: Object.values(MOCK_ATTEMPT_PHASES).includes(value.phase)
        ? value.phase
        : (current?.phase || MOCK_ATTEMPT_PHASES.IN_PROGRESS),
      updatedAt: now()
    };
    writeJson(key, snapshot);
    writeJson(pointerKey(snapshot), { variantId, eventId });
    return snapshot;
  };

  const loadCurrent = value => {
    const pointer = readJson(pointerKey(value), null);
    if (!isObject(pointer) || !clean(pointer.variantId)) return null;
    return loadAttempt({ ...value, variantId: pointer.variantId });
  };

  const readOutbox = () => {
    const items = readJson(outboxKey, []);
    return Array.isArray(items) ? items.filter(isObject) : [];
  };
  const writeOutbox = items => writeJson(outboxKey, items.slice(-queueLimit));

  const enqueue = (payload, attempt = {}) => {
    const eventId = clean(payload?.eventId);
    if (!eventId) throw new TypeError('payload.eventId is required');
    const items = readOutbox();
    const index = items.findIndex(item => clean(item.eventId) === eventId);
    const previous = index >= 0 ? items[index] : null;
    const entry = {
      eventId,
      payload: structuredClone(payload),
      attempt: isObject(attempt) ? structuredClone(attempt) : {},
      queuedAt: previous?.queuedAt || now(),
      attempts: previous?.attempts || 0,
      lastAttemptAt: previous?.lastAttemptAt || null,
      lastErrorAt: previous?.lastErrorAt || null
    };
    if (index >= 0) items[index] = entry;
    else items.push(entry);
    writeOutbox(items);
    return entry;
  };

  const queueSubmission = ({ snapshot, payload }) => {
    const { programId, studentKey } = identity(snapshot);
    const variantId = clean(snapshot?.variantId);
    // The retryable payload is the critical write. Persist it first so a later
    // attempt-state write failure can never leave a submitted result without an
    // outbox entry.
    enqueue(payload, {
      programId,
      studentKey,
      variantId
    });
    return saveAttempt({ ...snapshot, phase: MOCK_ATTEMPT_PHASES.QUEUED });
  };

  const remove = eventId => writeOutbox(readOutbox().filter(item => clean(item.eventId) !== clean(eventId)));

  const markFailure = entry => {
    const items = readOutbox();
    const index = items.findIndex(item => clean(item.eventId) === clean(entry.eventId));
    if (index < 0) return;
    items[index] = {
      ...items[index],
      attempts: Number(items[index].attempts || 0) + 1,
      lastAttemptAt: now(),
      lastErrorAt: now()
    };
    writeOutbox(items);
  };

  const markConfirmed = entry => {
    if (!isObject(entry.attempt) || !entry.attempt.variantId) return;
    const saved = loadAttempt(entry.attempt);
    if (!saved || clean(saved.eventId) !== clean(entry.eventId)) return;
    saveAttempt({
      ...saved,
      phase: MOCK_ATTEMPT_PHASES.CONFIRMED,
      submittedAt: saved.submittedAt || now(),
      confirmedAt: now()
    });
  };

  const flush = async ({ submit, confirm = confirmMockSubmissionResponse, isOnline = () => true } = {}) => {
    if (typeof submit !== 'function') throw new TypeError('submit is required');
    if (!isOnline()) return { confirmed: 0, failed: 0, pending: readOutbox().length };
    let confirmed = 0;
    let failed = 0;
    for (const entry of readOutbox()) {
      try {
        const response = await submit(structuredClone(entry.payload));
        confirm(response, entry.payload);
        // Persist confirmation before removing the retryable event. If local
        // persistence fails, the event stays queued and server-side dedupe makes
        // the next delivery safe.
        markConfirmed(entry);
        remove(entry.eventId);
        confirmed += 1;
      } catch {
        try { markFailure(entry); } catch {}
        failed += 1;
      }
    }
    return { confirmed, failed, pending: readOutbox().length };
  };

  return {
    loadAttempt,
    loadCurrent,
    saveAttempt,
    readOutbox,
    enqueue,
    queueSubmission,
    remove,
    flush
  };
}

// Installs the EGE mock page adapter without exposing transport state in the
// student interface. The large embedded page keeps rendering the exam; this
// bridge owns persistence, delivery retries and receipt validation.
export function installEgeMockPersistenceBridge({
  root = globalThis,
  diagnosticsKey = '__EGE2027_MOCK_DIAGNOSTICS__',
  programId = 'EGE_MATH',
  namespace = 'egeMock:v1',
  retryIntervalMs = 15_000
} = {}) {
  const diagnostics = root?.[diagnosticsKey];
  if (!diagnostics || typeof diagnostics.getState !== 'function') {
    throw new Error('EGE mock diagnostics are unavailable');
  }
  const storage = root.localStorage;
  const persistence = createMockExamPersistence({ storage, namespace });
  const original = {
    loadLocal: root.loadLocal,
    postResult: root.postResult,
    showResult: root.showResult
  };
  if (typeof original.loadLocal !== 'function' || typeof original.postResult !== 'function') {
    throw new Error('EGE mock persistence hooks are unavailable');
  }

  const state = () => diagnostics.getState();
  const identity = (code, variantId) => ({
    programId,
    studentCode: clean(code),
    variantId: clean(variantId)
  });
  const snapshot = (extra = {}) => {
    const current = state();
    const existing = current?.code && current?.variantId
      ? persistence.loadAttempt(identity(current.code, current.variantId))
      : null;
    return {
      programId,
      studentCode: clean(current?.code),
      variantId: clean(current?.variantId),
      variantName: clean(current?.variantName),
      assignedDate: clean(current?.assignedDate),
      seed: Number(current?.seed) || 0,
      answers: Array.isArray(current?.answers) ? [...current.answers] : [],
      durationSeconds: Number(current?.durationSeconds) || 0,
      deadlineAt: Number(current?.deadlineAt) || 0,
      startedAt: Number(current?.startedAt) || 0,
      eventId: clean(current?.eventId || existing?.eventId),
      submittedAt: Number(current?.submittedAt || existing?.submittedAt) || 0,
      student: current?.student ? structuredClone(current.student) : existing?.student,
      phase: existing?.phase,
      ...extra
    };
  };

  const phaseFor = item => item?.phase || (item?.submittedAt
    ? MOCK_ATTEMPT_PHASES.QUEUED
    : MOCK_ATTEMPT_PHASES.IN_PROGRESS);
  const migrateAttempt = (code, variantId, legacy) => {
    if (!isObject(legacy) || !clean(legacy.eventId)) return legacy;
    try {
      const waiting = persistence.readOutbox().some(entry => entry.eventId === clean(legacy.eventId));
      return persistence.saveAttempt({
        ...legacy,
        ...identity(code, variantId),
        variantId: clean(variantId),
        phase: legacy.phase || (legacy.submittedAt
          ? (waiting ? MOCK_ATTEMPT_PHASES.QUEUED : MOCK_ATTEMPT_PHASES.CONFIRMED)
          : MOCK_ATTEMPT_PHASES.IN_PROGRESS)
      });
    } catch { return legacy; }
  };

  root.loadLocal = function loadLocalWithPersistence(code, variantId) {
    const wantedVariant = clean(variantId || state()?.variantId);
    if (!clean(code) || !wantedVariant) return null;
    try {
      const saved = persistence.loadAttempt(identity(code, wantedVariant));
      if (saved) return saved;
    } catch {}
    const legacy = original.loadLocal(code, wantedVariant);
    return migrateAttempt(code, wantedVariant, legacy);
  };

  root.storeLocal = function storeLocalWithPersistence(extra = {}) {
    const current = state();
    if (!clean(current?.code) || !clean(current?.variantId) || !clean(current?.eventId)) return null;
    const next = snapshot(extra);
    next.phase = extra.phase || phaseFor(next);
    return persistence.saveAttempt(next);
  };

  const hideTransportState = () => {
    for (const id of ['saveState', 'resultSubmitState', 'popupSubmitState']) {
      const element = root.document?.getElementById(id);
      if (element) {
        element.textContent = '';
        element.hidden = true;
        element.setAttribute('aria-hidden', 'true');
      }
    }
    const login = root.document?.getElementById('loginError');
    if (login && /сохран|фон|сервер|устройств/i.test(login.textContent || '')) login.textContent = '';
  };
  root.setSaveState = hideTransportState;
  root.setResultSubmitState = hideTransportState;
  hideTransportState();

  if (typeof original.showResult === 'function') {
    root.showResult = function showResultWithoutTransportCopy(info) {
      const result = original.showResult(info);
      const lead = root.document?.getElementById('resultPopupLead');
      if (lead) {
        lead.textContent = `${info?.autoSubmitted ? 'Время истекло. ' : ''}Задания 1–13 проверены автоматически. Учитель проверит задания 14–20 и внесёт итоговый балл.`;
      }
      hideTransportState();
      return result;
    };
  }

  const legacyPendingKey = `egePendingTestResults:${clean(diagnostics.mockId)}`;
  try {
    const legacyItems = JSON.parse(storage.getItem(legacyPendingKey) || '[]');
    if (Array.isArray(legacyItems)) {
      for (const payload of legacyItems) {
        if (!clean(payload?.eventId)) continue;
        const attemptIdentity = identity(payload.studentCode || payload.studentId, payload.variantId);
        persistence.enqueue(payload, attemptIdentity);
        const legacyAttempt = original.loadLocal(payload.studentCode || payload.studentId, payload.variantId);
        migrateAttempt(payload.studentCode || payload.studentId, payload.variantId, legacyAttempt);
      }
      if (legacyItems.length) storage.removeItem(legacyPendingKey);
    }
  } catch {}

  root.pending = () => persistence.readOutbox().map(entry => structuredClone(entry.payload));
  root.writePending = items => {
    for (const payload of Array.isArray(items) ? items : []) {
      if (clean(payload?.eventId)) {
        persistence.enqueue(payload, identity(payload.studentCode || payload.studentId, payload.variantId));
      }
    }
  };
  root.queueResult = payload => {
    const current = state();
    persistence.enqueue(payload, identity(current?.code || payload?.studentCode, current?.variantId || payload?.variantId));
  };

  let flushing = null;
  const flush = () => {
    if (flushing) return flushing;
    flushing = persistence.flush({
      submit: payload => original.postResult(payload),
      isOnline: () => root.navigator?.onLine !== false
    }).finally(() => { flushing = null; hideTransportState(); });
    return flushing;
  };

  root.deliverResult = async function deliverResultDurably(payload) {
    const current = state();
    const result = current?.code && current?.variantId
      ? persistence.loadAttempt(identity(current.code, current.variantId))?.result
      : undefined;
    persistence.queueSubmission({
      snapshot: snapshot({
        submittedAt: Number(current?.submittedAt) || Date.now(),
        result,
        phase: MOCK_ATTEMPT_PHASES.QUEUED
      }),
      payload
    });
    await flush();
    return !persistence.readOutbox().some(entry => entry.eventId === payload.eventId);
  };
  root.flushPending = flush;

  const retry = () => {
    if (root.document?.visibilityState === 'hidden') return;
    if (persistence.readOutbox().length) void flush();
  };
  root.addEventListener?.('online', retry);
  root.addEventListener?.('focus', retry);
  root.addEventListener?.('pageshow', retry);
  root.document?.addEventListener?.('visibilitychange', retry);
  const timer = root.setInterval?.(retry, retryIntervalMs);
  root.addEventListener?.('pagehide', () => root.clearInterval?.(timer), { once: true });

  const api = {
    persistence,
    flush,
    snapshot,
    ready: true,
    dispose() {
      root.clearInterval?.(timer);
      root.removeEventListener?.('online', retry);
      root.removeEventListener?.('focus', retry);
      root.removeEventListener?.('pageshow', retry);
      root.document?.removeEventListener?.('visibilitychange', retry);
    }
  };
  root.__EGE_MOCK_PERSISTENCE__ = api;
  retry();
  return api;
}
