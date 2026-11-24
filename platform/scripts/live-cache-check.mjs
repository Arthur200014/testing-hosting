import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';

const api = 'https://arthur200014-testing-hosting-8c4e.twc1.net/api/v1/';
const expectation = process.env.TAS_EXPECT_CACHE || 'report';
const email = 'tas-cache-check-' + randomUUID() + '@example.invalid';
const password = 'Synthetic-9!' + randomBytes(24).toString('hex');
let token;

async function call(path, {body, authorized = true, method = body ? 'POST' : 'GET'} = {}) {
  return fetch(api + path, {
    method, cache:'no-store', signal:AbortSignal.timeout(15000),
    headers:{...(authorized && token ? {Authorization:'Bearer ' + token} : {}),
      ...(body ? {'Content-Type':'application/json'} : {})},
    body:body ? JSON.stringify(body) : undefined
  });
}

try {
  const signUp = await call('teacher-signups',{body:{email,password}});
  assert.equal(signUp.status,201,'Synthetic teacher registration');
  const signIn = await call('teacher-sessions',{body:{email,password}});
  assert.equal(signIn.status,200,'Synthetic teacher sign-in');
  token = (await signIn.json()).accessToken;
  assert.ok(token,'Test session should contain an access token');
  const anonymous = await call('teacher/programs',{authorized:false});
  assert.equal(anonymous.status,401,'Anonymous access denied');
  assert.equal(anonymous.headers.get('X-TAS-Cache'),null,'Anonymous requests receive no cache information');

  let first;
  for (let attempt=0; attempt<60; attempt++) {
    const response = await call('teacher/programs');
    if (response.ok && response.headers.has('X-TAS-Cache')) {
      first = response;
      break;
    }
    await response.body?.cancel();
    if (attempt < 59) await new Promise(resolve => setTimeout(resolve,8000));
  }
  assert.ok(first,'Published API did not return the cache header');
  assert.match(first.headers.get('Cache-Control') || '',/no-store/i);
  const second = await call('teacher/programs');
  assert.equal(second.status,200,'Repeated program lookup');
  const programs = await first.json();
  assert.ok(Array.isArray(programs) && programs.length > 0,'Programs remain available from the chosen data source');
  assert.deepEqual(await second.json(), programs);
  const statuses = [first.headers.get('X-TAS-Cache'),second.headers.get('X-TAS-Cache')];
  assert.ok(statuses.every(status => ['miss','hit','disabled','fallback'].includes(status)));
  console.log('Cache status for two real published requests: ' + statuses.join(' → '));
  if (expectation === 'enabled') assert.deepEqual(statuses,['miss','hit'],'Production Redis must store and serve the first lookup');
  else if (statuses.includes('fallback')) assert.fail('Redis is configured but the application used its fallback');
  else if (statuses[0] === 'disabled') assert.deepEqual(statuses,['disabled','disabled']);
  else assert.deepEqual(statuses,['miss','hit']);
  console.log('PASS: cache status and identical authorized program data; anonymous access denied');
} catch (error) {
  let message = String(error.message);
  for (const secret of [email,password,token].filter(Boolean)) message = message.replaceAll(secret,'[redacted]');
  console.error(message);
  process.exitCode = 1;
} finally {
  if (token) {
    try {
      const logOut = await call('teacher-sessions/logout',{method:'POST'});
      if (!logOut.ok) console.log('Synthetic session logout returned HTTP ' + logOut.status);
    } catch { console.log('Synthetic session logout could not reach the API'); }
  }
}
