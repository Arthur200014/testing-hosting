export const productionApi = 'https://arthur200014-testing-hosting-8c4e.twc1.net';

export function pilotOrigin(value) {
  const url = new URL(value);
  if (url.origin !== value || url.protocol !== 'https:' || url.port ||
      !/^[a-z0-9-]+\.twc1\.net$/.test(url.hostname) || value === productionApi)
    throw new Error('A separate HTTPS Timeweb pilot domain is required');
  return url;
}

export function pilotDatabase(value, approvedHost, name) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !approvedHost || url.hostname !== approvedHost
      || url.pathname !== '/' + name || url.search || url.hash || !url.username || !url.password)
    throw new Error('A verified connection to the dedicated pilot database is required');
  return url;
}
