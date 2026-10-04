// Совместимость с действующим Google Apps Script. Страницы используют platform-api.js.
export function createLegacyApiClient({ url, teacherCodeHash, timeoutMs = 60000 }) {
  const normalizeCode = value => String(value ?? '').trim().toUpperCase();

  function studentFromResponse(data, code) {
    if (!data || data.ok === false || data.success === false || data.valid === false) return null;
    const source = data.student || data.data || data;
    const studentId = source.studentId ?? source.id ?? source.studentID ?? source.student_id ?? data.studentId ?? data.id;
    const name = source.studentName ?? source.name ?? source.fullName ?? data.studentName ?? data.name;
    if (studentId === undefined || studentId === null || studentId === '') return null;
    return { studentId: String(studentId), name: String(name || 'Ученик'), code: normalizeCode(code) };
  }

  async function verifyTeacher(code) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(code).trim()));
    const hash = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
    return hash === teacherCodeHash;
  }

  function validateStudentCode(code) {
    return new Promise((resolve, reject) => {
      const callback = 'egeStudentCallback_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      let done = false;
      const finish = (error, value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { delete window[callback]; } catch {}
        script.remove();
        error ? reject(error) : resolve(value);
      };
      const timer = setTimeout(() => finish(new Error('Сервер не ответил в течение 60 секунд.')), timeoutMs);
      window[callback] = data => {
        const student = studentFromResponse(data, code);
        student ? finish(null, student) : finish(new Error((data && (data.error || data.message)) || 'Код ученика не найден'));
      };
      script.onerror = () => finish(new Error('Не удалось связаться с сервером'));
      script.async = true;
      script.src = `${url}?action=validateStudent&code=${encodeURIComponent(code)}&callback=${encodeURIComponent(callback)}&_=${Date.now()}`;
      document.head.appendChild(script);
    });
  }

  async function submitResult(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload), redirect: 'follow', signal: controller.signal
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('Сервер результатов не ответил в течение 60 секунд.');
      throw error;
    } finally { clearTimeout(timer); }
    let answer;
    try { answer = await response.json(); } catch { throw new Error('Система результатов не ответила.'); }
    if (!response.ok || !answer?.ok) throw new Error(answer?.error || 'Результат не принят.');
    return answer;
  }

  function sendResultOnExit(payload) {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'text/plain;charset=utf-8' }));
      return;
    }
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, keepalive: true }).catch(() => {});
  }

  return { verifyTeacher, validateStudentCode, submitResult, sendResultOnExit };
}
