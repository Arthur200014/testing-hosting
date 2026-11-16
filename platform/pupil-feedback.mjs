import {buildTeacherReport} from './teacher-report.mjs';
export const pupilFeedbackKey=card=>'pupilFeedback:'+card.membershipId;
const pct=value=>value==null?'не рассчитано':value+'%';
export function feedbackText(input) {
  const r=buildTeacherReport(input.data,input.membershipId,new Date(input.generatedAt));
  if(!r.from) throw new Error('Для отчёта пока нет занятий.');
  return [input.studentName+' · '+input.programName,
    'Период: '+r.from+' — '+r.through+'. Последние '+r.lessons.length+' занятий.',
    'Посещение: '+r.presentCount+' присутствий, '+r.absentCount+' пропусков, '+(r.lessons.length-r.presentCount-r.absentCount)+' без отметки.',
    'Домашние задания: сдано '+r.submittedCount+' из '+r.homework.length+'. Средний балл оценённых ДЗ: '+pct(r.homeworkAveragePercent)+'.',
    'Тесты: '+r.tests.length+' лучших попыток. Средний результат: '+pct(r.testAveragePercent)+'.',
    'Итог по правилу 80% ДЗ / 20% тесты: '+pct(r.progressPercent)+'.',
    'Результатов пробников за период: '+r.mocks.length+'.',
    '', 'Комментарий преподавателя:'].join('\n');
}
export function feedbackEditor(payload,mode='generate') {
  if(mode==='edit') {
    if(!payload?.draft) throw new Error('Сохранённый черновик недоступен.');
    const d=payload.draft;return {expectedRevision:d.revision,generatedAt:d.snapshot.generatedAt,title:d.title,body:d.body,snapshot:d.snapshot,preview:false};
  }
  const input=payload?.current;if(!input) throw new Error('Обновите данные ученика.');
  return {expectedRevision:payload.draft?.revision || 0,generatedAt:input.generatedAt,title:('Отчёт · '+input.studentName).slice(0,200),
    body:feedbackText(input),snapshot:input,preview:false};
}
export function feedbackSave(editor) {
  const title=String(editor?.title || '').trim(),body=String(editor?.body || '').trim();
  if(!editor?.generatedAt || !Number.isInteger(editor.expectedRevision) || !title || title.length>200 || !body || body.length>20000)
    throw new Error('Заполните название и текст отчёта (до 20 000 символов).');
  return {expectedRevision:editor.expectedRevision,generatedAt:editor.generatedAt,title,body};
}
export function renderPupilFeedback(data,card,safe) {
  const payload=data[pupilFeedbackKey(card)],editor=card.feedbackEditor;
  if(!payload || payload.current.membershipId!==card.membershipId || (payload.draft && payload.draft.snapshot.membershipId!==card.membershipId)) return '<section class="card stack"><p>Загружаем обратную связь…</p><button class="secondary" type="button" data-student-card-retry>Повторить загрузку</button></section>';
  const draft=payload.draft,input=editor?.snapshot || draft?.snapshot || payload.current;
  const r=buildTeacherReport(input.data,card.membershipId,new Date(input.generatedAt));
  const when=value=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
  const summary=r.from?`<section class="card stack" data-feedback-summary><h3>Данные отчёта</h3><p>${safe(r.from)} — ${safe(r.through)} · последние ${r.lessons.length} занятий</p><dl class="student-card-details"><div><dt>Посещение</dt><dd>${r.presentCount} / ${r.lessons.length}</dd></div><div><dt>ДЗ сданы</dt><dd>${r.submittedCount} / ${r.homework.length}</dd></div><div><dt>Средний балл ДЗ</dt><dd>${safe(pct(r.homeworkAveragePercent))}</dd></div><div><dt>Лучшие попытки тестов</dt><dd>${r.tests.length} · ${safe(pct(r.testAveragePercent))}</dd></div><div><dt>Итог 80 / 20</dt><dd>${safe(pct(r.progressPercent))}</dd></div></dl><details><summary>Занятия и темы</summary>${r.lessons.map(x=>`<p>${safe(when(x.lessonAt))} · ${safe(x.participation.topicComment || x.participation.taskNumbers || 'Тема не указана')} · ${x.participation.durationMinutes} мин</p>`).join('')}</details></section>`:'';
  return `<section class="stack" data-pupil-feedback><section class="card stack"><div class="section-head"><h3>Обратная связь</h3><span class="pill">Черновик</span></div>${editor?`<form id="pupilFeedbackForm" class="stack" data-student-id="${safe(card.membershipId)}" data-revision="${editor.expectedRevision}"><div class="stack" ${editor.preview?'hidden':''}><label>Название<input name="title" maxlength="200" required value="${safe(editor.title)}"></label><label>Текст отчёта<textarea name="body" rows="14" maxlength="20000" required>${safe(editor.body)}</textarea></label></div>${editor.preview?`<section class="stack" data-feedback-preview><h3>${safe(editor.title)}</h3><p style="white-space:pre-wrap">${safe(editor.body)}</p></section>`:''}<div class="row"><button type="button" class="secondary small-button" data-feedback-preview>${editor.preview?'Редактировать':'Предпросмотр'}</button><button type="submit" class="primary small-button">Сохранить черновик</button><button type="button" class="secondary small-button" data-feedback-cancel>Отмена</button></div></form>`:draft?`<article class="stack" data-feedback-saved><h3>${safe(draft.title)}</h3><small class="muted">Сохранено ${safe(when(draft.updatedAt))} · версия ${draft.revision}</small><p style="white-space:pre-wrap">${safe(draft.body)}</p><div class="row"><button type="button" class="secondary small-button" data-feedback-edit>Редактировать</button><button type="button" class="secondary small-button" data-feedback-generate>Сформировать заново</button></div></article>`:`<p class="muted">Сохранённой обратной связи пока нет.</p><button type="button" class="primary small-button" data-feedback-generate ${payload.current.data.lessons.length?'':'disabled'}>Сформировать обратную связь</button>${payload.current.data.lessons.length?'':'<p class="muted">Черновик по последним восьми занятиям появится после первого занятия.</p>'}`}</section>${summary}</section>`;
}
