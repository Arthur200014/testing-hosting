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
    assignments:(data.nativeAssignments || []).filter(x=>x.groupClassId===item.id) };
}
export function updateGroupAssignmentChoices(form, data) {
  const task=(data.nativeTasks || []).find(x=>x.id===form.elements.taskId.value);
  for(const input of form.querySelectorAll('input[name="groupMember"]')) {
    input.disabled=!task || input.dataset.program!==task.programId;
    if(input.disabled) input.checked=false;
  }
  form.querySelector('button[type="submit"]').disabled=!task || !form.querySelector('input[name="groupMember"]:checked');
}
export function renderGroupHomework(item, data, safe, date, list) {
  if(!Array.isArray(data.nativeTasks) || !Array.isArray(data.nativeAssignments))
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
    <h3>Недавние назначения</h3>${list(assignments,'Назначений этой группы пока нет.',x=>`<div class="item" data-group-assignment="${safe(x.id)}"><div><strong>${safe(x.title)}</strong><small>${safe((data.students || []).find(s=>s.membershipId===x.membershipId)?.studentName || 'Ученик')} · До ${safe(date(x.deadlineAt))}</small></div></div>`)}
  </section>`;
}
