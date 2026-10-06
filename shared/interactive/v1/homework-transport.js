// Shared transport for dz1–dz3. Page adapters keep their historical response
// parsing and localStorage formats; this module only owns GAS I/O and queue mechanics.
export const HOMEWORK_GAS_URL = 'https://script.google.com/macros/s/AKfycbw6iYfojO8VgkHU63peD2vWLybGyDm9AsYZ6TaLA_EFD4j56nQlY5SqpRANPVeTwVsj/exec';

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
  parseSubmission = parseSubmissionResponse
}) {
  function validateStudentCode(rawCode) {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) return Promise.reject(new Error('empty'));
    return new Promise((resolve, reject) => {
      const callback = `__egeStudent_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try { delete window[callback]; } catch { window[callback] = undefined; }
        script.remove();
      };
      const timeout = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, timeoutMs);
      window[callback] = payload => {
        try {
          const student = parseStudent(payload, code);
          if (!student) throw new Error('invalid');
          cleanup(); resolve({ ...student, code });
        } catch (error) { cleanup(); reject(error); }
      };
      script.onerror = () => { cleanup(); reject(new Error('network')); };
      script.async = true;
      script.src = `${url}?action=validateStudent&code=${encodeURIComponent(code)}&callback=${encodeURIComponent(callback)}`;
      document.head.appendChild(script);
    });
  }

  async function submitResult(payload, options = {}) {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload), redirect: 'follow', keepalive: Boolean(options.keepalive)
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { success: response.ok, message: text }; }
    if (!response.ok) throw new Error('network');
    return parseSubmission(data);
  }

  function sendResultOnExit(payload, mode = 'fetch') {
    const body = JSON.stringify(payload);
    if (mode === 'beacon') {
      if (!navigator.sendBeacon) return false;
      return navigator.sendBeacon(url, new Blob([body], { type: 'text/plain;charset=utf-8' }));
    }
    try {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, keepalive: true, redirect: 'follow' }).catch(() => {});
      return true;
    } catch { return false; }
  }

  return { validateStudentCode, submitResult, sendResultOnExit };
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
  const body = data && typeof data === 'object' && data.result && typeof data.result === 'object' ? data.result : (data || {});
  return {
    submitted: Boolean(body.submitted || body.exists || body.hasSubmission || body.alreadySubmitted || body.found || body.isSubmitted || body.status === 'submitted' || body.status === 'submitted_late' || body.canSubmit === false),
    error: Boolean(data?.success === false || data?.ok === false || body.success === false || body.ok === false || data?.error || body.error)
  };
}

function withCompletionTimestamp(payload, milliseconds) {
  if (!payload || typeof payload !== 'object' || payload.completedAt || payload.finishedAt || payload.submittedAt) return payload;
  return { ...payload, completedAt: new Date(milliseconds).toISOString() };
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
    const completedAtMs = now();
    const timestampedPayload = withCompletionTimestamp(payload, completedAtMs);
    if (shape === 'object') {
      const value = read();
      const queue = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      queue[payload.eventId] = { payload: timestampedPayload, createdAt: completedAtMs, lastAttemptAt: 0 };
      write(queue);
    } else {
      const current = read();
      const queue = Array.isArray(current) ? current : [];
      const index = queue.findIndex(item => item?.eventId === payload.eventId);
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
  const data = root.student || root.result?.student || root.result || root;
  if (root.success === false || root.valid === false || root.ok === false || data.success === false || data.valid === false || data.ok === false) return null;
  const id = data.studentId || data.id;
  const name = data.studentName || data.name;
  if (!id || !name) return null;
  return { id: String(id), name: String(name), code };
}
