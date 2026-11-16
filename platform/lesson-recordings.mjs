export function safeRecordingSource(value) {
  try {const u=new URL(String(value || '').trim());return u.href.length<=2048 && u.protocol==='https:' && !u.username && !u.password && (!u.port || u.port==='443') && u.hostname.includes('.') && !u.hostname.includes(':') && !/^\d+(\.\d+){3}$/.test(u.hostname) && !/(^|\.)(localhost|local)\.?$/i.test(u.hostname) ? u.href : null;} catch {return null;}
}
export function recordingSourceLink(value,safe) {
  const url=safeRecordingSource(value);if(!url) throw new Error('Источник не является допустимой HTTPS-ссылкой.');
  return `<a href="${safe(url)}" target="_blank" rel="noopener noreferrer" data-recording-source-link>Открыть источник ↗</a>`;
}
const classes=data=>[...(data.classes || []).map(c=>({...c,key:'individual:'+c.id})),...(data.groups || []).map(c=>({...c,key:'group:'+c.id}))];
const classKey=row=>row.groupClassId?'group:'+row.groupClassId:'individual:'+row.individualClassId;
const date=value=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
export function recordingLessonOptions(data) {
  const all=classes(data);
  return (data.lessons || []).map(l=>({...l,owner:all.find(c=>c.key===classKey(l))})).filter(l=>l.owner && !l.owner.isArchived);
}
export function resolveRecordingContext(data,context) {
  if(!context || !['individual','group'].includes(context.classKind)) return null;
  const owner=classes(data).find(c=>c.key===context.classKind+':'+context.classId);
  const lesson=(data.lessons || []).find(l=>l.id===context.lessonId && classKey(l)===owner?.key);
  return owner && lesson?{owner,lesson,canWrite:!owner.isArchived}:null;
}
export function beginLessonRecordings(data,state,item,lessonId,intent='list',recordingId='') {
  const context={classId:item.id,classKind:item.kind,lessonId};
  const resolved=resolveRecordingContext(data,context);
  if(!resolved || !['list','new','edit'].includes(intent)) throw new Error('Занятие больше недоступно в выбранном классе.');
  if(intent!=='list' && !resolved.canWrite) throw new Error('Класс архивирован. Изменение записей недоступно.');
  if(intent==='edit' && !(data.recordings || []).some(r=>r.id===recordingId && r.lessonId===lessonId)) throw new Error('Запись не относится к выбранному занятию.');
  return {...state,section:'recordings',recordingQuery:'',recordingClass:'',recordingLessonId:lessonId,recordingEditor:intent==='new'?'new':intent==='edit'?recordingId:'',recordingContext:context,
    recordingReturnState:{...(state.recordingReturnState || state),recordingContext:null,recordingReturnState:null}};
}
export function leaveLessonRecordings(state) {
  return state.recordingReturnState?{...state.recordingReturnState,recordingContext:null,recordingReturnState:null}:
    {...state,recordingContext:null,recordingReturnState:null,recordingLessonId:'',recordingEditor:''};
}
const accessLabel=r=>!r.isAvailable?'Выдача ссылки закрыта':r.accessUntil && Date.parse(r.accessUntil)<=Date.now()?'Срок истёк':r.accessUntil?'Ссылка до '+date(r.accessUntil)+' МСК':'Для участников занятия · без ограничения по времени';
export function renderLessonRecordings(lesson,item,data,safe) {
  const resolved=resolveRecordingContext(data,{classId:item.id,classKind:item.kind,lessonId:lesson.id});
  if(!Array.isArray(data.recordings)) return '<section class="card stack" data-lesson-recordings><h2>Доступ к записи</h2><p role="status">Загружаем записи занятия…</p><button type="button" class="secondary" data-retry-overview>Повторить загрузку</button></section>';
  const rows=data.recordings.filter(r=>r.lessonId===lesson.id);
  return `<section class="card stack" style="min-width:0;overflow-wrap:anywhere" data-lesson-recordings="${safe(lesson.id)}"><div class="section-head"><h2>Доступ к записи</h2><span class="pill">${rows.length}</span></div>
    ${rows.length?rows.map(r=>`<article class="item" style="flex-wrap:wrap" data-recording-row="${safe(r.id)}"><div style="min-width:0;overflow-wrap:anywhere"><strong>${safe(r.title)}</strong><small>${safe(accessLabel(r))}</small><div data-recording-source></div></div><div class="row"><button type="button" class="secondary small-button" data-recording-open="${safe(r.id)}">Получить ссылку</button>${resolved?.canWrite?`<button type="button" class="secondary small-button" data-lesson-recording-edit="${safe(r.id)}" data-recording-lesson="${safe(lesson.id)}">Изменить доступ</button>`:''}</div></article>`).join(''):'<p class="muted">К занятию пока не добавлены ссылки на записи.</p>'}
    <div class="row">${resolved?.canWrite?`<button type="button" class="primary" data-lesson-recording-new="${safe(lesson.id)}">Добавить запись</button>`:''}${resolved?`<button type="button" class="secondary" data-lesson-recording-library="${safe(lesson.id)}">Записи занятия в библиотеке</button>`:''}</div>
    <p class="muted small">Выдача ссылки зависит от участия в занятии и срока. Просмотр у внешнего источника настраивается отдельно.</p>
    ${!resolved?'<p class="muted small">Добавление записи доступно для занятия, связанного с классом.</p>':!resolved.canWrite?'<p class="muted small">Класс архивирован. Записи доступны преподавателю для просмотра.</p>':''}</section>`;
}
export function recordingWriteAction(editor,values={},context=null) {
  const title=String(values.title || '').trim(),sourceUrl=safeRecordingSource(values.sourceUrl),lessonId=String(values.lessonId || '');
  if(!title || title.length>250 || !sourceUrl || !lessonId) throw new Error('Укажите занятие, название и HTTPS-ссылку на источник.');
  if(context && (lessonId!==context.lessonId || (editor && editor.lessonId!==context.lessonId))) throw new Error('Запись должна относиться к открытому занятию.');
  const expectedRevision=editor?Number(values.revision):0;
  if(editor && (!Number.isInteger(expectedRevision)||expectedRevision<1)) throw new Error('Обновите запись перед изменением.');
  let accessUntil=null;
  if(values.accessUntil) {
    // UI uses Moscow wall-clock time, independent of the browser's timezone.
    const instant=new Date(values.accessUntil+':00+03:00');if(!Number.isFinite(instant.getTime())) throw new Error('Проверьте срок доступа.');accessUntil=instant.toISOString();
  }
  return {path:editor?'recordings/'+encodeURIComponent(editor.id)+'/edit':'recordings',body:{lessonId,title,sourceUrl,expectedRevision,accessUntil,isAvailable:values.isAvailable!==false},keys:['recordings']};
}
export function renderRecordingLibrary(data,state,safe) {
  const all=classes(data),rows=(data.recordings || []).filter(r=>!state.recordingLessonId || r.lessonId===state.recordingLessonId),query=String(state.recordingQuery || '').trim().toLocaleLowerCase('ru');
  const context=resolveRecordingContext(data,state.recordingContext);
  const filtered=rows.filter(r=>(!state.recordingLessonId || r.lessonId===state.recordingLessonId) && (!state.recordingClass || classKey(r)===state.recordingClass) && (!query || [r.title,r.lessonTitle,all.find(c=>c.key===classKey(r))?.title].filter(Boolean).join(' ').toLocaleLowerCase('ru').includes(query)));
  const editor=rows.find(r=>r.id===state.recordingEditor),editing=state.recordingEditor==='new'||editor;
  const options=recordingLessonOptions(data).filter(l=>!context || l.id===context.lesson.id),until=editor?.accessUntil?new Date(Date.parse(editor.accessUntil)+3*3600000).toISOString().slice(0,16):'';
  const current=editor && !options.some(l=>l.id===editor.lessonId)?(data.lessons || []).find(l=>l.id===editor.lessonId):null;
  return `<section class="stack" data-library data-recording-library><div class="section-head"><h2>Библиотека</h2><button type="button" class="primary" data-recording-create ${context && !context.canWrite?'disabled':''}>Добавить ссылку на запись</button></div>
    <div class="class-tabs" role="group" aria-label="Раздел библиотеки"><button type="button" data-library-section="materials">Материалы</button><button type="button" class="active" aria-pressed="true" data-library-section="recordings">Записи занятий</button></div>
    ${state.recordingContext?`<section class="card stack" data-recording-context="${safe(context?.lesson.id || '')}"><strong>${safe(context?context.owner.title+' · '+(context.lesson.title || 'Занятие')+' · '+date(context.lesson.lessonAt):'Занятие больше недоступно')}</strong><div class="row"><button type="button" class="secondary" data-recording-return>К занятию</button><button type="button" class="secondary" data-recording-all>Вся библиотека записей</button></div></section>`:''}
    <p class="muted small">Записи находятся у внешнего источника. Объём видео здесь не хранится и в лимит файлов не входит. Права просмотра у источника настраиваются отдельно.</p>
    ${editing && (!state.recordingContext || context?.canWrite)?`<form id="recordingForm" class="card stack" data-library-item="recording:${safe(editor?.id || 'new')}" data-recording-id="${safe(editor?.id || '')}" data-revision="${editor?.revision || 0}" data-context-lesson-id="${safe(context?.lesson.id || '')}"><h3>${editor?'Изменить запись':'Ссылка на запись'}</h3>
      <label>Занятие<select name="lessonId" required ${context?'disabled':''}><option value="">Выберите занятие</option>${current?`<option value="${safe(current.id)}" selected>Архив · ${safe(current.title || date(current.lessonAt))}</option>`:''}${options.map(l=>`<option value="${safe(l.id)}" ${(editor?.lessonId || context?.lesson.id)===l.id?'selected':''}>${safe(l.owner.title)} · ${safe(l.title || 'Занятие')} · ${safe(date(l.lessonAt))}</option>`).join('')}</select></label>
      <label>Название<input name="title" required maxlength="250" value="${safe(editor?.title || '')}"></label><label>HTTPS-ссылка на запись<input name="sourceUrl" type="url" required maxlength="2048" value="${safe(editor?.sourceUrl || '')}" placeholder="https://…"></label>
      <label>Выдавать ссылку до (МСК)<input name="accessUntil" type="datetime-local" value="${safe(until)}"></label><p class="muted small">Пустой срок — без ограничения по времени. Срок ограничивает выдачу ссылки в платформе; уже полученную ссылку внешний сервис может продолжать открывать.</p>
      <label class="row"><input name="isAvailable" type="checkbox" ${!editor || editor.isAvailable?'checked':''}>Доступна ученикам занятия</label><div class="row"><button type="submit" class="primary">Сохранить запись</button><button type="button" class="secondary" data-recording-cancel>Отмена</button></div></form>`:''}
    <label>Поиск записей<input type="search" data-recording-search value="${safe(state.recordingQuery || '')}" placeholder="Название, класс или занятие"></label>
    <div class="library-layout"><section class="card stack" data-recording-results><h3>Записи · ${filtered.length}</h3>${filtered.length?all.filter(c=>filtered.some(r=>classKey(r)===c.key)).map(c=>`<section class="stack"><h3>${safe(c.title)} · ${filtered.filter(r=>classKey(r)===c.key).length}</h3>${filtered.filter(r=>classKey(r)===c.key).map(r=>`<article class="item" data-recording-row="${safe(r.id)}"><div style="min-width:0;overflow-wrap:anywhere"><strong>${safe(r.title)}</strong><small>${safe(r.lessonTitle || 'Занятие')} · ${safe(date(r.lessonAt))}</small><small>${!r.isAvailable?'Выдача ссылки закрыта':r.accessUntil && Date.parse(r.accessUntil)<=Date.now()?'Срок истёк':r.accessUntil?'Ссылка до '+safe(date(r.accessUntil)):'Без ограничения по времени'}</small><div data-recording-source></div></div><div class="row"><button type="button" class="secondary small-button" data-recording-open="${safe(r.id)}">Получить ссылку</button><button type="button" class="secondary small-button" data-recording-edit="${safe(r.id)}" ${context && !context.canWrite?'disabled':''}>Изменить</button></div></article>`).join('')}</section>`).join(''):'<p class="muted">Записей не найдено. Добавьте ссылку на запись конкретного занятия.</p>'}</section>
    <aside class="card stack"><h3>Классы</h3><button type="button" class="secondary" data-recording-class="" ${context?'disabled':''} aria-pressed="${!state.recordingClass}">Все записи · ${rows.length}</button>${all.filter(c=>rows.some(r=>classKey(r)===c.key)).map(c=>`<button type="button" class="secondary" style="white-space:normal;overflow-wrap:anywhere" data-recording-class="${safe(c.key)}" ${context?'disabled':''} aria-pressed="${state.recordingClass===c.key}">${safe(c.title)} · ${rows.filter(r=>classKey(r)===c.key).length}</button>`).join('')}<p class="muted small">Учитываются ссылки на записи. Размер видео у внешнего источника неизвестен.</p></aside></div></section>`;
}
export function renderStudentRecordings(rows,safe) {
  return rows.length?rows.map(r=>`<article class="card" data-recording-row="${safe(r.id)}"><strong>${safe(r.title)}</strong><p>${safe(r.classTitle)} · ${safe(date(r.lessonAt))}</p>${r.accessUntil?`<p>Ссылка доступна до ${safe(date(r.accessUntil))} МСК</p>`:''}<button type="button" data-recording-open="${safe(r.id)}">Получить ссылку</button><div data-recording-source></div></article>`).join(''):'<p class="muted">Доступных записей пока нет.</p>';
}
