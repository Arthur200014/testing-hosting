import test from 'node:test';
import assert from 'node:assert/strict';
import './homework-gas-core.js';

const core = globalThis.HomeworkGasCore;
const submission = { action: 'submitHomework', assignmentId: 'HW-EGE01-TEST', eventId: 'evt' };

function gatewayFor(text, status = 200) {
  const calls = [];
  const gateway = core.create({ fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return { ok: status >= 200 && status < 300, status, text: async () => text };
  } });
  return { gateway, calls };
}

test('only the real GAS saved acknowledgment completes a homework submission', async () => {
  const { gateway, calls } = gatewayFor(JSON.stringify({ ok: true, saved: true, assignmentId: submission.assignmentId }));
  assert.equal((await gateway.post(submission)).saved, true);
  assert.equal(calls[0].options.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.equal(JSON.parse(calls[0].options.body).eventId, 'evt');
});

test('ambiguous, malformed, failed and mismatched responses never count as saved', async () => {
  for (const body of [
    '', '<html>login</html>', '{}', '{"success":true}', '{"ok":true}',
    '{"ok":true,"saved":false}', '{"ok":false,"saved":true}',
    '{"ok":true,"saved":true,"assignmentId":"another"}'
  ]) {
    await assert.rejects(gatewayFor(body).gateway.post(submission), undefined, body);
  }
  await assert.rejects(gatewayFor('{"ok":true,"saved":true}', 500).gateway.post(submission));
});

test('status checks require a boolean submitted response', async () => {
  const payload = { action: 'checkHomeworkSubmission', studentId: 'S-1', assignmentId: submission.assignmentId };
  assert.deepEqual(await gatewayFor('{"ok":true,"submitted":false}').gateway.post(payload), { ok: true, submitted: false });
  assert.deepEqual(await gatewayFor('{"ok":true,"result":{"submitted":true}}').gateway.post(payload), { ok: true, result: { submitted: true }, submitted: true });
  assert.equal((await gatewayFor('{"ok":true,"result":{"exists":true}}').gateway.post(payload)).submitted, true);
  assert.equal((await gatewayFor('{"ok":true,"data":{"hasSubmitted":false}}').gateway.post(payload)).submitted, false);
  assert.equal((await gatewayFor('{"ok":true,"canSubmit":false}').gateway.post(payload)).submitted, true);
  await assert.rejects(gatewayFor('{"ok":true}').gateway.post(payload));
});

test('failed saves display a shared warning until a confirmed retry succeeds', async () => {
  const elements = new Map();
  const documentRef = {
    body: { appendChild(element) { elements.set(element.id, element); } },
    createElement: () => ({ style: {}, setAttribute() {}, remove() { elements.delete(this.id); } }),
    getElementById: id => elements.get(id)
  };
  let answer = '{"ok":false,"error":"Нет назначения"}';
  const gateway = core.create({ documentRef, fetchImpl: async () => ({ ok: true, text: async () => answer }) });
  await assert.rejects(gateway.post(submission), /Нет назначения/);
  assert.match(elements.get('homework-gas-save-status').textContent, /НЕ записан в таблицу/);
  answer = '{"ok":true,"saved":true}';
  await gateway.post(submission);
  assert.equal(elements.has('homework-gas-save-status'), false);
});

test('exit-time send is unconfirmed and leaves acknowledgment to the normal retry', () => {
  const calls = [];
  const gateway = core.create({ fetchImpl: (url, options) => {
    calls.push(options);
    return Promise.resolve({ ok: true });
  } });
  assert.equal(gateway.sendKeepalive(submission), true);
  assert.equal(calls[0].keepalive, true);
});

test('student validation uses the shared JSONP endpoint and cleans up callback', async () => {
  let script;
  const documentRef = {
    createElement: () => ({ remove() { this.removed = true; } }),
    head: { appendChild(node) { script = node; } }
  };
  const gateway = core.create({ documentRef });
  const pending = gateway.validateStudentCode(' ab12 ');
  const query = new URL(script.src).searchParams;
  assert.equal(query.get('action'), 'validateStudent');
  assert.equal(query.get('code'), 'AB12');
  const callback = query.get('callback');
  globalThis[callback]({ ok: true, studentId: 'S-1' });
  assert.equal((await pending).studentId, 'S-1');
  assert.equal(globalThis[callback], undefined);
  assert.equal(script.removed, true);
});

test('wrapped legacy JSONP student and status responses remain compatible', async () => {
  let script;
  const documentRef = {
    createElement: () => ({ remove() {} }),
    head: { appendChild(node) { script = node; } }
  };
  const gateway = core.create({ documentRef });
  const student = gateway.validateStudentCode('AB');
  globalThis[new URL(script.src).searchParams.get('callback')]({ ok: true, student: { studentId: 'S-1', name: 'Ada' } });
  assert.equal((await student).student.studentId, 'S-1');
  const status = gateway.jsonp({ action: 'checkHomeworkSubmission', studentId: 'S-1', assignmentId: submission.assignmentId });
  globalThis[new URL(script.src).searchParams.get('callback')]({ ok: true, result: { submitted: false } });
  assert.equal((await status).submitted, false);
});

test('JSONP refuses homework writes because GAS only accepts them via POST', async () => {
  await assert.rejects(core.jsonp(submission), /только через POST/);
});
