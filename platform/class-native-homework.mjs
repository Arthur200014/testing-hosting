import { groupHomeworkKey } from './teacher-data.mjs';
import { nativeHomeworkDeadlineStatus } from './homework-deadline.mjs';

// Workspace-scoped teacher data must already come from the authenticated teacher API.
// Match both membership and program; a class is not interchangeable with a program.
export function individualClassNativeHomework(data, membershipId, programId) {
  const tasks = (data.nativeTasks || []).filter(task => task.programId === programId);
  const assignments = (data.nativeAssignments || [])
    .filter(assignment => assignment.membershipId === membershipId)
    .sort((a, b) => Date.parse(b.assignedAt || b.deadlineAt || 0) -
      Date.parse(a.assignedAt || a.deadlineAt || 0));
  return { tasks, assignments };
}

export function taskMatchesClass(task, programId) {
  return !!task && !!programId && task.programId === programId;
}

export function groupClassNativeHomework(data, item) {
  const approved = new Set((item.members || []).filter(x=>x.isApproved).map(x=>x.membershipId));
  const members = (data.students || []).filter(x=>approved.has(x.membershipId) && x.isActive!==false);
  const programs = new Set(members.map(x=>x.programId));
  return { members, tasks:(data.nativeTasks || []).filter(x=>programs.has(x.programId)),
    assignments:(data[groupHomeworkKey(item.id)] || []).filter(x=>x.groupClassId===item.id) };
}
export function updateGroupAssignmentChoices(form, data) {
  const task=(data.nativeTasks || []).find(x=>x.id===form.elements.taskId.value);
  for(const input of form.querySelectorAll('input[name="groupMember"]')) {
    input.disabled=!task || input.dataset.program!==task.programId;
    if(input.disabled) input.checked=false;
  }
  form.querySelector('button[type="submit"]').disabled=!task || !form.querySelector('input[name="groupMember"]:checked');
}
export function groupHomeworkStatus(x) {
  return x.scorePercent != null ? 'graded' : x.submittedAt ? 'submitted' :
    nativeHomeworkDeadlineStatus(x).key === 'overdue' ? 'overdue' : 'awaiting';
}
export function renderGroupHomework(item, data, safe, date, list, gradeControls = () => '') {
  if(!Array.isArray(data.nativeTasks) || !Array.isArray(data[groupHomeworkKey(item.id)]))
    return '<section class="class-subsection"><h3>Задания группы</h3><p role="status">Загружаем задания…</p></section>';
  const {members,tasks,assignments}=groupClassNativeHomework(data,item);
  return `<section class="class-subsection stack" data-group-homework="${safe(item.id)}"><h3>Задания группы</h3>
    ${item.isArchived?'<p class="muted">Класс в архиве: новые назначения недоступны.</p>':`<form id="groupNativeAssignForm" class="card stack" data-group-id="${safe(item.id)}">
      <label>Готовое задание<select name="taskId" required><option value="">Выберите шаблон</option>${tasks.map(t=>`<option value="${safe(t.id)}">${safe(t.title)}</option>`).join('')}</select></label>
      <label>Срок<select name="deadlineHours"><option value="24">24 часа</option><option value="48">48 часов</option><option value="72">72 часа</option></select></label>
      <strong>Кому назначить</strong>
      ${members.map(m=>`<label class="class-rule-active" style="flex-direction:row;justify-content:flex-start"><input type="checkbox" name="groupMember" value="${safe(m.membershipId)}" data-program="${safe(m.programId)}" style="padding:0;min-height:16px;margin:0" disabled><span>${safe(m.studentName)}</span></label>`).join('')}
      <p class="muted small">Выберите шаблон, затем участников с подходящей программой. Новый шаблон можно создать в разделе «Задания».</p>
      <div class="row"><button type="submit" class="primary" disabled>Назначить выбранным</button><button type="button" class="secondary" data-class-task-cancel>Отмена</button></div>
    </form>`}
    <div class="section-head"><h3>Назначения и сдачи</h3><span class="muted small">Последние ${assignments.length} · максимум 300</span></div>
    <label>Показать<select data-group-homework-filter><option value="all">Все</option><option value="awaiting">Ожидают сдачи</option><option value="overdue">Просрочены</option><option value="submitted">Нужна проверка</option><option value="graded">Проверены</option></select></label>
    <p class="muted small">Сдано: ${assignments.filter(x=>x.submittedAt).length} · Проверено: ${assignments.filter(x=>x.scorePercent!=null).length}</p>
    ${list(assignments,'Назначений этой группы пока нет.',x=>`<div class="item" data-group-assignment="${safe(x.id)}" data-homework-status="${groupHomeworkStatus(x)}"><div style="min-width:0;width:100%;overflow-wrap:anywhere"><strong>${safe(x.title)}</strong><small>${safe((data.students || []).find(s=>s.membershipId===x.membershipId)?.studentName || 'Ученик')} · До ${safe(date(x.deadlineAt))}</small>
      <p class="small">${safe(nativeHomeworkDeadlineStatus(x).label)} · ${x.scorePercent!=null ? 'Оценка: '+safe(x.scorePercent)+'%' : x.submittedAt ? 'Нужна проверка' : 'Без ответа'}</p>
      <details data-group-answer><summary>Открыть работу</summary><div class="stack" style="margin-top:12px"><strong>Условие</strong><p style="white-space:pre-wrap">${safe(x.prompt)}</p><strong>Ответ ученика</strong><p style="white-space:pre-wrap">${safe(x.answer || 'Ответ пока не отправлен.')}</p>${x.submittedAt?`<small>Сдано ${safe(date(x.submittedAt))}</small>`:''}${item.isArchived ? (x.teacherFeedback?`<p>${safe(x.teacherFeedback)}</p>`:'') : gradeControls(x)}</div></details>
    </div></div>`)}
    <p data-group-homework-empty hidden role="status">Нет заданий с выбранным статусом.</p>
  </section>`;
}
