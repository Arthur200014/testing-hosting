import { createAspNetHomeworkClient } from './homework-aspnet-client.js';

export { createAspNetHomeworkClient } from './homework-aspnet-client.js';

// Shared transport for dz1–dz3. Page adapters keep their historical response
// parsing and localStorage formats; this module owns provider selection and queue mechanics.
export const HOMEWORK_GAS_URL = 'https://script.google.com/macros/s/AKfycbw6iYfojO8VgkHU63peD2vWLybGyDm9AsYZ6TaLA_EFD4j56nQlY5SqpRANPVeTwVsj/exec';
export const HOMEWORK_TRANSPORT_CONFIG_KEY = 'EGE_HOMEWORK_TRANSPORT_CONFIG';

// One policy for every homework page: at least one answer is required, blanks
// count as wrong, and a confirmed assignment can only be checked locally.
export function decideHomeworkSubmission(answers, { officialSubmitted = false } = {}) {
  const values = Array.from(answers || []);
  const filledCount = values.reduce((count, value) =>
    count + (String(value ?? '').trim() ? 1 : 0), 0);
  const totalCount = values.length;
  const canSubmit = totalCount > 0 && filledCount > 0;
  return {
    answers: values,
    totalCount,
    filledCount,
    emptyCount: Math.max(0, totalCount - filledCount),
    canSubmit,
    mode: officialSubmitted ? 'training' : 'official',
    shouldQueue: canSubmit && !officialSubmitted
  };
}

export function homeworkAssignmentIsSubmitted(item) {
  return Boolean(item?.submittedAt)
    || (Number.isFinite(Number(item?.scorePercent)) && item?.scorePercent !== null && item?.scorePercent !== '')
    || /сдан|выполн|провер/i.test(String(item?.status || ''));
}

function homeworkEventId(item) {
  return String(item?.homeworkEventId || item?.submissionEventId || item?.eventId || '').trim();
}

// Teacher-facing diagnostics for rows returned from the ДЗ_Назначения sheet.
// A browser cannot see an event that is still queued on another device, so the
// diagnostic intentionally describes only data that has reached the server.
export function analyzeHomeworkAssignments(items) {
  const rows = Array.isArray(items) ? items.filter(Boolean) : [];
  const groups = new Map();
  for (const item of rows) {
    const homeworkId = String(item.homeworkId || '').trim();
    if (!homeworkId) continue;
    if (!groups.has(homeworkId)) groups.set(homeworkId, []);
    groups.get(homeworkId).push(item);
  }
  return [...groups].map(([homeworkId, groupRows]) => {
    const submittedRows = groupRows.filter(homeworkAssignmentIsSubmitted);
    const pendingRows = groupRows.filter(item => !homeworkAssignmentIsSubmitted(item));
    const submittedWithoutEvent = submittedRows.filter(item => !homeworkEventId(item));
    return {
      homeworkId,
      homeworkName: String(groupRows.find(item => item.homeworkName)?.homeworkName || homeworkId),
      taskNumber: String(groupRows.find(item => item.taskNumber)?.taskNumber || ''),
      rows: groupRows,
      rowCount: groupRows.length,
      submittedCount: submittedRows.length,
      pendingCount: pendingRows.length,
      repeated: groupRows.length > 1,
      duplicate: pendingRows.length > 1,
      submittedWithoutEventCount: submittedWithoutEvent.length,
      eventIds: submittedRows.map(homeworkEventId).filter(Boolean)
    };
  });
}

export function findPendingHomeworkConflicts({ statistics, studentIds, homeworkId }) {
  const wantedHomeworkId = String(homeworkId || '').trim();
  if (!wantedHomeworkId) return [];
  const students = statistics?.students || {};
  return Array.from(studentIds || []).flatMap(studentId => {
    const homework = Array.isArray(students?.[studentId]?.homework)
      ? students[studentId].homework
      : [];
    const rows = homework.filter(item =>
      item?.legacy !== true
      && String(item?.homeworkId || '').trim() === wantedHomeworkId
      && !homeworkAssignmentIsSubmitted(item));
    return rows.length ? [{ studentId: String(studentId), homeworkId: wantedHomeworkId, rows }] : [];
  });
}

function gasError(data, fallback) {
  const bodies = gasBodies(data);
  const message = bodies.map(body => body?.message || body?.error).find(Boolean);
  return new Error(String(message || fallback));
}

function gasBodies(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const bodies = [data];
  for (const candidate of [data.result, data.data, data.data?.result, data.result?.data]) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate) && !bodies.includes(candidate)) {
      bodies.push(candidate);
    }
  }
  return bodies;
}

export function confirmHomeworkGasResponse(data, action, payload = {}) {
  const bodies = gasBodies(data);
  if (!bodies.length) {
    throw new Error('Сервер не подтвердил сохранение домашней работы. Результат будет отправлен повторно.');
  }
  if (bodies.some(body => body.ok === false || body.success === false || body.error)) {
    throw gasError(data, 'Сервер отклонил запрос. Результат будет отправлен повторно.');
  }
  if (action === 'submitHomework') {
    const receipt = bodies.find(body => body.ok === true && body.saved === true);
    if (!receipt || (receipt.assignmentId && receipt.assignmentId !== payload.assignmentId)) {
      throw gasError(data, 'Сервер не подтвердил сохранение домашней работы. Результат будет отправлен повторно.');
    }
  } else if (action === 'checkHomeworkSubmission') {
    const submitted = bodies.flatMap(body => [body.submitted, body.hasSubmitted, body.hasSubmission,
      body.alreadySubmitted, body.exists, body.found, body.isSubmitted, body.submittedThisMonth])
      .find(value => typeof value === 'boolean');
    const canSubmit = bodies.map(body => body.canSubmit).find(value => typeof value === 'boolean');
    const status = bodies.map(body => body.status).find(Boolean);
    const resolved = typeof submitted === 'boolean' ? submitted
      : typeof canSubmit === 'boolean' ? !canSubmit
        : status === 'submitted' || status === 'submitted_late' ? true : undefined;
    if (typeof resolved !== 'boolean') throw gasError(data, 'Не удалось проверить статус домашней работы.');
    return { ...data, submitted: resolved };
  }
  return data;
}

export function createHomeworkIdentity({ get, set, remove, dz1 = false }) {
  const normalizeCode = value => String(value || '').trim().toUpperCase();
  return {
    read() {
      const code = normalizeCode(get('egeStudentCode'));
      if (!code) return null;
      const id = get('egeStudentId'), name = get('egeStudentName') || 'Ученик';
      return dz1 ? { id: id || code, name, code, verified: Boolean(id && id !== code && get('egeStudentName')) }
        : { id: id || code, name, code };
    },
    store(student) {
      const code = dz1 ? normalizeCode(student.code) : student.code;
      if (dz1 && !code) return;
      set('egeStudentCode', code);
      if (dz1) {
        if (student.id) set('egeStudentId', String(student.id));
        if (student.name) set('egeStudentName', String(student.name));
      } else {
        set('egeStudentId', student.id || code);
        set('egeStudentName', student.name || 'Ученик');
      }
    },
    clear() { remove('egeStudentId'); remove('egeStudentName'); remove('egeStudentCode'); }
  };
}

export function createHomeworkApi({
  url = HOMEWORK_GAS_URL,
  timeoutMs = 20000,
  parseStudent,
  parseSubmission = parseSubmissionResponse,
  fetchImpl = globalThis.fetch,
  documentRef = globalThis.document,
  root = globalThis,
  navigatorRef = globalThis.navigator
} = {}) {
  function showSubmissionStatus(error) {
    if (!documentRef?.body) return;
    let banner = documentRef.getElementById('homework-gas-save-status');
    if (!banner) {
      banner = documentRef.createElement('div');
      banner.id = 'homework-gas-save-status';
      banner.setAttribute('role', 'alert');
      banner.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;padding:14px 18px;border-radius:12px;background:#7d1720;color:#fff;font:600 15px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px #0005';
      documentRef.body.appendChild(banner);
    }
    banner.textContent = 'Результат пока НЕ записан в таблицу. Страница попробует отправить его повторно. ' + error.message;
  }

  function clearSubmissionStatus() {
    documentRef?.getElementById?.('homework-gas-save-status')?.remove();
  }

  function jsonp(params, timeout = timeoutMs) {
    if (params?.action === 'submitHomework') {
      return Promise.reject(new Error('Домашние работы сохраняются только через POST.'));
    }
    return new Promise((resolve, reject) => {
      if (!documentRef?.head) { reject(new Error('JSONP недоступен')); return; }
      const callback = `__homeworkGas_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = documentRef.createElement('script');
      let settled = false;
      let timer;
      const finish = (error, value) => {
        if (settled) return false;
        settled = true;
        clearTimeout(timer);
        try { delete root[callback]; } catch { root[callback] = undefined; }
        script.remove();
        error ? reject(error) : resolve(value);
        return true;
      };
      timer = setTimeout(() => finish(new Error('Сервер не ответил')), timeout);
      root[callback] = data => {
        try {
          if (params?.action === 'checkHomeworkSubmission') {
            data = confirmHomeworkGasResponse(data, params.action, params);
          } else if (params?.action === 'validateStudent') {
            const bodies = gasBodies(data);
            const student = bodies.map(body => body.student).find(value => value && typeof value === 'object') || bodies[1] || bodies[0];
            const id = student?.studentId ?? student?.studentID ?? student?.id ?? data?.studentId ?? data?.studentID ?? data?.id;
            if (bodies.some(body => body.ok === false || body.success === false || body.valid === false) || !String(id ?? '').trim()) {
              throw gasError(data, 'Не удалось проверить код ученика.');
            }
          }
          finish(null, data);
        } catch (error) { finish(error); }
      };
      script.onerror = () => finish(new Error('Не удалось подключиться к серверу'));
      script.async = true;
      script.src = `${url}?${new URLSearchParams({ ...params, callback })}`;
      documentRef.head.appendChild(script);
    });
  }

  async function post(payload, { keepalive = false } = {}) {
    try {
      const response = await fetchImpl(url, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload), redirect: 'follow', keepalive
      });
      if (!response.ok) throw new Error(`Не удалось связаться с сервером (HTTP ${response.status}).`);
      let data;
      try { data = JSON.parse(await response.text()); }
      catch { throw new Error('invalid-response: Сервер вернул непонятный ответ. Результат будет отправлен повторно.'); }
      const confirmed = confirmHomeworkGasResponse(data, payload?.action, payload);
      if (payload?.action === 'submitHomework') clearSubmissionStatus();
      return confirmed;
    } catch (error) {
      if (payload?.action === 'submitHomework') showSubmissionStatus(error);
      throw error;
    }
  }

  async function validateStudentCode(rawCode) {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) throw new Error('empty');
    const data = await jsonp({ action: 'validateStudent', code });
    if (typeof parseStudent !== 'function') return data;
    const student = parseStudent(data, code);
    if (!student) throw new Error('invalid');
    return { ...student, code };
  }

  async function submitResult(payload, options = {}) {
    return parseSubmission(await post(payload, options));
  }

  function sendKeepalive(payload) {
    try {
      fetchImpl(url, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload), redirect: 'follow', keepalive: true
      }).catch(() => {});
      return true;
    } catch { return false; }
  }

  function sendResultOnExit(payload, mode = 'fetch') {
    const body = JSON.stringify(payload);
    if (mode === 'beacon') {
      if (!navigatorRef?.sendBeacon) return false;
      return navigatorRef.sendBeacon(url, new Blob([body], { type: 'text/plain;charset=utf-8' }));
    }
    return sendKeepalive(payload);
  }

  return Object.freeze({ url, jsonp, post, sendKeepalive, validateStudentCode, submitResult, sendResultOnExit });
}

// Production pages stay on GAS unless an embedding runtime deliberately supplies
// { provider: 'aspnet', baseUrl, workspace } before the module is evaluated.
export function createHomeworkTransport({
  config = globalThis?.[HOMEWORK_TRANSPORT_CONFIG_KEY],
  timeoutMs,
  parseStudent,
  parseSubmission,
  fetchImpl,
  documentRef,
  root,
  navigatorRef,
  getStudentCode,
  now
} = {}) {
  const runtimeConfig = config == null ? {} : config;
  if (typeof runtimeConfig !== 'object' || Array.isArray(runtimeConfig)) {
    throw new TypeError('Homework transport config must be an object');
  }
  const provider = runtimeConfig.provider ?? 'gas';
  if (provider === 'gas') {
    return createHomeworkApi({ timeoutMs, parseStudent, parseSubmission, fetchImpl, documentRef, root, navigatorRef });
  }
  if (provider !== 'aspnet') throw new TypeError(`Unsupported homework provider: ${provider}`);
  return createAspNetHomeworkClient({
    baseUrl: runtimeConfig.baseUrl,
    workspace: runtimeConfig.workspace,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(fetchImpl === undefined ? {} : { fetchImpl }),
    ...(getStudentCode === undefined ? {} : { getStudentCode }),
    ...(now === undefined ? {} : { now })
  });
}

export function parseSubmissionResponse(data, responseOk = true) {
  let parsed = data;
  if (typeof data === 'string') {
    try { parsed = JSON.parse(data); } catch { parsed = { success: responseOk, message: data }; }
  }
  if (!responseOk) throw new Error('network');
  return parsed;
}

export function submissionState(data) {
  const root = data && typeof data === 'object' ? data : {};
  const bodies = [root];
  for (const candidate of [root.data, root.result, root.data?.result, root.result?.data]) {
    if (candidate && typeof candidate === 'object' && !bodies.includes(candidate)) bodies.push(candidate);
  }
  return {
    submitted: Boolean(bodies.some(candidate => candidate.submitted || candidate.exists || candidate.hasSubmission || candidate.alreadySubmitted || candidate.hasSubmitted || candidate.submittedThisMonth || candidate.found || candidate.isSubmitted || candidate.status === 'submitted' || candidate.status === 'submitted_late' || candidate.canSubmit === false)),
    error: Boolean(bodies.some(candidate => candidate.success === false || candidate.ok === false || candidate.error))
  };
}

function withCompletionTimestamp(payload, milliseconds) {
  if (!payload || typeof payload !== 'object' || payload.completedAt || payload.finishedAt || payload.submittedAt) return payload;
  return { ...payload, completedAt: new Date(milliseconds).toISOString() };
}

function withStableCompletionTimestamp(payload, previousPayload, milliseconds) {
  if (previousPayload?.completedAt) return { ...payload, completedAt: previousPayload.completedAt };
  if (previousPayload?.finishedAt) return { ...payload, finishedAt: previousPayload.finishedAt };
  if (previousPayload?.submittedAt) return { ...payload, submittedAt: previousPayload.submittedAt };
  return withCompletionTimestamp(payload, milliseconds);
}

// Adapter for the legacy object queue in dz1 and array queues in dz2/dz3.
// New entries preserve their completion instant so an offline retry cannot change
// deadline semantics when the ASP.NET homework provider is enabled later.
export function createHomeworkQueueAdapter({ read, write, shape, now = Date.now }) {
  function list() {
    const value = read();
    if (shape === 'object') return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.entries(value).map(([eventId, entry]) => ({ eventId, entry })) : [];
    return Array.isArray(value) ? value.map(payload => ({ eventId: payload?.eventId, payload })) : [];
  }
  function enqueue(payload) {
    if (shape === 'object') {
      const value = read();
      const queue = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      const previous = queue[payload.eventId];
      const createdAt = Number.isFinite(previous?.createdAt) ? previous.createdAt : now();
      const timestampedPayload = withStableCompletionTimestamp(payload, previous?.payload, createdAt);
      queue[payload.eventId] = {
        payload: timestampedPayload,
        createdAt,
        lastAttemptAt: Number.isFinite(previous?.lastAttemptAt) ? previous.lastAttemptAt : 0
      };
      write(queue);
    } else {
      const current = read();
      const queue = Array.isArray(current) ? current : [];
      const index = queue.findIndex(item => item?.eventId === payload.eventId);
      const timestampedPayload = withStableCompletionTimestamp(payload, index >= 0 ? queue[index] : null, now());
      if (index >= 0) queue[index] = timestampedPayload; else queue.push(timestampedPayload);
      write(queue);
    }
  }
  function replacePayload(eventId, transform) {
    if (shape === 'object') {
      const queue = read();
      const entry = queue && queue[eventId];
      if (entry?.payload) entry.payload = transform(entry.payload, entry);
      if (entry) write(queue);
    } else {
      const current = read();
      const queue = Array.isArray(current) ? current : [];
      const index = queue.findIndex(item => item?.eventId === eventId);
      if (index >= 0) { queue[index] = transform(queue[index]); write(queue); }
    }
  }
  function remove(eventId) {
    if (shape === 'object') {
      const queue = read();
      if (queue && Object.hasOwn(queue, eventId)) { delete queue[eventId]; write(queue); }
    } else write(list().filter(item => item.eventId !== eventId).map(item => item.payload));
  }
  function markAttempt(eventId, at = now()) {
    if (shape !== 'object') return;
    const queue = read();
    if (queue?.[eventId]) { queue[eventId].lastAttemptAt = at; write(queue); }
  }
  return { list, enqueue, replacePayload, remove, markAttempt };
}

export function createHomeworkOutbox({ queue, api, isOnline = () => true, acknowledge }) {
  let flushing = false;
  async function flush({ onSaved, keepFailed = true } = {}) {
    if (flushing || !isOnline()) return;
    flushing = true;
    try {
      for (const { eventId, entry, payload: arrayPayload } of queue.list()) {
        let payload = entry?.payload || arrayPayload;
        if (!payload) { queue.remove(eventId); continue; }
        // Legacy dz1 object envelopes already contain a reliable enqueue timestamp.
        // Backfill it once. Old dz2/dz3 array entries without a timestamp are left
        // untouched so a future ASP.NET cutover cannot silently invent history.
        if (entry?.createdAt && !payload.completedAt && !payload.finishedAt && !payload.submittedAt) {
          const enriched = withCompletionTimestamp(payload, entry.createdAt);
          queue.replacePayload(eventId, () => enriched);
          payload = enriched;
        }
        queue.markAttempt(eventId);
        try {
          const answer = await api.submitResult(payload);
          if (acknowledge(answer)) {
            queue.remove(eventId);
            await onSaved?.({ eventId, payload, entry });
          } else if (!keepFailed) queue.remove(eventId);
        } catch { if (!keepFailed) queue.remove(eventId); }
      }
    } finally { flushing = false; }
  }
  function sendOnExit(mode = 'fetch') {
    for (const { entry, payload } of queue.list()) {
      let outgoing = entry?.payload || payload;
      if (entry?.createdAt && outgoing && !outgoing.completedAt && !outgoing.finishedAt && !outgoing.submittedAt) {
        outgoing = withCompletionTimestamp(outgoing, entry.createdAt);
      }
      api.sendResultOnExit(outgoing, mode);
    }
  }
  return { flush, sendOnExit };
}

export function parseDz1Student(data, code) {
  if (!data || data.ok === false || data.success === false || data.valid === false) return null;
  const source = data.student || data.result?.student || data.result || data.data || data;
  if (source.ok === false || source.success === false || source.valid === false) return null;
  const id = source.studentId ?? source.id ?? source.studentID ?? source.student_id ?? data.studentId ?? data.id;
  const name = source.studentName ?? source.name ?? source.fullName ?? data.studentName ?? data.name;
  if (id == null || id === '') return null;
  return { id: String(id), name: String(name || 'Ученик'), code, verified: true };
}

export function parseDz23Student(payload, code) {
  const root = payload && typeof payload === 'object' ? payload : {};
  const data = root.student || root.result?.student || root.data?.student || root.data || root.result || root;
  if (root.success === false || root.valid === false || root.ok === false || data.success === false || data.valid === false || data.ok === false) return null;
  const id = data.studentId || data.id;
  const name = data.studentName || data.name;
  if (!id || !name) return null;
  return { id: String(id), name: String(name), code };
}
