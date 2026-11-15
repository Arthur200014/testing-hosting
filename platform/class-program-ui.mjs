export function topicsForClass(item, data) {
  return (data.classTopics || []).filter(x => item.kind === 'group'
    ? x.groupClassId === item.id : x.individualClassId === item.id)
    .sort((a,b) => a.sortOrder - b.sortOrder ||
      String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)));
}
export function renderClassProgram(item, data, safe, list, filter = 'all') {
  if (item.persistent === false)
    return '<section class="class-subsection"><h3>Программа</h3><p class="muted">Программа для этого обучения пока недоступна.</p></section>';
  if (!Array.isArray(data.classTopics) || !Array.isArray(data.topicMaterialLinks) ||
      !Array.isArray(data.materials))
    return '<section class="class-subsection" data-class-program><h3>Программа</h3><p role="status">Загружаем темы и материалы…</p></section>';
  const topics=topicsForClass(item,data), materials=data.materials;
  const writable=item.persistent!==false && !item.isArchived;
  const completed=topics.filter(x=>x.completedAt).length;
  const visible=filter==='completed' ? topics.filter(x=>x.completedAt) : topics;
  const cards=visible.map(x=>{
    const i=topics.findIndex(t=>t.id===x.id);
    const links=data.topicMaterialLinks.filter(l=>l.topicId===x.id);
    return `<article class="card stack" data-class-topic="${safe(x.id)}">
      <div class="section-head"><div><small class="muted">Тема ${i+1}</small><h3>${safe(x.title)}</h3><span class="pill">${x.completedAt?'Пройдена':'В работе'}</span></div>
        ${writable?`<div class="row">
          <button type="button" class="secondary small-button" data-complete-topic="${safe(x.id)}" data-completed="${x.completedAt?'false':'true'}" data-revision="${Number(x.completionRevision||0)}">${x.completedAt?'Вернуть в работу':'Отметить пройденной'}</button>
          <button type="button" class="secondary small-button" data-move-topic="${safe(x.id)}" data-direction="up" ${i===0?'disabled':''} aria-label="Поднять тему">↑</button>
          <button type="button" class="secondary small-button" data-move-topic="${safe(x.id)}" data-direction="down" ${i===topics.length-1?'disabled':''} aria-label="Опустить тему">↓</button>
        </div>`:''}</div>
      ${x.plan?`<p>${safe(x.plan)}</p>`:'<p class="muted small">План пока не указан.</p>'}
      ${list(links,'Материалы не прикреплены.',l=>
        `<div class="item"><strong>${safe(l.title)}</strong><a href="${safe(l.url)}" target="_blank" rel="noopener noreferrer">Открыть</a></div>`)}
    </article>`;
  });
  return `<section class="class-subsection stack" data-class-program="${safe(item.id)}">
    <div class="section-head"><h3>Программа класса</h3><span class="pill">Пройдено ${completed} из ${topics.length}</span></div>
    <div class="row" role="group" aria-label="Фильтр тем">
      <button type="button" class="secondary small-button" data-topic-filter="all" aria-pressed="${filter!=='completed'}">Все темы</button>
      <button type="button" class="secondary small-button" data-topic-filter="completed" aria-pressed="${filter==='completed'}">Пройденные</button>
    </div>
    ${writable?`<div class="card stack">
      <form id="classTopicForm" class="stack" data-class-id="${safe(item.id)}" data-kind="${safe(item.kind)}">
        <h3>Создать тему</h3>
        <label><span>Название темы</span><input name="title" maxlength="200" required></label>
        <label><span>План темы</span><textarea name="plan" maxlength="2000" rows="3"></textarea></label>
        <div class="row"><button type="submit" class="primary">Добавить тему</button>
          <button type="button" class="secondary" data-topic-form-cancel>Отмена</button></div>
      </form></div>`:'<p class="muted small">Архивный класс: программа доступна только для чтения.</p>'}
    ${cards.length?cards.join(''):`<p class="muted">${filter==='completed'?'Пройденных тем пока нет.':'Темы ещё не добавлены.'}</p>`}
    ${writable && topics.length?`<div class="card stack"><form id="topicMaterialAttachForm" class="stack" data-class-id="${safe(item.id)}">
      <h3>Прикрепить материал к теме</h3>
      <label><span>Тема</span><select name="topicId" required><option value="">Выберите тему</option>
        ${topics.map(x=>`<option value="${safe(x.id)}">${safe(x.title)}</option>`).join('')}</select></label>
      <label><span>Из библиотеки</span><select name="materialId" required><option value="">Выберите материал</option>
        ${materials.map(x=>`<option value="${safe(x.id)}">${safe(x.title)}</option>`).join('')}</select></label>
      ${materials.length?'':'<p class="muted small">Сначала добавьте ссылку на вкладке «Материалы».</p>'}
      <div class="row"><button type="submit" class="primary" ${materials.length?'':'disabled'}>Прикрепить</button>
        <button type="button" class="secondary" data-topic-form-cancel>Отмена</button></div>
    </form></div>`:''}
  </section>`;
}
