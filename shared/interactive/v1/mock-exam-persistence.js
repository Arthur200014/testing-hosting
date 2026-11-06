import {
  convertedMockPayload,
  convertedMockResult,
  mockScoreSummary
} from './mock-score-conversion.js';

export const MOCK_ATTEMPT_PHASES = Object.freeze({
  IN_PROGRESS: 'in_progress',
  QUEUED: 'queued',
  CONFIRMED: 'confirmed'
});

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = value => String(value ?? '').trim();
const encode = value => encodeURIComponent(clean(value));

function hideAlreadySubmittedNotice(root) {
  root.document?.getElementById('mockSubmittedOverlay')?.classList?.add('hidden');
}

function showAlreadySubmittedNotice(root, programId = '', score = {}) {
  const document = root.document;
  if (!document?.createElement) return null;
  let overlay = document.getElementById('mockSubmittedOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mockSubmittedOverlay';
    overlay.className = 'overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'mockSubmittedTitle');
    const modal = document.createElement('section');
    modal.className = 'modal';
    const title = document.createElement('h2');
    title.id = 'mockSubmittedTitle';
    title.textContent = 'Пробник уже сдан';
    const copy = document.createElement('p');
    copy.textContent = 'Повторная отправка недоступна. Чтобы войти под другим кодом, нажмите «Сменить ученика» сверху.';
    const summary = document.createElement('p');
    summary.dataset.mockScoreSummary = 'true';
    summary.style.fontWeight = '900';
    modal.append(title, copy);
    modal.append(summary);
    overlay.append(modal);
    document.body?.append(overlay);
  }
  const summary = overlay.querySelector?.('[data-mock-score-summary]');
  if (summary) {
    summary.textContent = mockScoreSummary(programId, score);
    summary.hidden = !summary.textContent;
  }
  overlay.classList.remove('hidden');
  return overlay;
}

function showPendingCompletion(root, eventId) {
  const document = root.document;
  if (!document?.createElement) return;
  let overlay = document.getElementById('mockPendingOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mockPendingOverlay';
    overlay.className = 'overlay';
    const modal = document.createElement('section');
    modal.className = 'modal';
    const title = document.createElement('h2');
    title.textContent = 'Работа завершена';
    const copy = document.createElement('p');
    copy.textContent = 'Ответы сохранены. Итог появится после подтверждения сдачи.';
    modal.append(title, copy);
    overlay.append(modal);
    document.body?.append(overlay);
  }
  document.getElementById('loginOverlay')?.classList?.add('hidden');
  overlay.dataset.eventId = clean(eventId);
  overlay.classList.remove('hidden');
}

function numberOrNull(value) {
  if (value === null || value === undefined || clean(value) === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function lookupAnswers(value) {
  if (Array.isArray(value) || isObject(value)) return structuredClone(value);
  const text = clean(value);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) || isObject(parsed) ? parsed : null;
  } catch { return null; }
}

function hasLookupAnswers(value) {
  return (Array.isArray(value) && value.length > 0)
    || (isObject(value) && Object.keys(value).length > 0);
}

function serverResult(programId, lookupResult = {}, localResult = {}) {
  const primary = numberOrNull(lookupResult.primaryScore);
  if (primary === null) return localResult;
  return convertedMockResult(programId, {
    ...localResult,
    primary,
    maxPrimary: numberOrNull(lookupResult.maxPrimaryScore) || localResult.maxPrimary,
    scorePercent: numberOrNull(lookupResult.scorePercent) ?? localResult.scorePercent,
    testScore: numberOrNull(lookupResult.testScore) ?? localResult.testScore,
    gradeMark: numberOrNull(lookupResult.gradeMark) ?? localResult.gradeMark
  });
}

function updateSavedServerResult(persistence, saved, lookupResult, programId) {
  if (!saved) return null;
  const result = serverResult(programId, lookupResult, saved.result || {});
  if (result === saved.result) return saved;
  return persistence.saveAttempt({ ...saved, result });
}

function reopenUnsubmittedAttempt(persistence, saved, identity, durationSeconds) {
  const startedAt = Date.now();
  const duration = Math.max(60, Number(durationSeconds) || 0);
  return persistence.saveAttempt({
    ...saved,
    ...identity,
    eventId: clean(saved?.eventId || identity.eventId),
    phase: MOCK_ATTEMPT_PHASES.IN_PROGRESS,
    startedAt,
    deadlineAt: startedAt + duration * 1000,
    submittedAt: 0,
    confirmedAt: 0,
    result: null,
    serverVerifiedNoSubmission: true
  });
}

function ensureResultMetric(document, containerSelector, metricClass, id) {
  const container = document?.querySelector?.(containerSelector);
  if (!container) return null;
  container.style.gridTemplateColumns = 'repeat(auto-fit,minmax(130px,1fr))';
  let metric = document.getElementById(id);
  if (!metric) {
    const wrapper = document.createElement('div');
    wrapper.className = metricClass;
    metric = document.createElement('b');
    metric.id = id;
    const label = document.createElement('span');
    label.dataset.convertedScoreLabel = 'true';
    wrapper.append(metric, label);
    container.append(wrapper);
  }
  return metric;
}

function renderConvertedStudentResult(root, programId, value = {}) {
  const result = convertedMockResult(programId, value);
  if (programId === 'EGE_MATH') {
    const primary = root.document?.getElementById('popupPrimary');
    if (primary) primary.textContent = `${result.primary} из ${result.maxPrimary}`;
    const metric = ensureResultMetric(root.document, '.popup-metrics', 'popup-metric', 'popupConvertedScore');
    if (metric) {
      metric.textContent = `${result.testScore} из 100`;
      metric.parentElement.querySelector('[data-converted-score-label]').textContent = result.finalized
        ? 'тестовый балл'
        : 'предварительный балл';
    }
  } else if (programId === 'OGE_MATH') {
    const primary = root.document?.getElementById('resultPrimary');
    if (primary) primary.textContent = `${result.primary} / ${result.maxPrimary}`;
    const metric = ensureResultMetric(root.document, '.metrics', 'metric', 'resultGradeMark');
    if (metric) {
      metric.textContent = String(result.gradeMark);
      metric.parentElement.querySelector('[data-converted-score-label]').textContent = result.finalized
        ? 'итоговая оценка'
        : 'предварительная оценка';
    }
  }
  return result;
}

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

function responseIdentityMatches(data, payload) {
  const bodies = responseBodies(data);
  const expectedStudent = clean(payload.studentId || payload.studentCode || payload.studentKey).toUpperCase();
  const expectedMock = clean(payload.mockId);
  const expectedProgram = clean(payload.programId);
  const identityValue = (body, names) => names.map(name => clean(body[name])).find(Boolean);
  return bodies.some(body => {
    const student = identityValue(body, ['studentId', 'studentCode', 'studentKey']).toUpperCase();
    const mock = identityValue(body, ['mockId']);
    const program = identityValue(body, ['programId']);
    return Boolean(expectedStudent && expectedMock
      && student === expectedStudent && mock === expectedMock
      && (!program || program === expectedProgram));
  });
}

// FNV-1a over UTF-16 code units is deliberately synchronous and available in
// older browsers. Two independently seeded lanes make collisions vanishingly
// unlikely while keeping the ID stable across devices and page reloads.
function hashSlot(text, seed) {
  let hash = BigInt.asUintN(64, seed);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

export function stableMockSubmissionEventId({
  studentId, studentCode, studentKey, programId, mockId, variantId
} = {}) {
  // The canonical server-issued studentId must win over either accepted login
  // credential. Otherwise the same student could obtain two event IDs by using
  // inviteCode on one device and studentId on another.
  const student = clean(studentId || studentKey || studentCode).toUpperCase();
  const program = clean(programId);
  const slot = clean(mockId || variantId);
  if (!student || !program || !slot) throw new TypeError('student, programId, and mockId or variantId are required');
  const canonical = JSON.stringify([student, program, slot]);
  return `mock_${hashSlot(canonical, 0xcbf29ce484222325n)}${hashSlot(canonical, 0x84222325cbf29ce4n)}`;
}

export function createMockSubmissionLookup({
  url = 'https://docs.google.com/spreadsheets/d/1TTwFlfhYPy4T4J_obqPUSLE1IpkExS_orLmEJ8JxM0k/gviz/tq',
  root = globalThis, document = root?.document, timeoutMs = 10_000,
  sheetName = 'Пробники'
} = {}) {
  if (!clean(url)) throw new TypeError('lookup url is required');
  if (!document?.createElement || !document?.head?.appendChild) throw new TypeError('document with head is required');
  let sequence = 0;
  return async ({ studentId, programId, mockId } = {}) => {
    const student = clean(studentId);
    const program = clean(programId);
    const mock = clean(mockId);
    if (!student || !program || !mock) throw new TypeError('studentId, programId, and mockId are required');
    const quote = value => clean(value).replaceAll("'", "''");
    const where = `where B='${quote(student)}' and C='${quote(mock)}' and K='${quote(program)}' order by I desc limit 1`;
    const request = tq => new Promise((resolve, reject) => {
      const callback = `__mockLookup_${Date.now()}_${++sequence}`;
      const script = document.createElement('script');
      let settled = false;
      const cleanup = () => {
        root.clearTimeout?.(timer);
        try { delete root[callback]; } catch { root[callback] = undefined; }
        script.onerror = null;
        script.remove?.();
        if (script.parentNode?.removeChild) script.parentNode.removeChild(script);
      };
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        error ? reject(error) : resolve(value);
      };
      const timer = root.setTimeout(() => finish(new Error('mock submission lookup timed out')), timeoutMs);
      root[callback] = data => {
        if (!isObject(data) || data.status !== 'ok' || !isObject(data.table)) {
          const error = new Error('mock submission lookup failed');
          const errors = Array.isArray(data?.errors) ? data.errors : [];
          if (errors.some(item => clean(item?.reason) === 'invalid_query')
              || JSON.stringify(data || {}).includes('NO_COLUMN: O')) {
            error.code = 'MOCK_EXTENDED_LOOKUP_UNAVAILABLE';
          }
          return finish(error);
        }
        finish(null, Array.isArray(data.table.rows) ? data.table.rows[0] || null : null);
      };
      script.onerror = () => finish(new Error('mock submission lookup failed'));
      const query = new URLSearchParams({
        sheet: sheetName,
        headers: '1',
        tq,
        tqx: `out:json;responseHandler:${callback}`,
        _: `${Date.now()}-${sequence}`
      });
      script.src = `${url}${url.includes('?') ? '&' : '?'}${query.toString()}`;
      document.head.appendChild(script);
    });
    let row;
    let includesAnswers = true;
    try {
      row = await request(`select A,B,C,K,F,G,L,M,N,I,O ${where}`);
    } catch (error) {
      if (error?.code !== 'MOCK_EXTENDED_LOOKUP_UNAVAILABLE') throw error;
      includesAnswers = false;
      row = await request(`select A,B,C,K,F,G,L,M,N ${where}`);
    }
    const values = Array.isArray(row?.c) ? row.c.map(cell => cell?.v ?? '') : [];
    return row ? {
        submitted: true,
        eventId: clean(values[0]),
        studentId: clean(values[1]) || student,
        mockId: clean(values[2]) || mock,
        programId: clean(values[3]) || program,
        testScore: numberOrNull(values[4]),
        primaryScore: numberOrNull(values[5]),
        gradeMark: numberOrNull(values[6]),
        maxPrimaryScore: numberOrNull(values[7]),
        scorePercent: numberOrNull(values[8]),
        submittedAt: includesAnswers ? clean(values[9]) : '',
        answers: includesAnswers ? lookupAnswers(values[10]) : null
      } : { submitted: false, studentId: student, mockId: mock, programId: program };
  };
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
  const previous = bodies.find(body => body.alreadySubmitted === true);
  if (previous) {
    if (!responseIdentityMatches(data, payload)) throw new Error('prior submission receipt identity does not match the queued event');
    return data;
  }
  const receipt = bodies.find(body => body.ok === true || body.success === true);
  const actualEventId = responseEventId(bodies);
  if (!receipt || actualEventId !== expectedEventId) {
    throw new Error('mock submission receipt does not match the queued event');
  }
  return data;
}

function lookupHasSubmission(value) {
  return value === true || value?.submitted === true || value?.alreadySubmitted === true;
}

function priorSubmissionReceipt(payload, lookupResult = {}) {
  return {
    ok: true,
    alreadySubmitted: true,
    eventId: clean(lookupResult.eventId || payload.eventId),
    studentId: clean(lookupResult.studentId || payload.studentId || payload.studentCode || payload.studentKey),
    mockId: clean(lookupResult.mockId || payload.mockId),
    programId: clean(lookupResult.programId || payload.programId)
  };
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
    const studentKey = clean(value?.studentKey || value?.studentCode || value?.studentId).toUpperCase();
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

  const rekeyAttempt = (value, eventId) => {
    const saved = loadAttempt(value);
    if (!saved || saved.phase !== MOCK_ATTEMPT_PHASES.IN_PROGRESS) return saved;
    const nextId = clean(eventId);
    if (!nextId) throw new TypeError('eventId is required');
    const rekeyed = { ...saved, eventId: nextId, phase: MOCK_ATTEMPT_PHASES.IN_PROGRESS, updatedAt: now() };
    writeJson(attemptKey(rekeyed), rekeyed);
    writeJson(pointerKey(rekeyed), { variantId: rekeyed.variantId, eventId: nextId });
    return rekeyed;
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
    rekeyAttempt,
    readOutbox,
    enqueue,
    queueSubmission,
    remove,
    flush
  };
}

function installMockExamUxFixes(root, programId) {
  try {
    if (!root?.document || root.__MOCK_UX_FIXES_20261107__) return;
    root.__MOCK_UX_FIXES_20261107__ = true;
    const doc = root.document;
    const css = doc.createElement('style');
    css.id = 'mock-ux-fixes-20261107';
    if (programId === 'EGE_MATH') {
      css.textContent = `
        /* Screenshot diagrams are part of the actual task; do not shrink them to 46–88px. */
        #shotPage1 .shot-column:first-child .shot-task:nth-child(2) .mini-diagram,
        #shotPage1 .shot-column:nth-child(2) .shot-task:nth-child(4) .mini-diagram {
          max-height: 174px !important; min-height: 142px !important;
          overflow: visible !important; padding: 2px 0 !important;
        }
        #shotPage1 .shot-column:first-child .shot-task:nth-child(2) .mini-diagram svg,
        #shotPage1 .shot-column:first-child .shot-task:nth-child(2) .mini-diagram img,
        #shotPage1 .shot-column:nth-child(2) .shot-task:nth-child(4) .mini-diagram svg,
        #shotPage1 .shot-column:nth-child(2) .shot-task:nth-child(4) .mini-diagram img {
          display: block !important; width: auto !important;
          max-width: 100% !important; height: 164px !important;
          max-height: 164px !important; margin: 2px auto !important;
          object-fit: contain !important;
        }
        #shotPage1 .shot-column:first-child .shot-task:nth-child(2),
        #shotPage1 .shot-column:nth-child(2) .shot-task:nth-child(4) {
          overflow: visible !important; color: #161616 !important;
        }
      `;
    } else if (programId === 'OGE_MATH') {
      css.textContent = `
        /* Bank tasks use near-white text on dark previews. Restore black text on the white screenshot. */
        #shotPage .shot-p2 .shot-task, #shotPage .shot-p2 .bank-body,
        #shotPage .shot-p2 .bank-body p, #shotPage .shot-p2 .bank-formula,
        #shotPage .shot-p2 .bank-body b, #shotPage .shot-p2 .bank-body span {
          color: #171717 !important; opacity: 1 !important;
          visibility: visible !important; filter: none !important;
        }
        #shotPage .shot-p2 .shot-task { background: #fff !important; }
        #shotPage .shot-p2 .bank-body { font-size: 16px !important; line-height: 1.4 !important; }
        #shotPage .shot-p2 { overflow: visible !important; }
      `;
    }
    doc.head?.append(css);

    if (programId === 'EGE_MATH') {
      // The old button reloaded the inner iframe, and the shell auto-entered
      // with its remembered code. Exit the shell session instead.
      doc.addEventListener('click', event => {
        const button = event.target?.closest?.('[data-new-attempt]');
        if (!button) return;
        let shell = null;
        try {
          shell = root.parent;
          if (!shell || shell === root || typeof shell.setHome !== 'function') return;
        } catch (_) { return; }
        event.preventDefault();
        event.stopImmediatePropagation();
        shell.setHome(true);
        const field = shell.document?.getElementById('shellStudentCode');
        if (field) field.value = '';
        shell.studentOpen?.();
      }, true);

      // Show the actual calculations supplied by the chosen task instead of
      // boilerplate "understand the question / select a method / verify".
      function displayConcreteEgeSolutions() {
        const current = root.__EGE2027_MOCK_DIAGNOSTICS__?.getState?.();
        if (!Array.isArray(current?.questions)) return;
        current.questions.forEach((q, index) => {
          const box = doc.getElementById('reviewSolutionV15-' + index);
          const list = box?.querySelector('.solution-steps-v13');
          if (!list) return;
          let raw = String(q?.explain || '').trim();
          if (String(q?.prototypeId || '') === 'EGE-11-003' &&
              /90/.test(String(q?.text || '')) && /5/.test(String(q?.text || ''))) {
            raw = '<p>Пусть \\(x\\) л/мин — производительность первой трубы. Тогда у второй \\(x+5\\) л/мин.</p>'
              + '<p>Первая заполняет 90 л за \\(\\frac{90}{x}\\) мин, вторая — за \\(\\frac{90}{x+5}\\) мин. '
              + 'Разница времени 3 минуты: \\[\\frac{90}{x}-\\frac{90}{x+5}=3.\\]</p>'
              + '<p>Умножаем на \\(x(x+5)\\): \\[90(x+5)-90x=3x(x+5),\\quad 450=3x^2+15x.\\]</p>'
              + '<p>Делим на 3: \\[x^2+5x-150=0,\\quad (x-10)(x+15)=0.\\]</p>'
              + '<p>\\(x=10\\) или \\(x=-15\\). Скорость положительна, поэтому \\(x=10\\).</p>';
          }
          if (!raw) {
            // Keep genuine ready-made solutions, but not abstract fallback steps.
            const steps = [...list.querySelectorAll('.solution-step-v13')];
            for (const step of steps) {
              if (/Разбираем условие|Выбираем способ|Выбираем ключевое свойство|Объясняем применение|Проверяем итог|Аккуратно выполняем преобразования/i.test(step.textContent || '')) {
                step.remove();
              }
            }
            if (!list.querySelector('.solution-step-v13')) {
              list.textContent = 'Для этого задания пока нет проверенного разбора с вычислениями.';
            }
            return;
          }
          raw = raw.replace(/<b>\s*Ответ:\s*[^<]*<\/b>/gi, '').trim();
          const numbered = /<b>\s*\d+\.\s*/.test(raw);
          const fragments = numbered
            ? raw.split(/(?=<b>\s*\d+\.\s*)/gi)
            : (/<\/p>\s*<p/i.test(raw)
                ? raw.split(/(?=<p(?:\s|>))/gi)
                : (/<br\s*\/?>/i.test(raw) ? raw.split(/<br\s*\/?>/gi) : [raw]));
          const cleanSteps = fragments.map(x => x.trim()).filter(x => x && x !== '</p>' && !/^<p>\s*<\/p>$/.test(x));
          list.innerHTML = (cleanSteps.length ? cleanSteps : [raw])
            .map(x => '<div class="solution-step-v13"><div class="solution-step-content-v13">' + x + '</div></div>').join('');
        });
      }
      doc.addEventListener('click', event => {
        if (event.target?.closest?.('#resultReviewBtn')) displayConcreteEgeSolutions();
      });
    } else if (programId === 'OGE_MATH') {
      doc.addEventListener('click', event => {
        if (!event.target?.closest?.('#reviewOpen')) return;
        doc.querySelectorAll('.review-card .solution-box').forEach(box => {
          const html = box.innerHTML || '';
          if (/Шаг 1\.<\/b>.*(?:Разбираем условие|Читаем условие|выполняем вычисления).*Шаг 2\.<\/b>.*(?:Проверяем единицы|формат записи)/is.test(html)) {
            box.textContent = 'Для этого прототипа пока нет проверенного решения с вычислениями.';
          }
        });
      });
    }
  } catch (error) {
    root?.console?.warn?.('Mock exam UX fixes could not be installed', error);
  }
}

// Installs the EGE mock page adapter without exposing transport state in the
// student interface. The large embedded page keeps rendering the exam; this
// bridge owns persistence, delivery retries and receipt validation.
export function installEgeMockPersistenceBridge({
  root = globalThis,
  diagnosticsKey = '__EGE2027_MOCK_DIAGNOSTICS__',
  programId = 'EGE_MATH',
  namespace = 'egeMock:v1',
  retryIntervalMs = 15_000,
  lookup,
  lookupUrl,
  lookupTimeoutMs = 10_000
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
    showResult: root.showResult,
    validateStudentCode: root.validateStudentCode
  };
  if (typeof original.loadLocal !== 'function' || typeof original.postResult !== 'function') {
    throw new Error('EGE mock persistence hooks are unavailable');
  }
  let canonicalStudentId = '';

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
  let priorLookup = lookup;
  if (typeof priorLookup !== 'function') {
    priorLookup = createMockSubmissionLookup({
      ...(clean(lookupUrl) ? { url: lookupUrl } : {}),
      root,
      document: root.document,
      timeoutMs: lookupTimeoutMs
    });
  }
  const submissionIdentity = (payload = {}) => {
    const current = state() || {};
    const studentCode = clean(payload.studentCode || current.code);
    const studentId = clean(canonicalStudentId
      || (payload.awaitingCanonicalIdentity ? '' : payload.studentId));
    const variantId = clean(payload.variantId || current.variantId);
    const mockId = clean(payload.mockId || (variantId ? `EGE2027-MOCK-${variantId}` : ''));
    return { studentId, studentCode, studentKey: studentCode, programId, mockId, variantId };
  };
  const canonicalizeCurrentAttempt = () => {
    const current = state() || {};
    const ids = submissionIdentity({ studentId: canonicalStudentId });
    if (!canonicalStudentId || !ids.variantId || !current.code) return ids;
    const eventId = stableMockSubmissionEventId(ids);
    current.eventId = eventId;
    try { persistence.rekeyAttempt(identity(current.code, ids.variantId), eventId); } catch {}
    return { ...ids, eventId };
  };
  let canonicalRequest = null;
  const acquireCanonicalIdentity = code => {
    if (canonicalStudentId) return Promise.resolve(canonicalizeCurrentAttempt());
    if (canonicalRequest) return canonicalRequest;
    canonicalRequest = Promise.resolve(original.validateStudentCode(clean(code || state()?.code)))
      .then(student => {
        canonicalStudentId = clean(student?.studentId || student?.id);
        if (!canonicalStudentId) throw new Error('canonical student identity is unavailable');
        const current = state();
        if (current) {
          current.student = student;
          current.verified = true;
        }
        return canonicalizeCurrentAttempt();
      })
      .finally(() => { canonicalRequest = null; });
    return canonicalRequest;
  };
  const lookupPrior = async payload => {
    const ids = submissionIdentity(payload);
    if (!ids.studentId || !ids.mockId) throw new Error('mock submission identity is unavailable');
    return priorLookup({ studentId: ids.studentId, programId, mockId: ids.mockId });
  };
  let lockedByPriorSubmission = false;
  const lockAlreadySubmitted = (lookupResult = {}) => {
    lockedByPriorSubmission = true;
    const current = state();
    let saved = current?.code && current?.variantId
      ? persistence.loadAttempt(identity(current.code, current.variantId))
      : null;
    saved = updateSavedServerResult(persistence, saved, lookupResult, programId) || saved;
    if (current) {
      current.finished = true;
      root.clearInterval?.(current.timerId);
    }
    // Server answers are newer than a previously confirmed local snapshot.
    // This matters for devices that stored the score before answersJson was
    // deployed: keeping that stale snapshot would render every task as wrong.
    if (current && hasLookupAnswers(lookupResult.answers)) {
      const answers = Array.isArray(lookupResult.answers)
        ? [...lookupResult.answers]
        : Object.values(lookupResult.answers);
      answers.forEach((value, index) => {
        const input = root.document?.getElementById(`answer-${index + 1}`);
        if (!input) return;
        input.value = clean(value);
        input.dispatchEvent?.(new root.Event('input', { bubbles: true }));
      });
      root.document?.querySelectorAll?.('[id^="answer-"]')?.forEach(input => {
        input.readOnly = true;
        input.setAttribute?.('aria-readonly', 'true');
      });
      const result = serverResult(programId, lookupResult, saved?.result || {});
      const submittedAt = Date.parse(lookupResult.submittedAt) || Date.now();
      current.answers = answers;
      current.submittedAt = submittedAt;
      current.finished = true;
      try {
        saved = persistence.saveAttempt(snapshot({
          answers,
          result,
          submittedAt,
          phase: MOCK_ATTEMPT_PHASES.CONFIRMED
        }));
      } catch {}
      hideAlreadySubmittedNotice(root);
      root.document?.getElementById('loginOverlay')?.classList?.add('hidden');
      if (typeof root.showResult === 'function') root.showResult(saved?.result || result);
      return;
    }
    const keepCompletedResult = Boolean(current?.finished && saved?.submittedAt && saved?.result);
    // A confirmed attempt may already have been restored from local storage.
    // When the server has no detailed answers, keep that local review instead
    // of replacing the visible result with a second login screen.
    if (keepCompletedResult) {
      hideAlreadySubmittedNotice(root);
      root.document?.getElementById('loginOverlay')?.classList?.add('hidden');
      if (typeof root.showResult === 'function') root.showResult(saved.result);
      return;
    }
    for (const id of ['exam', 'topbar', 'result', 'resultOverlay', 'confirmOverlay']) {
      root.document?.getElementById(id)?.classList?.add('hidden');
    }
    root.document?.getElementById('loginOverlay')?.classList?.add('hidden');
    showAlreadySubmittedNotice(root, programId, lookupResult);
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


  const verifyStoredCompletion = async (code, variantId, durationSeconds) => {
    const key = identity(code, variantId);
    const saved = persistence.loadAttempt(key) || original.loadLocal(code, variantId);
    if (!saved?.submittedAt) return;
    await acquireCanonicalIdentity(code);
    const pending = persistence.readOutbox().some(entry => entry.eventId === saved.eventId);
    let found;
    try {
      found = await priorLookup({
        studentId: canonicalStudentId,
        programId,
        mockId: `EGE2027-MOCK-${clean(variantId)}`
      });
    } catch (error) {
      if (pending) return 'pending';
      throw error;
    }
    if (lookupHasSubmission(found)) return;
    if (pending) return 'pending';
    reopenUnsubmittedAttempt(persistence, saved, {
      ...key,
      eventId: clean(saved.eventId) || stableMockSubmissionEventId({
        studentId: canonicalStudentId, programId, mockId: `EGE2027-MOCK-${clean(variantId)}`
      })
    }, durationSeconds);
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
      renderConvertedStudentResult(root, programId, info);
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

  const deliveryResponses = new Map();
  const guardedPost = async payload => {
    const wasAwaitingIdentity = payload.awaitingCanonicalIdentity === true;
    if (!canonicalStudentId) await acquireCanonicalIdentity(payload.studentCode);
    const ids = submissionIdentity({ ...payload, studentId: canonicalStudentId, awaitingCanonicalIdentity: false });
    const canonicalPayload = {
      ...payload,
      ...ids,
      eventId: stableMockSubmissionEventId(ids)
    };
    delete canonicalPayload.awaitingCanonicalIdentity;
    const found = await lookupPrior(canonicalPayload);
    if (lookupHasSubmission(found)) {
      const receipt = priorSubmissionReceipt(payload, wasAwaitingIdentity ? {
        ...found,
        eventId: payload.eventId,
        studentId: payload.studentCode
      } : found);
      deliveryResponses.set(clean(payload.eventId), receipt);
      return receipt;
    }
    const response = await original.postResult(canonicalPayload);
    confirmMockSubmissionResponse(response, canonicalPayload);
    const localReceipt = wasAwaitingIdentity
      ? { ok: true, eventId: payload.eventId }
      : response;
    deliveryResponses.set(clean(payload.eventId), localReceipt);
    return localReceipt;
  };
  let flushing = null;
  const flush = () => {
    if (flushing) return flushing;
    flushing = persistence.flush({
      submit: guardedPost,
      isOnline: () => root.navigator?.onLine !== false
    }).finally(() => { flushing = null; hideTransportState(); });
    return flushing;
  };

  root.deliverResult = async function deliverResultDurably(payload) {
    const current = state();
    const awaitingCanonicalIdentity = !canonicalStudentId;
    const ids = submissionIdentity({ ...payload, awaitingCanonicalIdentity });
    const eventId = stableMockSubmissionEventId(ids);
    if (current) current.eventId = eventId;
    try { persistence.rekeyAttempt(identity(current?.code || ids.studentCode, current?.variantId || ids.variantId), eventId); } catch {}
    const durablePayload = convertedMockPayload(programId, {
      ...payload,
      ...ids,
      programId,
      eventId,
      ...(awaitingCanonicalIdentity ? { studentId: '', awaitingCanonicalIdentity: true } : {})
    });
    const savedResult = current?.code && current?.variantId
      ? persistence.loadAttempt(identity(current.code, current.variantId))?.result
      : undefined;
    const result = convertedMockResult(programId, {
      ...savedResult,
      primary: durablePayload.primaryScore,
      maxPrimary: durablePayload.maxPrimaryScore,
      scorePercent: durablePayload.scorePercent,
      testScore: durablePayload.testScore,
      durationSeconds: durablePayload.durationSeconds,
      autoSubmitted: Boolean(durablePayload.autoSubmitted)
    });
    persistence.queueSubmission({
      snapshot: snapshot({
        submittedAt: Number(current?.submittedAt) || Date.now(),
        result,
        phase: MOCK_ATTEMPT_PHASES.QUEUED
      }),
      payload: durablePayload
    });
    await flush();
    const delivered = !persistence.readOutbox().some(entry => entry.eventId === eventId);
    deliveryResponses.delete(eventId);
    return delivered;
  };
  root.flushPending = flush;

  if (typeof original.validateStudentCode === 'function') {
    root.validateStudentCode = async function validateStudentCodeWithPriorCheck(...args) {
      const ids = await acquireCanonicalIdentity(args[0]);
      try {
        const found = await priorLookup({
          studentId: canonicalStudentId,
          programId,
          mockId: ids.mockId
        });
        if (lookupHasSubmission(found)) lockAlreadySubmitted(found);
      } catch {}
      return state()?.student;
    };
  }

  let pendingVariantId = '';
  let checkingPending = false;
  const refreshPending = async () => {
    const overlay = root.document?.getElementById('mockPendingOverlay');
    if (!overlay || !pendingVariantId || checkingPending
        || persistence.readOutbox().some(entry => entry.eventId === overlay.dataset.eventId)) return;
    checkingPending = true;
    try {
      const found = await priorLookup({
        studentId: canonicalStudentId, programId, mockId: `EGE2027-MOCK-${pendingVariantId}`
      });
      if (lookupHasSubmission(found)) root.location?.reload?.();
    } catch {} finally { checkingPending = false; }
  };
  const retry = () => {
    if (root.document?.visibilityState === 'hidden') return;
    if (persistence.readOutbox().length) void flush().then(refreshPending);
    else void refreshPending();
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
    lookup: priorLookup,
    verifyStoredCompletion,
    showPendingCompletion: (code, variantId) => {
      pendingVariantId = clean(variantId);
      showPendingCompletion(root, persistence.loadAttempt(identity(code, variantId))?.eventId);
      retry();
    },
    snapshot,
    isLocked: () => lockedByPriorSubmission,
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
  installMockExamUxFixes(root, programId);
  retry();
  return api;
}

// OGE pages use a different set of globals from EGE. This adapter keeps the
// same durable outbox and slot identity while leaving page rendering alone.
export function installOgeMockPersistenceBridge({
  root = globalThis,
  diagnosticsKey = '__OGE2027_MOCK_DIAGNOSTICS__',
  programId = 'OGE_MATH',
  namespace = 'ogeMock:v1',
  retryIntervalMs = 15_000,
  lookup,
  lookupUrl,
  lookupTimeoutMs = 10_000
} = {}) {
  const diagnostics = root?.[diagnosticsKey];
  if (!diagnostics || typeof diagnostics.getState !== 'function') throw new Error('OGE mock diagnostics are unavailable');
  const storage = root.localStorage;
  const persistence = createMockExamPersistence({ storage, namespace });
  const original = {
    loadLocal: root.loadLocal,
    saveLocal: root.saveLocal,
    apiPost: root.apiPost,
    startAttempt: root.startAttempt,
    finish: root.finish,
    validateStudent: root.validateStudent,
    showCompletedResult: root.showCompletedResult
  };
  if (typeof original.loadLocal !== 'function' || typeof original.saveLocal !== 'function'
      || typeof original.apiPost !== 'function') throw new Error('OGE mock persistence hooks are unavailable');
  let canonicalStudentId = '';

  const state = () => diagnostics.getState() || {};
  const nested = () => {
    const current = state();
    return current.app && isObject(current.app) ? { ...current, ...current.app } : current;
  };
  const fields = (payload = {}) => {
    const current = nested();
    const student = current.student || current.studentData || {};
    const assignment = current.assignment || current.mock || {};
    const code = clean(payload.studentCode || payload.code || student.code || student.studentCode || current.studentCode);
    const studentId = clean(canonicalStudentId || (payload.awaitingCanonicalIdentity
      ? ''
      : (payload.studentId || student.studentId || student.id || current.studentId)));
    const variantId = clean(payload.variantId || assignment.variantId || current.variantId);
    const rawMockId = clean(payload.mockId || assignment.mockId || current.mockId || diagnostics.mockId);
    const mockId = rawMockId || (variantId ? `OGE2027-MOCK-${variantId}` : '');
    return {
      studentId,
      studentCode: code || studentId,
      studentKey: code || studentId,
      programId,
      mockId,
      variantId
    };
  };
  const identity = (payload = {}) => {
    const value = fields(payload);
    return { programId: value.programId, studentCode: value.studentCode, variantId: value.variantId };
  };
  const eventFor = payload => stableMockSubmissionEventId(fields(payload));
  const canonicalizeCurrentAttempt = () => {
    const payload = fields({ ...nested(), studentId: canonicalStudentId, awaitingCanonicalIdentity: false });
    if (!canonicalStudentId || !payload.variantId) return payload;
    const eventId = eventFor(payload);
    const current = state();
    if (current.app && isObject(current.app)) current.app.eventId = eventId;
    else if (current) current.eventId = eventId;
    try { persistence.rekeyAttempt(identity(payload), eventId); } catch {}
    return { ...payload, eventId };
  };
  let canonicalRequest = null;
  const acquireCanonicalIdentity = code => {
    if (canonicalStudentId) return Promise.resolve(canonicalizeCurrentAttempt());
    if (canonicalRequest) return canonicalRequest;
    canonicalRequest = Promise.resolve(original.validateStudent(clean(code || nested().code || nested().studentCode)))
      .then(student => {
        canonicalStudentId = clean(student?.studentId || student?.id);
        if (!canonicalStudentId) throw new Error('canonical student identity is unavailable');
        const current = state();
        if (current.app && isObject(current.app)) current.app.student = student;
        else if (current) current.student = student;
        return canonicalizeCurrentAttempt();
      })
      .finally(() => { canonicalRequest = null; });
    return canonicalRequest;
  };
  const snapshot = (extra = {}) => {
    const current = nested();
    const ids = fields(extra);
    if ((!ids.studentId && !ids.studentCode) || !ids.variantId) return null;
    let saved = null;
    try { saved = persistence.loadAttempt(identity(ids)); } catch {}
    const eventId = clean(extra.eventId || current.eventId || saved?.eventId) || eventFor(ids);
    return {
      ...saved,
      ...ids,
      eventId,
      startedAt: Number(extra.startedAt ?? current.startedAt ?? saved?.startedAt) || 0,
      submittedAt: Number(extra.submittedAt ?? current.submittedAt ?? saved?.submittedAt) || 0,
      answers: extra.answers ?? current.answers ?? saved?.answers ?? {},
      result: extra.result ?? current.result ?? saved?.result,
      ...(extra.phase ? { phase: extra.phase } : {})
    };
  };
  const saveSnapshot = extra => {
    const item = snapshot(extra);
    if (!item) return null;
    const saved = persistence.loadAttempt(item);
    if (saved && saved.phase !== MOCK_ATTEMPT_PHASES.IN_PROGRESS) return saved;
    return persistence.saveAttempt(item);
  };
  let priorLookup = lookup;
  if (typeof priorLookup !== 'function') {
    priorLookup = createMockSubmissionLookup({
      ...(clean(lookupUrl) ? { url: lookupUrl } : {}),
      root,
      document: root.document,
      timeoutMs: lookupTimeoutMs
    });
  }

  root.loadLocal = function loadLocalWithPersistence(...args) {
    const ids = fields({ studentCode: args[0], studentId: args[0], variantId: args[1] });
    let saved = null;
    try {
      saved = persistence.loadAttempt(identity(ids));
    } catch {}
    const legacy = original.loadLocal(...args);
    if (saved && (saved.phase !== MOCK_ATTEMPT_PHASES.IN_PROGRESS || saved.serverVerifiedNoSubmission)) return saved;
    if (isObject(legacy)) {
      const legacyIds = fields({ ...legacy, studentId: legacy.studentId || args[0], variantId: legacy.variantId || args[1] });
      try {
        const phase = legacy.phase || (legacy.submittedAt ? MOCK_ATTEMPT_PHASES.CONFIRMED : MOCK_ATTEMPT_PHASES.IN_PROGRESS);
        const migrated = persistence.saveAttempt({
          ...saved,
          ...legacy,
          ...legacyIds,
          eventId: saved?.eventId || legacy.eventId || eventFor(legacyIds),
          phase
        });
        return migrated;
      } catch {}
    }
    return saved || legacy;
  };


  const verifyStoredCompletion = async (code, variantId, durationSeconds) => {
    const key = identity({ studentCode: code, studentId: code, variantId });
    const persisted = persistence.loadAttempt(key);
    const legacy = original.loadLocal(code, variantId);
    const completed = [persisted, legacy].find(item => item?.submittedAt);
    if (!completed) return;
    const saved = persisted || completed;
    await acquireCanonicalIdentity(code);
    const pending = persistence.readOutbox().some(entry => entry.eventId === completed.eventId);
    let found;
    try {
      found = await priorLookup({
        studentId: canonicalStudentId,
        programId,
        mockId: `OGE2027-MOCK-${clean(variantId)}`
      });
    } catch (error) {
      if (pending) return 'pending';
      throw error;
    }
    if (lookupHasSubmission(found)) return;
    if (pending) return 'pending';
    reopenUnsubmittedAttempt(persistence, saved, {
      ...key,
      eventId: clean(saved.eventId) || stableMockSubmissionEventId({
        studentId: canonicalStudentId, programId, mockId: `OGE2027-MOCK-${clean(variantId)}`
      })
    }, durationSeconds);
  };
  root.saveLocal = function saveLocalWithPersistence(value, ...args) {
    const result = original.saveLocal(value, ...args);
    try { saveSnapshot(isObject(value) ? value : {}); } catch {}
    return result;
  };
  if (typeof original.showCompletedResult === 'function') {
    root.showCompletedResult = function showCompletedResultWithConvertedScore(value) {
      const result = original.showCompletedResult(value);
      renderConvertedStudentResult(root, programId, value || result);
      return result;
    };
  }
  // The embedded OGE page attaches its own input handlers before this module
  // loads. Persist once more at document-bubble time so the shared store is
  // updated even in browsers that keep the earlier script binding.
  const persistInput = event => {
    if (!event?.target?.matches?.('.answer-input, .solution-input')) return;
    Promise.resolve().then(() => { try { saveSnapshot(); } catch {} });
  };
  root.document?.addEventListener?.('input', persistInput, true);

  const checkPrior = async payload => priorLookup({
    studentId: clean(payload.studentId || payload.studentCode || payload.studentKey),
    programId,
    mockId: clean(payload.mockId)
  });
  const deliveryResponses = new Map();
  const guardedPost = async payload => {
    const wasAwaitingIdentity = payload.awaitingCanonicalIdentity === true;
    if (!canonicalStudentId) await acquireCanonicalIdentity(payload.studentCode);
    const ids = fields({ ...payload, studentId: canonicalStudentId, awaitingCanonicalIdentity: false });
    const canonicalPayload = { ...payload, ...ids, eventId: eventFor(ids) };
    delete canonicalPayload.awaitingCanonicalIdentity;
    const found = await checkPrior(canonicalPayload);
    if (lookupHasSubmission(found)) {
      const receipt = priorSubmissionReceipt(payload, wasAwaitingIdentity ? {
        ...found,
        eventId: payload.eventId,
        studentId: payload.studentCode
      } : found);
      deliveryResponses.set(clean(payload.eventId), receipt);
      return receipt;
    }
    const response = await original.apiPost(canonicalPayload);
    confirmMockSubmissionResponse(response, canonicalPayload);
    const localReceipt = wasAwaitingIdentity
      ? { ok: true, eventId: payload.eventId }
      : response;
    deliveryResponses.set(clean(payload.eventId), localReceipt);
    return localReceipt;
  };
  let flushing = null;
  const flush = () => {
    if (flushing) return flushing;
    flushing = persistence.flush({
      submit: guardedPost,
      isOnline: () => root.navigator?.onLine !== false
    }).finally(() => { flushing = null; hideTransportState(); });
    return flushing;
  };

  const isSubmit = args => args.some(value => isObject(value)
    && (value.action === 'submitAssignedMock' || value.action === 'submitMock2027'));
  root.apiPost = function apiPostWithPersistence(...args) {
    if (!isSubmit(args)) return original.apiPost(...args);
    const source = args.find(value => isObject(value) && (value.action === 'submitAssignedMock' || value.action === 'submitMock2027'));
    const awaitingCanonicalIdentity = !canonicalStudentId;
    const ids = fields({ ...source, awaitingCanonicalIdentity });
    const eventId = eventFor(ids);
    const current = state();
    if (current.app && isObject(current.app)) current.app.eventId = eventId;
    else if (current) current.eventId = eventId;
    try { persistence.rekeyAttempt(identity(ids), eventId); } catch {}
    const payload = convertedMockPayload(programId, {
      ...source,
      ...ids,
      action: source.action,
      eventId,
      ...(awaitingCanonicalIdentity ? { studentId: '', awaitingCanonicalIdentity: true } : {})
    });
    const attempt = snapshot({
      ...payload,
      submittedAt: source.submittedAt || Date.now(),
      result: convertedMockResult(programId, {
        primary: Number(source.primaryScore) || 0,
        maxPrimary: Number(source.maxPrimaryScore) || 0,
        scorePercent: Number(source.scorePercent) || 0,
        gradeMark: payload.gradeMark,
        durationSeconds: Number(source.durationSeconds) || 0,
        autoSubmitted: Boolean(source.autoSubmitted)
      }),
      phase: MOCK_ATTEMPT_PHASES.QUEUED
    });
    persistence.queueSubmission({ snapshot: attempt, payload });
    return flush().then(result => {
      if (result.pending) throw new Error('mock submission remains queued');
      const response = deliveryResponses.get(payload.eventId);
      if (!response) throw new Error('mock submission receipt is unavailable');
      deliveryResponses.delete(payload.eventId);
      return response;
    });
  };

  if (typeof original.startAttempt === 'function') {
    root.startAttempt = function startAttemptWithStableSlot(...args) {
      const result = original.startAttempt(...args);
      const set = () => {
        const attempt = snapshot();
        if (!attempt) return;
        const eventId = eventFor(attempt);
        const current = state();
        if (current.app && isObject(current.app)) current.app.eventId = eventId;
        else if (current) current.eventId = eventId;
        attempt.eventId = eventId;
        const saved = persistence.loadAttempt(attempt);
        if (!saved) persistence.saveAttempt({ ...attempt, phase: MOCK_ATTEMPT_PHASES.IN_PROGRESS });
        else persistence.rekeyAttempt(attempt, eventId);
      };
      if (result?.then) return result.then(value => { set(); return value; });
      set();
      return result;
    };
  }
  if (typeof original.finish === 'function') {
    root.finish = function finishWithPersistence(...args) {
      try { saveSnapshot({ submittedAt: Date.now() }); } catch {}
      const result = original.finish(...args);
      if (result?.then) return result.finally(() => { try { saveSnapshot(); } catch {} });
      try { saveSnapshot(); } catch {}
      return result;
    };
  }

  let lockedByPriorSubmission = false;
  const lockAlreadySubmitted = (lookupResult = {}) => {
    lockedByPriorSubmission = true;
    const current = state();
    let saved = persistence.loadAttempt(identity(fields()));
    saved = updateSavedServerResult(persistence, saved, lookupResult, programId) || saved;
    if (current.app && isObject(current.app)) {
      current.app.finished = true;
      root.clearInterval?.(current.app.timerId);
    }
    // Prefer detailed server answers over an older confirmed local snapshot.
    if (hasLookupAnswers(lookupResult.answers)) {
      const answerEntries = Array.isArray(lookupResult.answers)
        ? lookupResult.answers.map((value, index) => [index + 1, value])
        : Object.entries(lookupResult.answers);
      for (const [task, value] of answerEntries) {
        const input = root.document?.getElementById(`ans-${task}`);
        if (!input) continue;
        input.value = clean(value);
        input.dispatchEvent?.(new root.Event('input', { bubbles: true }));
      }
      root.document?.querySelectorAll?.('[id^="ans-"]')?.forEach(input => {
        input.readOnly = true;
        input.setAttribute?.('aria-readonly', 'true');
      });
      const result = serverResult(programId, lookupResult, saved?.result || {});
      const submittedAt = Date.parse(lookupResult.submittedAt) || Date.now();
      if (current.app && isObject(current.app)) {
        current.app.submittedAt = submittedAt;
        current.app.result = result;
      }
      try {
        saved = persistence.saveAttempt({
          ...snapshot({ answers: lookupResult.answers, result, submittedAt }),
          phase: MOCK_ATTEMPT_PHASES.CONFIRMED
        });
      } catch {}
      hideAlreadySubmittedNotice(root);
      root.document?.getElementById('loginOverlay')?.classList?.add('hidden');
      root.document?.getElementById('examMain')?.classList?.add('hidden');
      if (typeof root.showCompletedResult === 'function') root.showCompletedResult(saved?.result || result);
      return;
    }
    const keepCompletedResult = Boolean(current.app?.finished && saved?.submittedAt && saved?.result);
    // Keep a restored local result and its review available when the server
    // row predates answersJson and therefore has no detailed answers.
    if (keepCompletedResult) {
      hideAlreadySubmittedNotice(root);
      root.document?.getElementById('loginOverlay')?.classList?.add('hidden');
      if (typeof root.showCompletedResult === 'function') root.showCompletedResult(saved.result);
      return;
    }
    for (const id of ['examMain', 'resultOverlay', 'confirmOverlay', 'reviewOverlay']) {
      root.document?.getElementById(id)?.classList?.add('hidden');
    }
    root.document?.getElementById('loginOverlay')?.classList?.add('hidden');
    showAlreadySubmittedNotice(root, programId, lookupResult);
  };
  if (typeof original.validateStudent === 'function') {
    root.validateStudent = async function validateStudentWithPriorLock(...args) {
      let payload;
      try { payload = await acquireCanonicalIdentity(args[0]); }
      catch { return null; }
      try {
        const found = await priorLookup(payload);
        if (lookupHasSubmission(found)) lockAlreadySubmitted(found);
      } catch {}
      return state().app?.student || state().student;
    };
  }

  function hideTransportState() {
    for (const id of ['saveState', 'resultSubmitState', 'popupSubmitState', 'transportStatus', 'networkStatus', 'sendState']) {
      const element = root.document?.getElementById(id);
      if (element) {
        element.textContent = '';
        element.hidden = true;
        element.style?.setProperty('display', 'none', 'important');
        element.setAttribute?.('aria-hidden', 'true');
      }
    }
  }
  for (const name of ['setSaveState', 'setResultSubmitState', 'setNetworkStatus']) root[name] = hideTransportState;
  hideTransportState();

  let pendingVariantId = '';
  let checkingPending = false;
  const refreshPending = async () => {
    const overlay = root.document?.getElementById('mockPendingOverlay');
    if (!overlay || !pendingVariantId || checkingPending
        || persistence.readOutbox().some(entry => entry.eventId === overlay.dataset.eventId)) return;
    checkingPending = true;
    try {
      const found = await priorLookup({
        studentId: canonicalStudentId, programId, mockId: `OGE2027-MOCK-${pendingVariantId}`
      });
      if (lookupHasSubmission(found)) root.location?.reload?.();
    } catch {} finally { checkingPending = false; }
  };
  const retry = () => {
    if (root.document?.visibilityState === 'hidden') return;
    if (persistence.readOutbox().length) void flush().then(refreshPending);
    else void refreshPending();
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
    lookup: priorLookup,
    verifyStoredCompletion,
    showPendingCompletion: (code, variantId) => {
      pendingVariantId = clean(variantId);
      showPendingCompletion(root, persistence.loadAttempt(identity({ studentCode: code, variantId }))?.eventId);
      retry();
    },
    snapshot,
    ready: true,
    isLocked: () => lockedByPriorSubmission,
    dispose() {
      root.clearInterval?.(timer);
      root.removeEventListener?.('online', retry);
      root.removeEventListener?.('focus', retry);
      root.removeEventListener?.('pageshow', retry);
      root.document?.removeEventListener?.('visibilitychange', retry);
      root.document?.removeEventListener?.('input', persistInput, true);
    }
  };
  root.__OGE_MOCK_PERSISTENCE__ = api;
  installMockExamUxFixes(root, programId);
  retry();
  return api;
}
