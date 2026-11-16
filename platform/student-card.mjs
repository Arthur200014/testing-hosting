export const studentProfileKeys=['grade','groupId','targetScore','targetGrade','initialScore','initialPrimaryScore','initialGrade','parentName','notes'];
export const studentProfileSnapshot=student=>Object.fromEntries(studentProfileKeys.map(key=>[key,student[key] ?? null]));
export function studentMemberships(data,membershipId) {
  const selected=(data.students || []).find(s=>s.membershipId===membershipId);
  if(!selected) return [];
  return (data.students || []).filter(s=>s.membershipId===membershipId || (selected.studentId && s.studentId===selected.studentId));
}
export function studentClassRelations(data,membershipId) {
  const memberships=studentMemberships(data,membershipId),byId=new Map(memberships.map(s=>[s.membershipId,s]));
  return [
    ...(data.classes || []).filter(c=>byId.has(c.studentMembershipId)).map(c=>({...c,classKind:'individual',membershipId:c.studentMembershipId,isApproved:true,programName:byId.get(c.studentMembershipId).programName})),
    ...(data.groups || []).flatMap(c=>(c.members || []).filter(m=>byId.has(m.membershipId)).map(m=>({...c,classKind:'group',membershipId:m.membershipId,isApproved:m.isApproved,programName:byId.get(m.membershipId).programName})))
  ];
}
export function studentLessonRows(data,membershipId) {
  const memberships=new Set(studentMemberships(data,membershipId).map(s=>s.membershipId));
  return (data.lessons || []).flatMap(lesson=>(lesson.participants || []).filter(p=>memberships.has(p.membershipId)).map(participant=>({lesson,participant})))
    .sort((a,b)=>Date.parse(b.lesson.lessonAt)-Date.parse(a.lesson.lessonAt) || a.participant.membershipId.localeCompare(b.participant.membershipId));
}
export function studentLessonTarget(data,row) {
  const {lesson,participant}=row;
  if(lesson.groupClassId) {const cls=(data.groups || []).find(c=>c.id===lesson.groupClassId);return cls?{classId:cls.id,classKind:'group',lessonId:lesson.id,isArchived:!!cls.isArchived}:null;}
  if(lesson.individualClassId) {const cls=(data.classes || []).find(c=>c.id===lesson.individualClassId);return cls?{classId:cls.id,classKind:'individual',lessonId:lesson.id,isArchived:!!cls.isArchived}:null;}
  const cls=(data.classes || []).find(c=>c.studentMembershipId===participant.membershipId);
  return (data.students || []).some(s=>s.membershipId===participant.membershipId)?{classId:cls?.id || participant.membershipId,classKind:'individual',lessonId:lesson.id,isArchived:!!cls?.isArchived,legacy:!cls}:null;
}
export function resolveStudentOrigin(data,origin,currentMembershipId) {
  if(!origin || !studentMemberships(data,currentMembershipId).some(s=>s.membershipId===origin.membershipId)) return null;
  if(origin.lessonId) {
    const row=studentLessonRows(data,origin.membershipId).find(r=>r.lesson.id===origin.lessonId && r.participant.membershipId===origin.membershipId);
    if(row && !row.lesson.individualClassId && !row.lesson.groupClassId && origin.classKind==='individual') {
      const cls=(data.classes || []).find(c=>c.id===origin.classId && c.studentMembershipId===origin.membershipId);
      if(cls) return {classId:cls.id,classKind:'individual',lessonId:row.lesson.id,isArchived:!!cls.isArchived,tab:origin.tab};
      if(origin.legacy && origin.classId===origin.membershipId) return {...origin,isArchived:false};
    }
    const target=row && studentLessonTarget(data,row);
    return target && target.classId===origin.classId && target.classKind===origin.classKind?{...target,tab:origin.tab}:null;
  }
  const relation=studentClassRelations(data,origin.membershipId).find(c=>c.id===origin.classId && c.classKind===origin.classKind && c.membershipId===origin.membershipId);
  if(relation) return {classId:relation.id,classKind:relation.classKind,isArchived:!!relation.isArchived,tab:origin.tab};
  if(origin.legacy && origin.classKind==='individual' && origin.classId===origin.membershipId && (data.students || []).some(s=>s.membershipId===origin.membershipId)) return {...origin,isArchived:false};
  return null;
}
export function beginStudentCard(data,membershipId,origin=null) {
  if(!(data.students || []).some(s=>s.membershipId===membershipId)) throw new Error('Ученик больше недоступен в вашем пространстве.');
  if(origin && !resolveStudentOrigin(data,{...origin,membershipId},membershipId)) throw new Error('Ученик не относится к открытому классу или занятию.');
  return {membershipId,origin:origin?{...origin,membershipId}:null,tab:'attendance',month:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit'}).format(new Date()),classFilter:'',infoOpen:false};
}
export function studentEditAction(snapshot,values) {
  if(!snapshot?.membershipId) throw new Error('Повторно выберите ученика.');
  const studentName=String(values.studentName || '').trim();if(!studentName || studentName.length>200) throw new Error('Укажите имя ученика длиной 1–200 символов.');
  return {path:'students/'+encodeURIComponent(snapshot.membershipId)+'/edit',body:{studentName,profile:Object.fromEntries(studentProfileKeys.map(key=>[key,values[key]===undefined?(snapshot[key] ?? null):(String(values[key] ?? '').trim() || null)])),expectedStudentName:snapshot.studentName,expectedProfile:studentProfileSnapshot(snapshot)},keys:['students','classes','groups']};
}
const date=value=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
const monthKey=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit'}).format(new Date(value));
const status={Present:'Присутствовал',Absent:'Отсутствовал',Unknown:'Не отмечено'};
export function renderStudentCard(data,card,safe,editHtml='') {
  const student=(data.students || []).find(s=>s.membershipId===card.membershipId);
  if(!student) return '<section class="card stack" data-student-card-unavailable><h2>Ученик больше недоступен</h2><button type="button" class="secondary" data-student-card-close>К списку учеников</button></section>';
  if(!['classes','groups','lessons'].every(key=>Array.isArray(data[key]))) return `<section class="card stack" data-student-card-loading><h2>${safe(student.studentName)}</h2><p>Загружаем классы и занятия…</p><button type="button" class="secondary" data-student-card-retry>Повторить загрузку</button></section>`;
  const memberships=studentMemberships(data,card.membershipId),relations=studentClassRelations(data,card.membershipId),origin=resolveStudentOrigin(data,card.origin,card.membershipId);
  const rows=studentLessonRows(data,card.membershipId).filter(r=>(!card.month || monthKey(r.lesson.lessonAt)===card.month) && (!card.classFilter || (r.lesson.groupClassId?'group:'+r.lesson.groupClassId:'individual:'+r.lesson.individualClassId)===card.classFilter));
  const present=rows.filter(r=>r.participant.attendanceStatus==='Present').length,absent=rows.filter(r=>r.participant.attendanceStatus==='Absent').length,unknown=rows.length-present-absent,known=present+absent,percent=known?Math.round(present/known*100):null;
  const detail=(label,value)=>`<div><dt>${label}</dt><dd>${safe(value || 'Не указано')}</dd></div>`;
  return `<section class="stack" data-student-card="${safe(student.membershipId)}"><nav class="row" aria-label="Карточка ученика"><button type="button" class="secondary small-button" data-student-card-close>Ученики</button>${card.origin?`<button type="button" class="secondary small-button" data-student-card-return>${origin?.lessonId?'К исходному занятию':origin?'К исходному классу':'К списку классов'}</button>`:''}</nav>
    <div class="student-card-layout"><header class="card stack"><div class="section-head"><h2>${safe(student.studentName)}</h2><button type="button" class="secondary small-button" data-student-card-info aria-label="Информация об ученике">ⓘ</button></div>
      <label>Обучение<select data-student-card-membership>${memberships.map(m=>`<option value="${safe(m.membershipId)}" ${m.membershipId===student.membershipId?'selected':''}>${safe(m.programName)}</option>`).join('')}</select></label><p class="muted small">Профиль и цели показаны для выбранного обучения.</p><button type="button" class="primary" data-edit-student="${safe(student.membershipId)}">Редактировать профиль</button></header>
      <section class="card stack"><h3>Обучение ученика</h3><div class="row"><span class="pill">Классов: ${new Set(relations.map(c=>c.classKind+':'+c.id)).size}</span><span class="pill">Записей посещения: ${studentLessonRows(data,card.membershipId).length}</span></div><p>${safe(student.programName)}</p><p class="muted">${student.grade?safe(student.grade)+' класс · ':''}Цель: ${safe(student.targetScore || student.targetGrade || 'не указана')}</p></section></div>
    <div class="class-tabs" role="tablist" aria-label="Разделы карточки ученика">${[['attendance','Посещение'],['classes','Классы'],['profile','Профиль']].map(([key,title])=>`<button type="button" role="tab" aria-selected="${card.tab===key}" class="${card.tab===key?'active':''}" data-student-card-tab="${key}">${title}</button>`).join('')}</div>
    ${editHtml || (card.tab==='profile'?`<section class="card stack"><h3>Профиль · ${safe(student.programName)}</h3><dl class="student-card-details">${detail('Класс',student.grade)}${detail('Группа в профиле',student.groupId)}${detail('Цель',student.targetScore)}${detail('Целевая оценка',student.targetGrade)}${detail('Начальный балл',student.initialScore)}${detail('Начальный первичный балл',student.initialPrimaryScore)}${detail('Начальная оценка',student.initialGrade)}${detail('Родитель',student.parentName)}${detail('Заметки',student.notes)}</dl></section>`:
      card.tab==='classes'?`<section class="card stack" data-student-card-classes><h3>Классы и программы</h3>${relations.length?relations.map(c=>`<article class="item" style="flex-wrap:wrap"><div><strong>${safe(c.title)}</strong><small>${c.classKind==='group'?'Группа':'Индивидуально'} · ${safe(c.programName)} · ${c.isArchived?'Архив':c.isApproved?'Действующий класс':'Ожидает подтверждения'}</small></div><button type="button" class="secondary small-button" data-student-related-class="${safe(c.id)}" data-class-kind="${c.classKind}" data-membership-id="${safe(c.membershipId)}">Открыть класс</button></article>`).join(''):'<p class="muted">Связанных классов пока нет.</p>'}</section>`:
      `<section class="stack" data-student-card-attendance><div class="row"><label>Месяц<input type="month" data-student-card-month value="${safe(card.month)}"></label><label>Класс<select data-student-card-filter><option value="">Все классы</option>${[...new Map(relations.map(c=>[c.classKind+':'+c.id,c])).values()].map(c=>`<option value="${safe(c.classKind+':'+c.id)}" ${card.classFilter===c.classKind+':'+c.id?'selected':''}>${safe(c.title)}</option>`).join('')}</select></label></div>
        <div class="student-card-layout"><section class="card stack"><h3>Посещение</h3><div class="student-attendance-ring" style="--attendance:${percent || 0}%"><strong>${rows.length}<small>записей посещения</small></strong></div><p>Присутствовал: ${present} · Отсутствовал: ${absent}</p><p class="muted">Не отмечено: ${unknown}</p><p>${percent===null?'Процент не рассчитан: нет отметок.':percent+'% среди занятий с отметкой присутствия/отсутствия.'}</p></section>
        <section class="card stack"><h3>Занятия · ${rows.length}</h3>${rows.length?rows.map(r=>{const target=studentLessonTarget(data,r);return `<article class="item" style="flex-wrap:wrap" data-student-attendance-row="${safe(r.lesson.id)}" data-member-id="${safe(r.participant.membershipId)}"><div><strong>${safe(r.lesson.title || 'Занятие')}</strong><small>${safe(date(r.lesson.lessonAt))} МСК · ${r.participant.durationMinutes} мин</small><small>${safe(status[r.participant.attendanceStatus] || 'Не отмечено')}</small></div>${target?`<button type="button" class="secondary small-button" data-student-related-lesson="${safe(r.lesson.id)}" data-membership-id="${safe(r.participant.membershipId)}">Открыть занятие</button>`:''}</article>`;}).join(''):'<p class="muted">За выбранный период занятий нет.</p>'}</section></div></section>`)}
    ${card.infoOpen?`<div class="modal-backdrop"><section class="learning-modal" role="dialog" aria-modal="true" aria-labelledby="studentCardInfoTitle" data-student-info-dialog><div class="modal-head"><h2 id="studentCardInfoTitle">${safe(student.studentName)}</h2><button type="button" class="modal-close" data-student-info-close aria-label="Закрыть информацию">×</button></div><dl class="student-card-details">${detail('Программа',student.programName)}${detail('Класс',student.grade)}${detail('Родитель',student.parentName)}${detail('Заметки',student.notes)}</dl><button type="button" class="secondary" data-student-info-close>Закрыть</button></section></div>`:''}</section>`;
}
