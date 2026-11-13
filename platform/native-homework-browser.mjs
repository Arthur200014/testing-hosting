import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TAS_BROWSER_BASE || 'http://127.0.0.1:8766';
const programId = '11111111-1111-4111-8111-111111111111';
const memberId = '22222222-2222-4222-8222-222222222222';
const studentId = '33333333-3333-4333-8333-333333333333';
const programs = [{ id: programId, displayName: 'Synthetic language', isActive: true }];
const students = [{ membershipId: memberId, studentId, studentName: 'Test Student',
  programId, programName: 'Synthetic language', grade: '10', parentName: 'Synthetic parent',
  notes: 'Before edit' }];
let editCount = 0;
const tasks = [], assignments = [];
let submissionCount = 0, gradingCount = 0;
const browser = await chromium.launch({ headless: true });

async function mockApi(page) {
  await page.route('https://arthur200014-testing-hosting-8c4e.twc1.net/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1/', '');
    const headers = { 'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const body = request.postDataJSON?.() ?? {};
    const send = (value, status = 200) => route.fulfill({ status,
      contentType: 'application/json', headers, body: JSON.stringify(value) });
    if (path === 'teacher-sessions' && request.method() === 'POST')
      return send({ accessToken: 'teacher-test-token', expiresAt: new Date(Date.now() + 300000).toISOString() });
    if (path === 'student-sessions' && request.method() === 'POST') {
      assert.equal(body.workspace, 'synthetic');
      assert.equal(body.code, 'SYNTHETIC-CODE');
      return send({ accessToken: 'student-test-token', student: { displayName: 'Test Student' } });
    }
    if (path === 'teacher/students/' + memberId + '/edit' && request.method() === 'POST') {
      assert.equal(body.expectedStudentName, 'Test Student');
      assert.equal(body.expectedProfile.grade, '10');
      assert.equal(body.studentName, 'Renamed Student');
      assert.equal(body.profile.grade, '11');
      assert.equal(body.profile.notes, 'After edit');
      students[0] = { ...students[0], studentName: body.studentName, ...body.profile };
      editCount++;
      return send(students[0]);
    }
    if (path === 'teacher/homework/native/tasks' && request.method() === 'POST') {
      assert.equal(body.programId, programId);
      assert.equal(body.title, 'Explain the rule');
      assert.equal(body.prompt, 'Write an explanation with an example.');
      assert.ok(body.requestId);
      const task = { id: crypto.randomUUID(), programId, title: body.title, prompt: body.prompt,
        createdAt: new Date().toISOString() };
      tasks.push(task);
      return send(task, 201);
    }
    if (path === 'teacher/homework/native/assignments' && request.method() === 'POST') {
      assert.equal(body.taskId, tasks[0]?.id);
      assert.deepEqual(body.membershipIds, [memberId]);
      assert.equal(body.deadlineHours, 24);
      assert.ok(body.requestId);
      const assignment = { id: crypto.randomUUID(), taskId: body.taskId, membershipId: memberId,
        programId, title: tasks[0].title, prompt: tasks[0].prompt,
        assignedAt: new Date().toISOString(), deadlineAt: new Date(Date.now() + 86400000).toISOString(),
        answer: null, submittedAt: null, scorePercent: null, teacherFeedback: null, gradedAt: null };
      assignments.push(assignment);
      return send([assignment.id], 201);
    }
    if (path === 'teacher/homework/native/grades' && request.method() === 'POST') {
      assert.equal(body.assignmentId, assignments[0]?.id);
      assert.equal(body.scorePercent, 85);
      assert.equal(body.feedback, 'Well explained');
      assert.ok(body.requestId);
      assignments[0].scorePercent = body.scorePercent;
      assignments[0].teacherFeedback = body.feedback;
      assignments[0].gradedAt = new Date().toISOString();
      gradingCount++;
      return send({ id: assignments[0].id, scorePercent: body.scorePercent,
        teacherFeedback: body.feedback, gradedAt: assignments[0].gradedAt }, 201);
    }
    if (path === 'homework/native/submissions' && request.method() === 'POST') {
      assert.equal(body.assignmentId, assignments[0]?.id);
      assert.equal(body.answer, 'My explanation');
      assert.ok(body.submissionId);
      assignments[0].answer = body.answer;
      assignments[0].submittedAt = new Date().toISOString();
      submissionCount++;
      return send({ id: assignments[0].id, submittedAt: assignments[0].submittedAt }, 201);
    }
    if (request.method() === 'GET') {
      const reads = {
        'teacher/students': students,
        'teacher/programs': programs,
        'teacher/lessons': [{
          id: 'lesson-test', lessonAt: new Date(Date.now() - 86400000).toISOString(),
          participants: [{ membershipId: memberId, attendanceStatus: 'Present',
            durationMinutes: 60, topicComment: 'Synthetic lesson' }]
        }],
        'teacher/homework/catalog': [],
        'teacher/homework/assignments': [],
        'teacher/homework/submissions': [],
        'teacher/homework/native/tasks': tasks,
        'teacher/homework/native/assignments': assignments,
        'teacher/subscriptions': [],
        'teacher/tests/history': [],
        'teacher/tests/attempts': [],
        'teacher/mocks/results': [],
        'homework/native/assignments': assignments
      };
      if (Object.hasOwn(reads, path)) return send(reads[path]);
    }
    throw new Error(`Unexpected browser API request: ${request.method()} ${path}`);
  });
}

try {
  const teacher = await browser.newPage();
  const student = await browser.newPage();
  await mockApi(teacher);
  await mockApi(student);
  await teacher.goto(base + '/platform/teacher.html');
  await teacher.locator('#loginForm [name="workspace"]').fill('synthetic');
  await teacher.locator('#loginForm [name="email"]').fill('teacher@example.invalid');
  await teacher.locator('#loginForm [name="password"]').fill('synthetic-password');
  await teacher.locator('#loginForm button[type="submit"]').click();
  await teacher.locator('[data-view="students"]').click();
  await teacher.locator('[data-edit-student="' + memberId + '"]').click();
  await teacher.locator('#studentEditForm [name="studentName"]').fill('Renamed Student');
  await teacher.locator('#studentEditForm [name="grade"]').fill('11');
  await teacher.locator('#studentEditForm [name="notes"]').fill('After edit');
  await teacher.locator('#studentEditForm button[type="submit"]').click();
  await teacher.locator('#studentRows').getByText('Renamed Student').waitFor();
  assert.equal(editCount, 1);
  await teacher.locator('[data-view="homework"]').click();
  await teacher.locator('#nativeTaskForm [name="title"]').fill('Explain the rule');
  await teacher.locator('#nativeTaskForm [name="prompt"]').fill('Write an explanation with an example.');
  await teacher.locator('#nativeTaskForm button[type="submit"]').click();
  await teacher.locator('#nativeAssignForm [name="taskId"] option[value]:not([value=""])').waitFor({ state: 'attached' });
  await teacher.locator('#nativeAssignForm [name="taskId"]').selectOption(tasks[0].id);
  await teacher.locator('#nativeAssignForm input[name="membershipId"]').check();
  await teacher.locator('#nativeAssignForm button[type="submit"]').click();
  await teacher.locator('#content').getByText('Встроенные ДЗ и ответы').waitFor();
  assert.equal(assignments.length, 1);
  await teacher.locator('#content').getByText('Ожидает сдачи').waitFor();
  await teacher.locator('[data-view="overview"]').click();
  await teacher.locator('#content').getByText('из каталога 0 · встроенных 1').waitFor();
  await teacher.locator('[data-view="homework"]').click();
  await teacher.locator('#content').getByText('Встроенные ДЗ и ответы').waitFor();

  await student.goto(base + '/platform/student.html');
  await student.locator('#loginForm [name="workspace"]').fill('synthetic');
  await student.locator('#loginForm [name="code"]').fill('SYNTHETIC-CODE');
  await student.locator('#loginForm button').click();
  await student.locator('#assignments form[data-assignment]').waitFor();
  await student.locator('#assignments').getByText('Ожидает сдачи').waitFor();
  // Simulate an expired deadline without writing to any live database.
  assignments[0].deadlineAt = new Date(Date.now() - 60_000).toISOString();
  await student.locator('#logout').click();
  await student.locator('#loginForm [name="workspace"]').fill('synthetic');
  await student.locator('#loginForm [name="code"]').fill('SYNTHETIC-CODE');
  await student.locator('#loginForm button').click();
  await student.locator('#assignments').getByText('Просрочено · можно сдать').waitFor();
  await teacher.locator('#refresh').click();
  await teacher.locator('#content').getByText('Просрочено · можно сдать').waitFor();
  await student.locator('#assignments textarea[name="answer"]').fill('My explanation');
  await student.locator('#assignments button[type="submit"]').click();
  await student.locator('#assignments .answer').getByText('My explanation').waitFor();
  await student.locator('#assignments').getByText('Сдано с опозданием').waitFor();
  assert.equal(submissionCount, 1);
  assert.match(await student.locator('#assignments').innerText(), /без оценки/);

  await teacher.locator('#refresh').click();
  await teacher.locator('#content .item').getByText('My explanation').waitFor();
  await teacher.locator('#content').getByText('Сдано с опозданием').waitFor();
  assert.match(await teacher.locator('#content').innerText(), /Без оценки/);
  assert.equal(assignments[0].scorePercent, null);
  await teacher.locator('[data-native-grade] input[name="scorePercent"]').fill('85');
  await teacher.locator('[data-native-grade] textarea[name="feedback"]').fill('Well explained');
  await teacher.locator('[data-native-grade] button[type="submit"]').click();
  await teacher.locator('#content').getByText('85%').waitFor();
  assert.equal(gradingCount, 1);
  await student.locator('#logout').click();
  await student.locator('#loginForm [name="workspace"]').fill('synthetic');
  await student.locator('#loginForm [name="code"]').fill('SYNTHETIC-CODE');
  await student.locator('#loginForm button').click();
  await student.locator('#assignments').getByText('Well explained').waitFor();
  assert.match(await student.locator('#assignments').innerText(), /85%/);
  await teacher.locator('[data-view="report"]').click();
  await teacher.locator('#content').getByText('Встроенное ДЗ').waitFor();
  await teacher.locator('#content').getByText('Сдано с опозданием').waitFor();
  assert.match(await teacher.locator('#content').innerText(), /Well explained/);
  assert.match(await teacher.locator('#content').innerText(), /85%/);
  assert.match(await teacher.locator('#content').innerText(), /Для расчёта нужны оценённые ДЗ и тесты/);
  console.log('PASS: teacher edited existing synthetic student, native homework assigned, submitted, graded and reported');
} finally {
  await browser.close();
}
