export const pupilWorkSources={native:'Встроенные ДЗ',imported:'Импортные ДЗ',liveTests:'Тесты на платформе',tests:'Тесты из истории',mocks:'Итоги пробников',mockTasks:'Задания пробников',mockSessions:'Сессии пробников'};
export const pupilAllowedSources=tab=>tab==='results'?Object.keys(pupilWorkSources):['native','imported'];
export function pupilHistoryKey(card) {
  return ['studentHistory',card.membershipId,card.workSource,card.tab==='results'?'results':'tasks',card.workPage || 0,card.workMonth || 'all',encodeURIComponent(card.workMock?.id || ''),card.workMock?.date || 'all'].join(':');
}
export function pupilWorkFilters(card,relations,safe) {
  const source=card.workSource || 'native',isNative=source==='native';
  const dateLabel=['native','imported'].includes(source)?'Месяц назначения':source==='mockSessions'?'Месяц начала сессии':'Месяц результата';
  return `<section class="card stack" data-pupil-work-filters><div class="row"><label>Источник<select data-pupil-work-source>${pupilAllowedSources(card.tab).map(key=>`<option value="${key}" ${source===key?'selected':''}>${pupilWorkSources[key]}</option>`).join('')}</select></label><label>${dateLabel}<input type="month" data-pupil-work-month value="${safe(card.workMonth || '')}"></label>${isNative?`<label>Класс<select data-pupil-work-class><option value="">Все классы</option>${relations.filter(c=>c.membershipId===card.membershipId).map(c=>`<option value="${safe(c.classKind+'~'+c.id)}" ${card.workClass===c.classKind+'~'+c.id?'selected':''}>${safe(c.title)}${c.isArchived?' · архив':''}</option>`).join('')}</select></label>`:''}<button type="button" class="secondary small-button" data-pupil-work-clear>Сбросить период и класс</button></div><p class="muted small">${isNative?'Период — дата назначения; задания без связи с классом видны в общем списке.':'Исторические записи относятся к выбранному обучению. Связь с конкретным классом не восстанавливается по имени.'} ${card.workMonth?'':'Показаны все даты.'}</p>${card.workMock?`<p>Задания пробника ${safe(card.workMock.id)} · ${safe(card.workMock.date)}</p><button type="button" class="secondary small-button" data-student-history-back>К итогу пробника</button>`:''}</section>`;
}
const timestamp=value=>value?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))+' МСК':null;
export function pupilSourceUrl(value) {
  try {const u=new URL(value);return ['https:','http:'].includes(u.protocol) && !u.username && !u.password?u.href:null;}catch{return null;}
}
export function renderPupilHistory(data,card,safe) {
  const feed=data[pupilHistoryKey(card)],member=(data.students || []).find(x=>x.membershipId===card.membershipId);
  if(!feed) return '<section class="card stack"><p>Загружаем историю ученика…</p><button class="secondary" type="button" data-student-card-retry>Повторить загрузку</button></section>';
  const rows=(feed.items || []).filter(x=>x.membershipId===member?.membershipId && x.programId===member?.programId && x.source===card.workSource),selected=rows.find(x=>x.id===card.workId);
  const field=(label,value)=>`<div><dt>${label}</dt><dd>${safe(value===null || value===undefined || value===''?'Не сохранено':value)}</dd></div>`;
  const detail=x=>{
    const d=x.details || {},common=field('Дата записи',x.date)+field('Результат',x.scorePercent==null?null:x.scorePercent+'%');
    let fields='',extra='';
    if(x.source==='imported') {
      fields=field('Номер задания',d.taskNumber)+field('Назначено',timestamp(d.assignedAt))+field('Срок',timestamp(d.deadlineAt))+field('Сдано',timestamp(d.submittedAt))+field('Статус источника',d.status);
      const url=pupilSourceUrl(d.url);extra=(url?`<a class="link" href="${safe(url)}" target="_blank" rel="noopener noreferrer">Открыть исходное задание ↗</a>`:'<p class="muted">Ссылка на исходное задание недоступна.</p>')+`<section class="stack"><h4>Сдачи · ${(x.attempts || []).length}</h4>${(x.attempts || []).map(a=>`<article class="item"><div><strong>${safe(a.scorePercent)}%</strong><small>${safe(timestamp(a.completedAt))} · ${a.durationSeconds} сек · ${a.isLate?'после срока':'в срок'}</small></div></article>`).join('') || '<p class="muted">Отдельных событий сдачи нет. Итог источника показан выше.</p>'}</section>`;
    } else if(['tests','liveTests'].includes(x.source)) {
      fields=field('Тест',d.testId)+field('Номер задания',d.taskNumber)+field('Верно / всего',d.correctCount==null || d.totalCount==null?null:d.correctCount+' / '+d.totalCount)+field('Начало',timestamp(d.startedAt))+field('Завершение',timestamp(d.finishedAt))+field('Длительность, сек',d.durationSeconds);
      extra='<p class="muted small">Показаны сохранённые показатели этой попытки. Ответы по отдельным вопросам здесь не хранятся.</p>';
    } else {
      fields=field('Пробник',d.mockId);
      if(x.source==='mockTasks') fields+=field('Номер задания',d.taskNumber)+field('Ответ дан',d.answered?'Да':'Нет')+field('Верно',d.isCorrect?'Да':'Нет')+field('Баллы',d.earnedPoints==null || d.maxPoints==null?null:d.earnedPoints+' / '+d.maxPoints);
      else fields+=field('Первичные баллы',d.primaryScore==null || d.maxPrimaryScore==null?null:d.primaryScore+' / '+d.maxPrimaryScore)+field('Тестовый балл',d.score)+field('Оценка',d.gradeMark)+field('Длительность, сек',d.durationSeconds);
      if(x.source==='mockSessions') fields+=field('Статус источника',d.status)+field('Начало',timestamp(d.startedAt))+field('Срок',timestamp(d.deadlineAt))+field('Сдано',timestamp(d.submittedAt));
      if(x.source==='mocks') extra=`<button type="button" class="secondary small-button" data-student-mock-parts="${safe(x.id)}">Разбор по заданиям</button><p class="muted small">Задания сопоставляются по пробнику и дате. Исторические события не объединяются в вымышленную попытку.</p>`;
    }
    return `<article class="stack" data-student-history-detail="${safe(x.id)}"><button type="button" class="secondary small-button" data-student-work-close>К списку работ</button><h3>${safe(x.title)}</h3><dl class="student-card-details">${common}${fields}</dl>${extra}</article>`;
  };
  return `<section class="card stack" data-student-history><div class="section-head"><h3>${pupilWorkSources[card.workSource]} · ${feed.total}</h3><span class="muted small">Записей в выбранном источнике</span></div>${selected?detail(selected):rows.map(x=>`<article class="item" style="flex-wrap:wrap" data-student-work="${safe(x.id)}"><div><strong>${safe(x.title)}</strong><small>${safe(x.date)} · ${x.scorePercent==null?'Без итогового процента':safe(x.scorePercent)+'%'}</small></div><button type="button" class="secondary small-button" data-student-work-open="${safe(x.id)}">Открыть результат</button></article>`).join('') || '<p class="muted">В выбранном периоде записей нет.</p>'}${!selected && feed.total>feed.pageSize?`<nav class="row" aria-label="Страницы истории"><button type="button" class="secondary small-button" data-student-work-page="${feed.page-1}" ${feed.page===0?'disabled':''}>Назад</button><span>${feed.page+1} / ${Math.ceil(feed.total/feed.pageSize)}</span><button type="button" class="secondary small-button" data-student-work-page="${feed.page+1}" ${(feed.page+1)*feed.pageSize>=feed.total?'disabled':''}>Далее</button></nav>`:''}</section>`;
}
