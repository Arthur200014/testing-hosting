export function lessonBelongsToClass(lesson, item) {
  return item.kind === 'group'
    ? lesson.groupClassId === item.id && !lesson.individualClassId
    : lesson.individualClassId === item.id && !lesson.groupClassId;
}
export function lessonCaption(lesson) {
  const timestamp = Date.parse(lesson.lessonAt);
  const date = Number.isFinite(timestamp) ? new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  }).format(new Date(timestamp)) : 'Дата не указана';
  return (lesson.title || 'Занятие') + ' · ' + date;
}
export function lessonTopicChange(data, lessonId, topicId, add) {
  const set = (data.lessonTopicSets || []).find(x => x.lessonId === lessonId);
  if (!set) throw new Error('Обновите программу занятия перед изменением тем.');
  const ids = new Set(set.topicIds);
  if (add) ids.add(topicId); else ids.delete(topicId);
  return { lessonId, expectedRevision: set.revision, topicIds: [...ids].sort() };
}
export function renderLessonTopics(lesson, item, data, safe, list) {
  if (!lessonBelongsToClass(lesson, item))
    return '<section class="card"><h2>Программа занятия</h2><p class="muted">Связь с программой доступна для занятий, сохранённых в классе.</p></section>';
  if (!['lessonTopicSets','classTopics','topicMaterialLinks','topicTaskLinks'].every(k => Array.isArray(data[k])))
    return '<section class="card"><h2>Программа занятия</h2><p role="status">Загружаем программу занятия…</p></section>';
  const set = data.lessonTopicSets.find(x => x.lessonId === lesson.id);
  if (!set) return '<section class="card"><h2>Программа занятия</h2><button type="button" class="secondary" data-retry-overview>Обновить программу занятия</button></section>';
  const topics = data.classTopics.filter(x => item.kind === 'group'
    ? x.groupClassId === item.id : x.individualClassId === item.id)
    .sort((a,b) => a.sortOrder-b.sortOrder || String(a.id).localeCompare(String(b.id)));
  const selected = topics.filter(x => set.topicIds.includes(x.id));
  return `<section class="card stack" data-lesson-program="${safe(lesson.id)}">
    <div class="section-head"><h2>Программа занятия</h2><span class="pill">Тем: ${selected.length}</span></div>
    ${item.isArchived ? '<p class="muted small">Класс в архиве. Программа доступна только для чтения.</p>' : `
      <form id="lessonTopicSetForm" class="stack" data-lesson-id="${safe(lesson.id)}" data-revision="${set.revision}">
        <fieldset class="stack lesson-topic-choices"><legend>Темы этого занятия</legend>
          ${topics.map(x=>`<label class="lesson-topic-choice"><input type="checkbox" name="topicId" value="${safe(x.id)}" ${set.topicIds.includes(x.id)?'checked':''}><span>${safe(x.title)}</span></label>`).join('') || '<p class="muted">Сначала создайте темы во вкладке «Программа» класса.</p>'}
        </fieldset>
        <p class="muted small">Можно выбрать до 50 тем. Снятие всех отметок убирает связи с этим занятием.</p>
        <div class="row"><button type="submit" class="primary">Сохранить темы</button><button type="button" class="secondary" data-lesson-topics-cancel>Отмена</button></div>
      </form>`}
    ${list(selected,'Темы к занятию пока не добавлены.',topic=>`<article class="card stack" data-lesson-topic="${safe(topic.id)}">
      <div class="section-head"><h3>${safe(topic.title)}</h3><span class="pill">${topic.completedAt?'Пройдена':'В работе'}</span></div>
      ${topic.plan?`<p>${safe(topic.plan)}</p>`:''}
      <strong>Материалы темы</strong>
      ${list(data.topicMaterialLinks.filter(l=>l.topicId===topic.id),'Материалов темы пока нет.',l=>`<div class="item"><strong>${safe(l.title)}</strong><a href="${safe(l.url)}" target="_blank" rel="noopener noreferrer">Открыть</a></div>`)}
      <strong>Задания темы</strong>
      ${list(data.topicTaskLinks.filter(l=>l.topicId===topic.id),'Заданий темы пока нет.',l=>`<div class="item"><div><strong>${safe(l.title)}</strong><p style="white-space:pre-wrap">${safe(l.prompt)}</p><small class="muted">Шаблон задания · назначается ученикам отдельно</small></div></div>`)}
    </article>`)}
    <p class="muted small">План, материалы и задания берутся из темы. Её прохождение отмечается отдельно в программе класса.</p>
  </section>`;
}
