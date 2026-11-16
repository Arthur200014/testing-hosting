import { materialAction } from './material-file.mjs';
export function lessonMaterialEntries(data, lessonId) {
  const links = (data.lessonMaterialLinks || []).filter(x => x.lessonId === lessonId);
  const used = new Set(links.map(x => x.materialId));
  const available = (data.materials || []).filter(x => !used.has(x.id));
  return { links, available };
}

export function renderLessonMaterials(lesson, data, archived, safe, list) {
  if (!Array.isArray(data.materials) || !Array.isArray(data.lessonMaterialLinks))
    return '<section class="card stack" data-lesson-materials><h2>Материалы</h2><p role="status">Загружаем материалы занятия…</p><button type="button" class="secondary" data-retry-overview>Повторить загрузку</button></section>';
  const { links, available } = lessonMaterialEntries(data, lesson.id);
  return `<section class="card stack" data-lesson-materials="${safe(lesson.id)}">
    <div class="section-head"><h2>Материалы</h2><span class="pill">${links.length}</span></div>
    ${archived ? '<p class="muted small">Класс архивирован. Новые материалы нельзя добавить.</p>' : `
      <form id="lessonMaterialAttachForm" class="stack" data-lesson-id="${safe(lesson.id)}">
        <label><span>Прикрепить из библиотеки</span><select name="materialId" required>
          <option value="">Выберите материал</option>
          ${available.map(x => `<option value="${safe(x.id)}">${safe(x.title)}</option>`).join('')}
        </select></label>
        <div class="row"><button type="submit" class="primary" ${available.length ? '' : 'disabled'}>Прикрепить</button>
          <button type="button" class="secondary" data-lesson-material-cancel>Отмена</button></div>
        ${available.length ? '' : '<p class="muted small">Для добавления новой ссылки откройте вкладку «Материалы» класса.</p>'}
      </form>`}
    ${list(links, 'Материалов к этому занятию пока нет.', x => `
      <div class="item"><div><strong>${safe(x.title)}</strong><small>${safe(x.url)}</small></div>
        ${materialAction(x,safe)}</div>`)}
  </section>`;
}
