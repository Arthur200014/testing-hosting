import { materialAction } from './material-file.mjs';
export function classMaterialEntries(data, item) {
  const links = (data.classMaterialLinks || []).filter(x => item.kind === 'group'
    ? x.groupClassId === item.id : x.individualClassId === item.id);
  const used = new Set(links.map(x => x.materialId));
  const available = (data.materials || []).filter(x => !used.has(x.id));
  return { links, available };
}

// Render from protected teacher-only workspace data; URL validity is enforced by API.
export function renderClassMaterials(item, data, safe, list) {
  if (!item.persistent)
    return '<section class="class-subsection"><h3>Материалы</h3><p class="muted">Сначала создайте постоянный класс, чтобы привязывать к нему материалы.</p></section>';
  if (!Array.isArray(data.materials) || !Array.isArray(data.classMaterialLinks))
    return '<section class="class-subsection"><h3>Материалы</h3><p role="status">Загружаем материалы и библиотеку…</p><button type="button" class="secondary" data-retry-overview>Повторить</button></section>';
  const { links, available } = classMaterialEntries(data, item);
  return `<section class="class-subsection stack" data-class-materials="${safe(item.id)}">
    <div class="section-head"><div><h3>Материалы класса</h3>
      <p class="muted small">Ссылки сохраняются в библиотеке преподавателя для повторного использования.</p></div>
      <span class="pill">${links.length} материалов</span></div>
    ${item.isArchived ? '<p class="muted">Класс в архиве. Новые материалы добавить нельзя.</p>' : `
    <div class="grid two">
      <section class="card stack"><h3>Добавить ссылку</h3>
        <form id="classMaterialLinkForm" class="stack" data-class-id="${safe(item.id)}" data-kind="${safe(item.kind)}">
          <label>Название<input name="title" maxlength="250" placeholder="Например, конспект урока" required></label>
          <label>HTTPS-ссылка<input name="url" type="url" pattern="https://.*" maxlength="2048" placeholder="https://example.org/…" required></label>
          <div class="row"><button type="submit" class="primary">Сохранить ссылку</button>
            <button type="button" class="secondary" data-class-material-cancel>Отмена</button></div>
        </form>
      </section>
      <section class="card stack"><h3>Добавить из библиотеки</h3>
        <form id="classMaterialAttachForm" class="stack" data-class-id="${safe(item.id)}" data-kind="${safe(item.kind)}">
          <label>Материал<select name="materialId" required><option value="">Выберите материал</option>
            ${available.map(x => `<option value="${safe(x.id)}">${safe(x.title)}</option>`).join('')}
          </select></label>
          <div class="row"><button type="submit" class="primary" ${available.length ? '' : 'disabled'}>Прикрепить</button>
            <button type="button" class="secondary" data-class-material-cancel>Отмена</button></div>
        </form>
        ${available.length ? '' : '<p class="muted small">Других ссылок в библиотеке пока нет.</p>'}
      </section>
    </div>`}
    <section class="card stack">
      <div class="section-head"><h3>Прикреплённые ссылки</h3><span class="muted small">${links.length}</span></div>
      ${list(links, 'В этом классе пока нет материалов.', x => `
        <div class="item"><div><strong>${safe(x.title)}</strong><small>${safe(x.url)}</small></div>
          ${materialAction(x,safe)}</div>`)}
    </section>
  </section>`;
}
