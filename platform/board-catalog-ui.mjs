export function lessonBoardEntries({ lessons = [], classes = [], groups = [], boardRecords = [] }) {
  const individual = new Map(classes.map(item => [item.id, item]));
  const group = new Map(groups.map(item => [item.id, item]));

  const lessonEntries = lessons.flatMap(lesson => {
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
  return [...lessonEntries, ...boardRecords.map(board => {
    const classId = board.groupClassId || board.individualClassId || '';
    const owner = board.groupClassId ? group.get(classId) : individual.get(classId);
    return {...board, boardId:board.id, classId, classTitle:owner?.title || (classId ? 'Класс недоступен' : 'Без класса'),
      lessonAt:board.updatedAt, canOpenLesson:lessonEntries.some(item => item.lessonId === board.lessonId && item.classId)};
  })];
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
    <div class="class-banner-buttons"><button type="button" class="primary" ${item.boardId ? `data-open-independent-board="${safe(item.boardId)}"` :
      `data-open-lesson-board="${safe(item.lessonId)}"`}>Открыть доску</button>
    ${item.boardId ? `<button type="button" class="secondary" data-edit-independent-board="${safe(item.boardId)}">Настройки</button>` : ''}
    ${(item.boardId ? item.canOpenLesson : item.classId) ? `<button type="button" class="secondary" data-board-lesson-details="${safe(item.lessonId)}">К занятию</button>` : ''}</div>
  </article>`).join('');
}
