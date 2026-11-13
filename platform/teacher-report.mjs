const moscowDay = value => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(instant).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const average = values => values.length
  ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

// Legacy catalog and TAS-native tasks are independent assignments. Only identical
// records repeated within the same source can be collapsed; matching titles/dates
// across sources are not a reliable identity and must not silently remove work.
export function collectTeacherHomework(data) {
  const seen = new Set();
  const rows = [
    ...(data.assignments || []).map(item => ({
      ...item, source: 'catalog', isSubmitted: Boolean(item.submittedAt) ||
        ['submitted', 'completed'].includes(String(item.status).toLowerCase()) ||
        Number.isFinite(item.scorePercent)
    })),
    ...(data.nativeAssignments || []).map(item => ({
      ...item, source: 'native', name: item.title, isSubmitted: Boolean(item.submittedAt)
    }))
  ];
  return rows.filter(item => {
    if (!item.membershipId) return false;
    if (item.id == null || item.id === '') return true;
    const key = `${item.source}\u0000${item.membershipId}\u0000${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildTeacherReport(data, membershipId, asOf = new Date()) {
  const lessons = (data.lessons || [])
    .filter(lesson => new Date(lesson.lessonAt) <= asOf &&
      lesson.participants?.some(item => item.membershipId === membershipId))
    .sort((a, b) => new Date(b.lessonAt) - new Date(a.lessonAt) || String(b.id).localeCompare(String(a.id)))
    .slice(0, 8)
    .map(lesson => ({ ...lesson, participation: lesson.participants.find(item => item.membershipId === membershipId) }));
  const from = lessons.length ? moscowDay(lessons.at(-1).lessonAt) : null;
  const through = moscowDay(asOf);
  const inPeriod = value => {
    const day = moscowDay(value);
    return from && day && day >= from && day <= through;
  };
  const homework = collectTeacherHomework(data)
    .filter(item => item.membershipId === membershipId && inPeriod(item.assignedAt))
    .sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt));
  const submittedCount = homework.filter(item => item.isSubmitted).length;
  const homeworkAveragePercent = average(homework
    .filter(item => Number.isFinite(item.scorePercent))
    .map(item => item.scorePercent));

  const attempts = [
    ...(data.tests || []).filter(item => item.membershipId === membershipId && inPeriod(item.testDate))
      .map(item => ({ testId: item.testId, topic: item.topicName, taskNumber: item.taskNumber,
        percent: item.scorePercent, at: item.testDate })),
    ...(data.liveTests || []).filter(item => item.membershipId === membershipId && inPeriod(item.completedAt))
      .map(item => ({ testId: item.testId, topic: item.topic, taskNumber: item.taskNumber,
        percent: item.percent, at: item.completedAt }))
  ].filter(item => Number.isFinite(item.percent));
  const bestByTest = new Map();
  for (const item of attempts) {
    const key = `${item.testId}\u0000${item.taskNumber}`;
    if (!bestByTest.has(key) || bestByTest.get(key).percent < item.percent)
      bestByTest.set(key, item);
  }
  const tests = [...bestByTest.values()].sort((a, b) => b.at.localeCompare(a.at));
  const testAveragePercent = average(tests.map(item => item.percent));
  const progressPercent = homeworkAveragePercent == null || testAveragePercent == null
    ? null : Math.round(homeworkAveragePercent * 0.8 + testAveragePercent * 0.2);
  const mocks = (data.mocks || [])
    .filter(item => item.membershipId === membershipId && inPeriod(item.mockDate))
    .sort((a, b) => b.mockDate.localeCompare(a.mockDate));

  return {
    from, through: from ? through : null, lessons, homework, submittedCount,
    presentCount: lessons.filter(item => item.participation.attendanceStatus === 'Present').length,
    absentCount: lessons.filter(item => item.participation.attendanceStatus === 'Absent').length,
    homeworkAveragePercent, tests, testAveragePercent, progressPercent, mocks
  };
}
