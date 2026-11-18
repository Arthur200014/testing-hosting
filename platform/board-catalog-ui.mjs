export function lessonBoardEntries({ lessons = [], classes = [], groups = [] }) {
  const individual = new Map(classes.map(item => [item.id, item]));
  const group = new Map(groups.map(item => [item.id, item]));

  return lessons.flatMap(lesson => {
    const classId = lesson.groupClassId || lesson.individualClassId || '';
    const owner = lesson.groupClassId ? group.get(classId) : individual.get(classId);
    if (classId && (!owner || owner.isArchived)) return [];
    return [{
      lessonId: lesson.id,
      classId,
      title: lesson.title || 'Занятие',
      classTitle: owner?.title || 'Без класса',
      lessonAt: lesson.lessonAt
    }];
  });
}

export function renderBoardCards(entries, filters, safe, date) {
  const search = filters.search.trim().toLocaleLowerCase('ru-RU');
  const matches = entries.filter(item =>
    (!filters.classId || item.classId === filters.classId) &&
    (!search || [item.title, item.classTitle].some(title => title.toLocaleLowerCase('ru-RU').includes(search))));
  const byDate = (a, b) => String(b.lessonAt).localeCompare(String(a.lessonAt));
  matches.sort(filters.sort === 'title'
    ? (a, b) => a.title.localeCompare(b.title, 'ru-RU') || byDate(a, b)
    : byDate);

  if (!matches.length) return '<p class="empty">' + (entries.length ? 'Доски по этим условиям не найдены.' : 'Здесь появятся доски ваших занятий.') + '</p>';
  return matches.map(item => `<article class="card stack">
    <div><h2>${safe(item.title)}</h2><p class="muted">${safe(item.classTitle)} · ${safe(date(item.lessonAt))}</p></div>
    <div class="class-banner-buttons"><button type="button" class="primary" data-open-lesson-board="${safe(item.lessonId)}">Открыть доску</button>
    ${item.classId ? `<button type="button" class="secondary" data-board-lesson-details="${safe(item.lessonId)}">К занятию</button>` : ''}</div>
  </article>`).join('');
}
