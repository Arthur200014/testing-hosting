import { groupHomeworkKey, contextHomeworkKey } from './teacher-data.mjs';
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
    else if(form.id==='classNativeAssignForm' || (form.id==='lessonNativeAssignForm' && !form.dataset.groupId)) input.checked=true;
  }
  form.querySelector('button[type="submit"]').disabled=!task || !form.querySelector('input[name="groupMember"]:checked');
}
export function groupHomeworkStatus(x) {
  return x.scorePercent != null ? 'graded' : x.submittedAt ? 'submitted' :
    nativeHomeworkDeadlineStatus(x).key === 'overdue' ? 'overdue' : 'awaiting';
}
export function homeworkAudience(item, data, lesson = null) {
  const ids = new Set(item.kind === 'group' ? (item.members || []).filter(m=>m.isApproved).map(m=>m.membershipId) : [item.studentMembershipId]);
  const participants = lesson && new Set((lesson.participants || []).map(p=>p.membershipId));
  return (data.students || []).filter(m=>ids.has(m.membershipId) && m.isActive!==false && (!participants || participants.has(m.membershipId)));
}
export function renderGroupHomework(item, data, safe, date, list, gradeControls = () => '') {
  return renderContextHomework({...item,kind:'group'}, data, safe, date, list, gradeControls);
}
export function renderContextHomework(item, data, safe, date, list, gradeControls = () => '', lesson = null) {
  const key=contextHomeworkKey(item,lesson);
  if(!Array.isArray(data.nativeTasks) || !Array.isArray(data[key]))
    return '<section class="class-subsection"><h3>Задания</h3><p role="status">Загружаем задания…</p><button type="button" class="secondary" data-retry-overview>Повторить загрузку</button></section>';
  const members=homeworkAudience(item,data,lesson), programIds=[...new Set(members.map(m=>m.programId))];
  const tasks=(data.nativeTasks || []).filter(t=>programIds.includes(t.programId));
  const assignments=item.persistent===false ? data[key].filter(x=>x.membershipId===item.studentMembershipId && !x.groupClassId) : data[key];
  const prefix=lesson?'lesson':item.kind==='group'?'group':'class';
  const attrs=`data-class-id="${safe(item.id)}" data-group-id="${item.kind==='group'?safe(item.id):''}" ${lesson?`data-lesson-id="${safe(lesson.id)}"`:''}`;
  const title=lesson?'Домашнее задание занятия':item.kind==='group'?'Задания группы':'Задания ученика';
  const topicIds=new Set((data.lessonTopicSets || []).find(x=>x.lessonId===lesson?.id)?.topicIds || []);
  const recommended=new Set((data.topicTaskLinks || []).filter(x=>topicIds.has(x.topicId)).map(x=>x.taskId));
  const taskOptions=tasks.map(t=>`<option value="${safe(t.id)}">${recommended.has(t.id)?'Из темы занятия · ':''}${safe(t.title)}</option>`).join('');
  return `<section class="class-subsection stack" data-group-homework="${safe(lesson?.id || item.id)}" data-context-homework><h3>${title}</h3>
    ${item.isArchived?'<p class="muted">Класс в архиве: новые назначения недоступны.</p>':`<div class="grid two">
      <form id="${prefix}NativeTaskForm" class="card stack" ${attrs} data-context-task><h3>Новый шаблон</h3>
        <label>Программа<select name="programId" required>${programIds.map(id=>`<option value="${safe(id)}">${safe((data.programs || []).find(p=>p.id===id)?.displayName || members.find(m=>m.programId===id)?.programName || 'Программа ученика')}</option>`).join('')}</select></label>
        <label>Название<input name="title" maxlength="200" required placeholder="Название задания"></label>
        <label>Условие<textarea name="prompt" maxlength="10000" required placeholder="Текст задания"></textarea></label>
        <p class="muted small">Шаблон сохраняется в программе без автоматического назначения и доступен другим классам этой программы.</p>
        <div class="row"><button type="submit" class="primary" ${members.length?'':'disabled'}>Создать шаблон</button><button type="button" class="secondary" data-class-task-cancel>Отмена</button></div>
      </form>
      <form id="${prefix}NativeAssignForm" class="card stack" ${attrs} data-context-assign><h3>Назначить из шаблонов</h3>
        <label>Шаблон<select name="taskId" required><option value="">Выберите шаблон</option>${taskOptions}</select></label>
        <label>Срок<select name="deadlineHours"><option value="24">24 часа</option><option value="48">48 часов</option><option value="72">72 часа</option></select></label>
        <strong>Кому назначить</strong>
        ${members.map(m=>`<label class="class-rule-active" style="flex-direction:row;justify-content:flex-start"><input type="checkbox" name="groupMember" value="${safe(m.membershipId)}" data-program="${safe(m.programId)}" style="padding:0;min-height:16px;margin:0" disabled><span>${safe(m.studentName)}</span></label>`).join('')}
        <p class="muted small">Выберите шаблон и получателей с той же программой.${lesson?' Назначение будет связано с этим занятием.':''}</p>
        <div class="row"><button type="submit" class="primary" disabled>${item.kind==='group'?'Назначить выбранным':'Назначить ученику'}</button><button type="button" class="secondary" data-class-task-cancel>Отмена</button></div>
      </form></div>`}
    <div class="section-head"><h3>Назначения и сдачи</h3><span class="muted small">Последние ${assignments.length} · максимум 300</span></div>
    ${!lesson && item.kind!=='group'?'<p class="muted small">Включая прежние личные назначения ученику без привязки к классу. Групповые назначения показаны в группе.</p>':''}
    <label>Показать<select data-group-homework-filter><option value="all">Все</option><option value="awaiting">Ожидают сдачи</option><option value="overdue">Просрочены</option><option value="submitted">Нужна проверка</option><option value="graded">Проверены</option></select></label>
    <p class="muted small">Сдано: ${assignments.filter(x=>x.submittedAt).length} · Проверено: ${assignments.filter(x=>x.scorePercent!=null).length}</p>
    ${list(assignments,'Назначений пока нет.',x=>`<div class="item" data-group-assignment="${safe(x.id)}" data-homework-status="${groupHomeworkStatus(x)}"><div style="min-width:0;width:100%;overflow-wrap:anywhere"><strong>${safe(x.title)}</strong><small>${safe((data.students || []).find(s=>s.membershipId===x.membershipId)?.studentName || 'Ученик')} · До ${safe(date(x.deadlineAt))}</small>
      ${x.lessonId?'<small>Назначено из занятия</small>':''}<p class="small">${safe(nativeHomeworkDeadlineStatus(x).label)} · ${x.scorePercent!=null ? 'Оценка: '+safe(x.scorePercent)+'%' : x.submittedAt ? 'Нужна проверка' : 'Без ответа'}</p>
      <details data-group-answer><summary>Открыть работу</summary><div class="stack" style="margin-top:12px"><strong>Условие</strong><p style="white-space:pre-wrap">${safe(x.prompt)}</p><strong>Ответ ученика</strong><p style="white-space:pre-wrap">${safe(x.answer || 'Ответ пока не отправлен.')}</p>${x.submittedAt?`<small>Сдано ${safe(date(x.submittedAt))}</small>`:''}${item.isArchived ? (x.teacherFeedback?`<p>${safe(x.teacherFeedback)}</p>`:'') : gradeControls(x)}</div></details>
    </div></div>`)}
    <p data-group-homework-empty hidden role="status">Нет заданий с выбранным статусом.</p>
    <details><summary>Шаблоны программы · ${tasks.length}</summary>${list(tasks,'Шаблонов пока нет.',t=>`<div class="item"><div><strong>${safe(t.title)}</strong><p style="white-space:pre-wrap">${safe(t.prompt)}</p></div></div>`)}</details>
  </section>`;
}
