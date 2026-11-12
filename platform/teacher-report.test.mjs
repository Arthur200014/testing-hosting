import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTeacherReport } from './teacher-report.mjs';

const own = 'student-1', other = 'student-2';
const participant = (membershipId, attendanceStatus) => ({ membershipId, attendanceStatus });

test('last eight lessons include only the selected student and score best tests with 80/20', () => {
  const lessons = Array.from({ length: 9 }, (_, i) => ({
    id: String(i), lessonAt: `2026-11-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
    participants: [participant(own, i === 8 ? 'Absent' : 'Present'), participant(other, 'Present')]
  }));
  const report = buildTeacherReport({
    lessons: [...lessons, { lessonAt: '2026-11-11T12:00:00Z', participants: [participant(own, 'Unknown')] }],
    assignments: [
      { membershipId: own, assignedAt: '2026-11-02T15:00:00Z', submittedAt: '2026-11-03T15:00:00Z', scorePercent: 80 },
      { membershipId: own, assignedAt: '2026-11-08T15:00:00Z', submittedAt: null, scorePercent: null },
      { membershipId: other, assignedAt: '2026-11-08T15:00:00Z', submittedAt: null, scorePercent: 0 },
      { membershipId: own, assignedAt: '2026-11-01T15:00:00Z', submittedAt: null, scorePercent: 0 }
    ],
    tests: [
      { membershipId: own, testId: 'a', taskNumber: 6, topicName: 'Topic', testDate: '2026-11-03', scorePercent: 40 },
      { membershipId: own, testId: 'a', taskNumber: 6, topicName: 'Topic', testDate: '2026-11-04', scorePercent: 90 },
      { membershipId: other, testId: 'b', taskNumber: 6, topicName: 'Topic', testDate: '2026-11-04', scorePercent: 0 }
    ],
    liveTests: [{ membershipId: own, testId: 'a', taskNumber: 6, topic: 'Topic',
      completedAt: '2026-11-05T12:00:00Z', percent: 70 }],
    mocks: [{ membershipId: own, mockDate: '2026-11-09', scorePercent: 60 }]
  }, own, new Date('2026-11-10T12:00:00Z'));

  assert.equal(report.from, '2026-11-02');
  assert.equal(report.lessons.length, 8);
  assert.equal(report.presentCount, 7);
  assert.equal(report.absentCount, 1);
  assert.equal(report.homework.length, 2);
  assert.equal(report.submittedCount, 1);
  assert.equal(report.homeworkAveragePercent, 80);
  assert.equal(report.tests.length, 1);
  assert.equal(report.testAveragePercent, 90);
  assert.equal(report.progressPercent, 82);
  assert.equal(report.mocks.length, 1);
});

test('missing grades or tests stay unknown, including an empty lesson history', () => {
  const lesson = { lessonAt: '2026-11-01T22:30:00Z', participants: [participant(own, 'Unknown')] };
  const report = buildTeacherReport({
    lessons: [lesson],
    assignments: [{ membershipId: own, assignedAt: '2026-11-02T00:00:00Z',
      submittedAt: '2026-11-02T12:00:00Z', scorePercent: null }]
  }, own, new Date('2026-11-03T00:00:00Z'));
  assert.equal(report.from, '2026-11-02');
  assert.equal(report.submittedCount, 1);
  assert.equal(report.homeworkAveragePercent, null);
  assert.equal(report.testAveragePercent, null);
  assert.equal(report.progressPercent, null);
  assert.equal(report.presentCount, 0);
  assert.equal(report.absentCount, 0);

  const empty = buildTeacherReport({ assignments: [{ membershipId: own, assignedAt: '2026-11-02T00:00:00Z' }] }, own);
  assert.equal(empty.from, null);
  assert.equal(empty.homework.length, 0);
  assert.equal(empty.progressPercent, null);
});
