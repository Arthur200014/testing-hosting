import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeHomeworkDeadlineStatus as status } from './homework-deadline.mjs';

const now = new Date('2026-11-13T18:00:00Z');
const deadlineAt = '2026-11-13T18:00:00Z';
const get = x => status({ deadlineAt, ...x }, now);

test('pending homework is due through the exact deadline, overdue immediately afterward', () => {
  assert.equal(get({}).key, 'awaiting');
  assert.equal(status({ deadlineAt: '2026-11-13T17:59:59Z' }, now).key, 'overdue');
  assert.equal(status({ deadlineAt: '2026-11-13T18:00:01Z' }, now).key, 'awaiting');
  assert.equal(status({ deadlineAt: '2026-11-13T19:00:00+01:00' }, now).key, 'awaiting');
  assert.match(status({ deadlineAt: '2026-11-13T17:00:00Z' }, now).label, /можно сдать/);
});

test('submission status is fixed by submission instant and not grading or viewing time', () => {
  assert.deepEqual(get({ submittedAt: deadlineAt }), { key: 'submitted-on-time', label: 'Сдано вовремя' });
  assert.equal(get({ submittedAt: '2026-11-13T17:59:59Z' }).key, 'submitted-on-time');
  assert.equal(get({ submittedAt: '2026-11-13T18:00:01Z' }).key, 'submitted-late');
  assert.equal(get({ submittedAt: '2026-11-13T18:00:01Z', scorePercent: 100 }).key, 'submitted-late');
  assert.equal(status({ deadlineAt, submittedAt: '2026-11-13T18:00:01Z' },
    new Date('2030-01-01T00:00:00Z')).key, 'submitted-late');
});

test('missing or invalid dates are unknown instead of falsely late', () => {
  assert.equal(status({}).key, 'unknown');
  assert.equal(status({ deadlineAt: 'invalid' }, now).key, 'unknown');
  assert.equal(status({ deadlineAt: 'invalid', submittedAt: deadlineAt }, now).key, 'submitted-unknown');
});
