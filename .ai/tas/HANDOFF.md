# TEACHER AI STUDENT — HANDOFF

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI, UI-01…UI-08
**ACTIVE_TASK:** UI-01 — каркас кабинета и список классов (complete, PR ready)
**ACTIVE_BRANCH:** `tas/UI-01-meleto-classes`
**CONTEXT_MODE:** только файлы из NEXT_ACTION, поиск + ограниченные диапазоны; только `01–02`; без полных файлов/диффов/логов; после задачи — отчёт в чат о результате, проблемах и следующем шаге
**LAST_IMPLEMENTATION_COMMIT:** [`056c6c8`](https://github.com/Arthur200014/testing-hosting/commit/056c6c82a884bef693d3f01e8a5251fca3663bd5) — финальная UI-01 правка после screenshot review; успешная загрузка больше не сдвигает экран служебной плашкой
**NEXT_ACTION:** Проверить зелёные checks и merge готового [PR #47](https://github.com/Arthur200014/testing-hosting/pull/47) в `main`. После merge очистить `ACTIVE_BRANCH` и начать только первый небольшой сценарий UI-02 из `03–06`: постоянная модель индивидуального класса и форма создания, без групп, расписания, досок и платежей в одном заходе.
**VERIFICATION:** PASS — `node --test platform/teacher-data.test.mjs` (6/6), inline/browser script syntax, `git diff --check`. PASS — synthetic Chromium [`43641528907`](https://github.com/Arthur200014/testing-hosting/actions/runs/43641528907) при `1348×926`: screenshots `01_classes`/`02_learning_type`, поиск/нет результатов, класс open/back, modal open/close без write; tenant isolation/retry/logout и прежние сценарии также зелёные. PNG сравнены с референсами `01–02`: устранена лишняя success-плашка; собственный бренд и отсутствие фиктивных bonus/help действий сохранены намеренно. Реальный backend/production не вызывались; ученики/доски/пароли/import не изменялись.

## UI-01 checkpoint

- Новый светлый shell/навигация, классы и панель «Сегодня» собраны по `01`; Onest подключён из Google Fonts с системным fallback.
- Overview читает только `teacher/students` и `teacher/lessons`; показывает загрузку, ошибку с retry, пустой результат, поиск, статистику и честный архив-заглушку.
- Карточка открывает детали legacy individual class. `LearningProgram` намеренно не используется как class entity; постоянная модель/настройки класса остаются UI-02.
- Modal `02` открывается/закрывается/Escape без записи. Индивидуальное и разовое обучение ведут в действующие формы, групповое честно отмечено как UI-02.
- Браузерные проверки обновлены под новый overview: `platform/native-homework-browser.mjs`, `platform/teacher-session-browser.mjs`; checkpoint [`26543eb`](https://github.com/Arthur200014/testing-hosting/commit/26543eb85939f0c1236b3fa012f3771aa112ee2c).
- Детерминированные screenshot-кадры создаёт `platform/meleto-ui-browser.mjs`; workflow сохраняет их как `meleto-ui01-screenshots`.
- Изменены: `platform/teacher.html`, `platform/teacher-data.mjs`, `platform/teacher-data.test.mjs`, браузерные сценарии, workflow и `.ai/tas/PHASE_CHECKLISTS.md`.

## Правило продолжения

1. Читать этот файл на `main`. Если `ACTIVE_BRANCH` не `none`, сверить её HEAD и читать её более новый HANDOFF; продолжать от `NEXT_STEP` и фактического кода, не создавать параллельную задачу.
2. Если ветки нет, работать над `NEXT_ACTION`. Для большой работы создать `tas/UI-01-meleto-classes`, записать ветку и первый checkpoint с конкретным `NEXT_STEP`; после merge очистить `ACTIVE_BRANCH` и выбрать следующий пункт плана. Уточнять устаревшие записи по Git.
3. Адресно открыть [индекс экранов](./MELETO_SCREEN_INDEX.md), нужные PNG/JSON, [чеклист](./PHASE_CHECKLISTS.md), [карту кода](../CONTEXT_MAP.md) и только связанные исходники. `AGENTS.md` задаёт правила реализации и соразмерной проверки.

## Сохранить при работе

- Реальные ученики, доски, пароли и существующие связи с преподавателем не удалять/не менять; импорт не повторять. Работать с синтетическими данными для новых сценариев.
- Существующий Timeweb App Platform + managed PostgreSQL, API auth и tenant isolation использовать; новую инфраструктуру не создавать без отдельной причины.
- Production GAS/`EGA/config/manage.html` может ещё обслуживать действующие данные. Не переключать writer и не запускать production restore в рамках UI-01.
- Операционный долг старого релиза: Timeweb backup/retention и running revision не подтверждены; live submit/grade не запускались. Это `RELEASE_SAFETY`, а не NEXT_ACTION. Если появится срочная проблема эксплуатации, зафиксировать отдельный блокер без подмены плана.
