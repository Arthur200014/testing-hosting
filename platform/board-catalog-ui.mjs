export function classBoardEntries({classes = [], groups = []}) {
  return [
    ...classes.filter(item => !item.isArchived).map(({id, title}) => ({classId:id, kind:'individual', title})),
    ...groups.filter(item => !item.isArchived).map(({id, title}) => ({classId:id, kind:'group', title}))
  ].sort((a, b) => a.title.localeCompare(b.title, 'ru-RU'));
}

export function renderBoardCards(entries, filters, safe) {
  const search = filters.search.trim().toLocaleLowerCase('ru-RU');
  const matches = entries.filter(item =>
    (!filters.classId || item.classId === filters.classId) &&
    (!search || item.title.toLocaleLowerCase('ru-RU').includes(search)));

  if (!matches.length) return '<p class="empty">' + (entries.length ? 'Доски по этим условиям не найдены.' : 'Доска появится после создания класса.') + '</p>';
  return matches.map(item => `<article class="card stack">
    <h2>${safe(item.title)}</h2>
    <div class="class-banner-buttons"><button type="button" class="primary" data-open-class-board="${safe(item.classId)}" data-class-kind="${safe(item.kind)}">Перейти на доску</button></div>
  </article>`).join('');
}
