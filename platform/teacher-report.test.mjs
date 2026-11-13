import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTeacherReport, collectTeacherHomework } from './teacher-report.mjs';

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

test('native graded and ungraded submissions join the period without double-counting source records', () => {
  const data = {
    lessons: [
      { lessonAt: '2026-11-04T15:00:00Z', participants: [participant(own, 'Present')] },
      { lessonAt: '2026-11-08T15:00:00Z', participants: [participant(own, 'Present')] }
    ],
    assignments: [
      { id: 'same-id', membershipId: own, name: 'Catalog: algebra', assignedAt: '2026-11-05T10:00:00Z',
        submittedAt: '2026-11-06T10:00:00Z', scorePercent: 60 },
      { id: 'same-id', membershipId: own, name: 'Duplicate API row', assignedAt: '2026-11-05T10:00:00Z',
        submittedAt: '2026-11-06T10:00:00Z', scorePercent: 60 },
      { id: 'old', membershipId: own, assignedAt: '2026-11-03T10:00:00Z', scorePercent: 0 },
      { id: 'foreign', membershipId: other, assignedAt: '2026-11-05T10:00:00Z', scorePercent: 0 }
    ],
    nativeAssignments: [
      { id: 'same-id', membershipId: own, title: 'Native: explanation', assignedAt: '2026-11-06T10:00:00Z',
        submittedAt: '2026-11-07T10:00:00Z', scorePercent: 90, teacherFeedback: 'Clear argument' },
      { id: 'native-2', membershipId: own, title: 'No score yet', assignedAt: '2026-11-07T10:00:00Z',
        submittedAt: '2026-11-08T10:00:00Z', scorePercent: null },
      { id: 'native-3', membershipId: own, title: 'Waiting for answer', assignedAt: '2026-11-09T10:00:00Z',
        submittedAt: null, scorePercent: null },
      { id: 'outside', membershipId: own, title: 'Future', assignedAt: '2026-11-12T10:00:00Z',
        submittedAt: null, scorePercent: null },
      { id: 'foreign-native', membershipId: other, title: 'Wrong student',
        assignedAt: '2026-11-06T10:00:00Z', submittedAt: null, scorePercent: null }
    ],
    tests: [{ membershipId: own, testId: 'test', taskNumber: 6,
      testDate: '2026-11-06', scorePercent: 80 }]
  };
  const report = buildTeacherReport(data, own, new Date('2026-11-10T12:00:00Z'));
  assert.equal(report.from, '2026-11-04');
  assert.equal(report.homework.length, 4); // catalog + 3 native, no duplicate catalog ID
  assert.deepEqual(report.homework.map(x => x.source).sort(), ['catalog', 'native', 'native', 'native']);
  assert.equal(report.homework.find(x => x.title === 'Native: explanation').name, 'Native: explanation');
  assert.equal(report.homework.find(x => x.title === 'Native: explanation').teacherFeedback, 'Clear argument');
  assert.equal(report.submittedCount, 3);
  assert.equal(report.homeworkAveragePercent, 75);
  assert.equal(report.testAveragePercent, 80);
  assert.equal(report.progressPercent, 76); // (60 + 90) / 2 * .8 + 80 * .2
  const overviewItems = collectTeacherHomework(data);
  assert.equal(overviewItems.find(x => x.id === 'old').isSubmitted, true); // legacy 0% is a known grade
  assert.equal(overviewItems.filter(x => !x.isSubmitted).length, 3);
  assert.equal(overviewItems.filter(x => x.source === 'native' && !x.isSubmitted).length, 3);
});

test('native-only grades contribute to homework, while missing test scores stay unknown', () => {
  const report = buildTeacherReport({
    lessons: [{ lessonAt: '2026-11-05T12:00:00Z', participants: [participant(own, 'Present')] }],
    nativeAssignments: [
      { id: 'a', membershipId: own, title: 'Zero is a real score',
        assignedAt: '2026-11-06T12:00:00Z', submittedAt: '2026-11-07T12:00:00Z', scorePercent: 0 },
      { id: 'b', membershipId: own, title: 'Not evaluated',
        assignedAt: '2026-11-06T12:00:00Z', submittedAt: '2026-11-07T12:00:00Z', scorePercent: null },
      { id: 'c', membershipId: other, title: 'Other learner',
        assignedAt: '2026-11-06T12:00:00Z', submittedAt: '2026-11-07T12:00:00Z', scorePercent: 100 }
    ]
  }, own, new Date('2026-11-08T12:00:00Z'));
  assert.equal(report.homework.length, 2);
  assert.equal(report.submittedCount, 2);
  assert.equal(report.homeworkAveragePercent, 0);
  assert.equal(report.testAveragePercent, null);
  assert.equal(report.progressPercent, null);
});
