// One Google Apps Script gateway for classic homework pages and the ESM adapter.
// Keep this file free of imports so it also works in a plain <script> tag.
(function installHomeworkGasCore(root) {
  'use strict';

  const url = 'https://script.google.com/macros/s/AKfycbw6iYfojO8VgkHU63peD2vWLybGyDm9AsYZ6TaLA_EFD4j56nQlY5SqpRANPVeTwVsj/exec';

  function errorFrom(data, fallback) {
    return new Error(String(data?.message || data?.error || fallback));
  }

  function confirm(data, action, payload) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Сервер не подтвердил сохранение домашней работы. Результат будет отправлен повторно.');
    }
    const body = data.result && typeof data.result === 'object' ? data.result
      : data.data && typeof data.data === 'object' ? data.data : data;
    if (data.ok === false || data.success === false || data.error ||
        body.ok === false || body.success === false || body.error) {
      throw errorFrom(data, 'Сервер отклонил запрос. Результат будет отправлен повторно.');
    }
    if (action === 'submitHomework') {
      if (data.ok !== true || data.saved !== true ||
          (data.assignmentId && data.assignmentId !== payload.assignmentId)) {
        throw errorFrom(data, 'Сервер не подтвердил сохранение домашней работы. Результат будет отправлен повторно.');
      }
    } else if (action === 'checkHomeworkSubmission') {
      const submitted = [body.submitted, body.hasSubmitted, body.hasSubmission,
        body.alreadySubmitted, body.exists, body.found, body.isSubmitted,
        body.submittedThisMonth].find(value => typeof value === 'boolean');
      const resolved = typeof submitted === 'boolean' ? submitted
        : typeof body.canSubmit === 'boolean' ? !body.canSubmit
          : body.status === 'submitted' || body.status === 'submitted_late' ? true : undefined;
      if (typeof resolved !== 'boolean') {
        throw errorFrom(data, 'Не удалось проверить статус домашней работы.');
      }
      return { ...data, submitted: resolved };
    }
    return data;
  }

  function create({ endpoint = url, fetchImpl = (...args) => root.fetch(...args), documentRef = root.document,
    timeoutMs = 20000 } = {}) {
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
        const callback = '__homeworkGas_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        const script = documentRef.createElement('script');
        let settled = false;
        let timer;
        const finish = (error, data) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try { delete root[callback]; } catch { root[callback] = undefined; }
          script.remove();
          error ? reject(error) : resolve(data);
        };
        timer = setTimeout(() => finish(new Error('Сервер не ответил')), timeout);
        root[callback] = data => {
          try {
            if (params?.action === 'checkHomeworkSubmission') data = confirm(data, params.action, params);
            if (params?.action === 'validateStudent') {
              const student = data?.student || data?.result?.student || data?.data?.student ||
                data?.result || data?.data || data;
              const id = student?.studentId ?? student?.id ?? data?.studentId ?? data?.id;
              if (!data || data.ok === false || data.success === false || data.valid === false ||
                  student?.ok === false || student?.success === false || student?.valid === false ||
                  !String(id ?? '').trim()) {
                throw errorFrom(data, 'Не удалось проверить код ученика.');
              }
            }
            finish(null, data);
          } catch (error) { finish(error); }
        };
        script.onerror = () => finish(new Error('Не удалось подключиться к серверу'));
        script.async = true;
        script.src = endpoint + '?' + new URLSearchParams({ ...params, callback });
        documentRef.head.appendChild(script);
      });
    }

    async function post(payload, { keepalive = false } = {}) {
      try {
        const response = await fetchImpl(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload), redirect: 'follow', keepalive
        });
        if (!response.ok) throw new Error('Не удалось связаться с сервером (HTTP ' + response.status + ').');
        let data;
        try { data = JSON.parse(await response.text()); }
        catch { throw new Error('Сервер вернул непонятный ответ. Результат будет отправлен повторно.'); }
        const acknowledged = confirm(data, payload?.action, payload);
        if (payload?.action === 'submitHomework') clearSubmissionStatus();
        return acknowledged;
      } catch (error) {
        if (payload?.action === 'submitHomework') showSubmissionStatus(error);
        throw error;
      }
    }

    function sendKeepalive(payload) {
      // An exit-time send has no confirmed acknowledgement; caller must retain its queue.
      try {
        fetchImpl(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload), redirect: 'follow', keepalive: true
        }).catch(() => {});
        return true;
      } catch { return false; }
    }

    function validateStudentCode(code, timeout = timeoutMs) {
      const normalized = String(code || '').trim().toUpperCase();
      if (!normalized) return Promise.reject(new Error('Введите код ученика'));
      return jsonp({ action: 'validateStudent', code: normalized }, timeout);
    }

    return Object.freeze({ url: endpoint, jsonp, post, sendKeepalive, validateStudentCode });
  }

  root.HomeworkGasCore = Object.freeze({ url, create, confirm, ...create() });
})(globalThis);
