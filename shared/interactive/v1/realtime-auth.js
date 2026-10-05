// Shared JSONP transport; pages keep control of response parsing and UX errors.
export function createStudentJsonpTransport({ api, windowRef = window, documentRef = document,
  timeoutMs = 60000, callbackPrefix = 'studentJsonp' } = {}) {
  const url = typeof api === 'string' ? api : api?.url;
  if (!url) throw new TypeError('A JSONP API URL is required');
  return function requestStudentJsonp({ code, params = {}, timeout = timeoutMs,
    callbackNamePrefix = callbackPrefix, timeoutError = () => new Error('timeout'),
    networkError = () => new Error('network'), cacheBust = true, parseResponse = value => value } = {}) {
    return new Promise((resolve, reject) => {
      const callback = `${callbackNamePrefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = documentRef.createElement('script');
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { delete windowRef[callback]; } catch {}
        script.remove();
        error ? reject(error) : resolve(value);
      };
      const query = new URLSearchParams({ action: 'validateStudent', ...(code === undefined ? {} : { code }), ...params, callback });
      if (cacheBust) query.set('_', String(Date.now()));
      windowRef[callback] = data => {
        try { finish(null, parseResponse(data)); }
        catch (error) { finish(error); }
      };
      script.async = true;
      script.onerror = () => finish(networkError());
      const timer = setTimeout(() => finish(timeoutError()), timeout);
      script.src = `${url}?${query}`;
      documentRef.head.appendChild(script);
    });
  };
}
