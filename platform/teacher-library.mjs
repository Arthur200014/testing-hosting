const unique = values => [...new Set(values.filter(Boolean))];
export const newLibraryState = () => ({query:'',kind:'all',programId:'',sort:'newest',selected:''});
const studentsFor = (item,data) => {
  const ids = item.kind==='group' ? (item.members || []).filter(m=>m.isApproved).map(m=>m.membershipId) : [item.studentMembershipId];
  return (data.students || []).filter(s=>ids.includes(s.membershipId) && s.isActive!==false);
};
export function libraryClasses(data) {
  return [...(data.classes || []).map(x=>({...x,kind:'individual'})),...(data.groups || []).map(x=>({...x,kind:'group'}))];
}
const ownerClass = (link,classes) => classes.find(c=>c.id===(link.groupClassId || link.individualClassId) && c.kind===(link.groupClassId?'group':'individual'));
const programsFor = (item,data) => item ? unique(studentsFor(item,data).map(s=>s.programId)) : [];
export function libraryEntries(data) {
  const classes=libraryClasses(data);
  const materials=(data.materials || []).map(m=>{
    const links=[...(data.classMaterialLinks || []).filter(l=>l.materialId===m.id),
      ...(data.topicMaterialLinks || []).filter(l=>l.materialId===m.id).map(l=>(data.classTopics || []).find(t=>t.id===l.topicId)).filter(Boolean)];
    const lessonPrograms=(data.lessonMaterialLinks || []).filter(l=>l.materialId===m.id)
      .flatMap(l=>(data.lessons || []).find(t=>t.id===l.lessonId)?.participants || [])
      .map(p=>p.programId || (data.students || []).find(s=>s.membershipId===p.membershipId)?.programId);
    return {...m,key:'material:'+m.id,kind:'material',programIds:unique([...links.flatMap(l=>programsFor(ownerClass(l,classes),data)),...lessonPrograms])};
  });
  return [...(data.nativeTasks || []).map(t=>({...t,key:'task:'+t.id,kind:'task',programIds:[t.programId]})),...materials];
}
export function filterLibrary(data, filters) {
  const query=String(filters.query || '').normalize('NFKC').toLocaleLowerCase('ru').trim();
  return libraryEntries(data).filter(x=>(filters.kind==='all' || !filters.kind || x.kind===filters.kind) &&
    (!filters.programId || (filters.programId==='unlinked' ? !x.programIds.length : x.programIds.includes(filters.programId))) &&
    (!query || [x.title,x.prompt,x.url].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase('ru').includes(query)))
    .sort((a,b)=>filters.sort==='title' ? String(a.title).localeCompare(String(b.title),'ru') || a.key.localeCompare(b.key) :
      Date.parse(b.createdAt || 0)-Date.parse(a.createdAt || 0) || a.key.localeCompare(b.key));
}
export function libraryTargets(entry,data,assignment=false) {
  const classes=libraryClasses(data).filter(c=>!c.isArchived);
  const compatible = item => entry.kind==='material' || programsFor(item,data).includes(entry.programId);
  const result=[];
  if(entry.kind==='material' || assignment) for(const item of classes.filter(compatible)) {
    if(!assignment && (data.classMaterialLinks || []).some(l=>l.materialId===entry.id && ownerClass(l,[item]))) continue;
    result.push({key:'class:'+item.kind+':'+item.id,kind:'class',classId:item.id,classKind:item.kind,label:'Класс · '+item.title});
  }
  if(entry.kind==='material' || assignment) for(const lesson of data.lessons || []) {
    const item=ownerClass(lesson,classes); if(!item || !compatible(item)) continue;
    if(assignment && !studentsFor(item,data).some(s=>s.programId===entry.programId && (lesson.participants || []).some(p=>p.membershipId===s.membershipId))) continue;
    if(!assignment && (data.lessonMaterialLinks || []).some(l=>l.materialId===entry.id && l.lessonId===lesson.id)) continue;
    const instant=Date.parse(lesson.lessonAt);
    const when=Number.isFinite(instant)?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(instant)):'Дата не указана';
    result.push({key:'lesson:'+lesson.id,kind:'lesson',lessonId:lesson.id,classId:item.id,classKind:item.kind,
      label:'Занятие · '+item.title+' · '+(lesson.title || 'Занятие')+' · '+when});
  }
  if(!assignment) for(const topic of data.classTopics || []) {
    const item=ownerClass(topic,classes); if(!item || !compatible(item)) continue;
    const links=entry.kind==='task'?data.topicTaskLinks:data.topicMaterialLinks;
    if((links || []).some(l=>l.topicId===topic.id && (entry.kind==='task'?l.taskId:l.materialId)===entry.id)) continue;
    result.push({key:'topic:'+topic.id,kind:'topic',topicId:topic.id,classId:item.id,classKind:item.kind,label:'Тема · '+item.title+' · '+topic.title});
  }
  return result;
}
export function libraryAttachment(entry,target,data) {
  const allowed=libraryTargets(entry,data).find(t=>t.key===target);
  if(!allowed) throw new Error('Выберите доступное место без существующей привязки.');
  if(entry.kind==='task') return {path:'topic-tasks',body:{topicId:allowed.topicId,taskId:entry.id},keys:['topicTaskLinks']};
  if(allowed.kind==='class') return {path:'class-materials',body:{classId:allowed.classId,classKind:allowed.classKind,materialId:entry.id},keys:['classMaterialLinks']};
  if(allowed.kind==='lesson') return {path:'lesson-materials',body:{lessonId:allowed.lessonId,materialId:entry.id},keys:['lessonMaterialLinks']};
  return {path:'topic-materials',body:{topicId:allowed.topicId,materialId:entry.id},keys:['topicMaterialLinks']};
}
export function renderLibraryResults(data,filters,safe) {
  const entries=filterLibrary(data,filters);
  return `<p class="muted small" role="status">Найдено: ${entries.length}</p>${entries.length?entries.map(x=>`<article class="item" data-library-entry="${safe(x.key)}"><div style="min-width:0;overflow-wrap:anywhere"><strong>${safe(x.title)}</strong><small>${x.kind==='task'?'Шаблон задания':'Материал по ссылке'} · ${safe(x.programIds.map(id=>(data.programs || []).find(p=>p.id===id)?.displayName || 'Программа').join(', ') || 'Без программы')}</small></div><button type="button" class="secondary small-button" data-library-preview="${safe(x.key)}">Просмотреть</button></article>`).join(''):'<div class="empty">Ничего не найдено. Измените поиск или фильтры.</div>'}`;
}
const webUrl = value => { try {const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:null;} catch{return null;} };
export function renderLibrary(data,state,safe) {
  const entry=libraryEntries(data).find(x=>x.key===state.selected);
  const options=targets=>'<option value="">Выберите место</option>'+targets.map(t=>`<option value="${safe(t.key)}">${safe(t.label)}</option>`).join('');
  const targets=entry?libraryTargets(entry,data):[], destinations=entry?.kind==='task'?libraryTargets(entry,data,true):[];
  const url=entry?.kind==='material'?webUrl(entry.url):null;
  const count=entry ? (entry.kind==='task' ? (data.topicTaskLinks || []).filter(l=>l.taskId===entry.id).length :
    [...(data.classMaterialLinks || []),...(data.lessonMaterialLinks || []),...(data.topicMaterialLinks || [])].filter(l=>l.materialId===entry.id).length) : 0;
  return `<section class="stack" data-library><div class="section-head"><div><h2>Библиотека</h2><p class="muted small">Шаблоны заданий и ссылки для повторного использования в классах и занятиях.</p></div><button type="button" class="secondary" data-library-create>Создать шаблон</button></div>
    <div class="class-tabs" role="group" aria-label="Тип содержимого">${[['all','Всё'],['task','Шаблоны'],['material','Ссылки']].map(([id,label])=>`<button type="button" class="${state.kind===id?'active':''}" aria-pressed="${state.kind===id}" data-library-type="${id}">${label}</button>`).join('')}</div>
    <div class="form-row"><label>Поиск<input id="librarySearch" type="search" value="${safe(state.query)}" placeholder="Название, условие или адрес ссылки"></label><label>Программа<select data-library-program><option value="">Все программы</option>${(data.programs || []).map(p=>`<option value="${safe(p.id)}" ${state.programId===p.id?'selected':''}>${safe(p.displayName)}</option>`).join('')}<option value="unlinked" ${state.programId==='unlinked'?'selected':''}>Без программы</option></select></label><label>Сортировка<select data-library-sort><option value="newest" ${state.sort==='newest'?'selected':''}>Сначала новые</option><option value="title" ${state.sort==='title'?'selected':''}>По названию</option></select></label></div>
    <p class="muted small">Программа ссылки определяется по классам, темам и занятиям, где она используется. Новые ссылки добавляются на вкладке «Материалы» класса.</p>
    <div class="library-layout"><section class="card stack" id="libraryResults">${renderLibraryResults(data,state,safe)}</section>
      <aside class="card stack" data-library-detail style="min-width:0;overflow-wrap:anywhere">${entry?`
        <div class="section-head"><h3>${safe(entry.title)}</h3><button type="button" class="secondary small-button" data-library-close>Закрыть</button></div>
        <span class="pill">${entry.kind==='task'?'Шаблон задания':'Ссылка'} · Привязок: ${count}</span>
        ${entry.kind==='task'?`<p style="white-space:pre-wrap" data-library-prompt>${safe(entry.prompt)}</p>`:`<p>${safe(entry.url)}</p>${url?`<a class="link" href="${safe(url)}" target="_blank" rel="noopener noreferrer">Открыть материал ↗</a>`:''}`}
        <form id="libraryAttachForm" class="stack" data-library-item="${safe(entry.key)}"><h3>Использовать готовое</h3><label>Куда прикрепить<select name="target" required>${options(targets)}</select></label><p class="muted small">Добавляется привязка. Сам ${entry.kind==='task'?'шаблон':'материал'} остаётся в библиотеке.</p><div class="row"><button type="submit" class="primary" ${targets.length?'':'disabled'}>Прикрепить</button><button type="button" class="secondary" data-library-cancel>Отмена</button></div>${targets.length?'':'<p class="muted small">Нет подходящих мест для новой привязки.</p>'}</form>
        ${entry.kind==='task'?`<form id="libraryAssignJumpForm" class="stack" data-library-item="${safe(entry.key)}"><h3>Назначить ученикам</h3><label>Класс или занятие<select name="target" required>${options(destinations)}</select></label><button type="submit" class="secondary" ${destinations.length?'':'disabled'}>Перейти к назначению</button><p class="muted small">Получателей и срок выберите на следующем экране.</p></form>`:''}
      `:'<h3>Предпросмотр</h3><p class="muted">Выберите шаблон или ссылку в списке.</p>'}</aside>
    </div></section>`;
}
