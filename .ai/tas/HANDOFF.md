# TEACHER AI STUDENT — HANDOFF

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-14
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI, UI-01…UI-08
**ACTIVE_TASK:** UI-01 — каркас кабинета и список классов (implementation complete, visual review pending)
**ACTIVE_BRANCH:** `tas/UI-01-meleto-classes`
**CONTEXT_MODE:** только файлы из NEXT_ACTION, поиск + ограниченные диапазоны; только `01–02`; без полных файлов/диффов/логов; после задачи — отчёт в чат о результате, проблемах и следующем шаге
**LAST_IMPLEMENTATION_COMMIT:** [`937ca47`](https://github.com/Arthur200014/testing-hosting/commit/937ca47f17ef252ecf0b1323c449dae22543c113) — Meleto shell, real class projection, search/states/detail and no-write learning-type modal
**NEXT_ACTION:** На этой же ветке выполнить визуальную проверку `platform/teacher.html` в Chromium при desktop viewport `1348×926` с полностью перехваченным synthetic API: сравнить список и modal с `01_classes.png`/`02_learning_type.png`, проверить поиск, пусто/ошибку/retry, открытие/возврат и отсутствие POST при открытии/закрытии modal. Исправить только найденные расхождения UI-01, затем отметить оставшиеся пункты UI-01 и подготовить ветку к merge. Не начинать UI-02 до этого контроля.
**VERIFICATION:** PASS — inline module syntax; `node --test platform/teacher-data.test.mjs` (6/6); `git diff --check`. PARTIAL — модели/API проверены: `LearningProgram` является программой/предметом, не классом; активный `WorkspaceStudentMembership` безопасно проецируется как legacy individual class без новых записей. NOT_RUN — браузерный desktop compare: локальный Chromium в рабочей среде заблокирован системным sandbox (`socket() failed: Operation not permitted`); реальный backend и production данные не вызывались. Ученики/доски/пароли/import не изменялись.

## UI-01 checkpoint

- Новый светлый shell/навигация, классы и панель «Сегодня» собраны по `01`; Onest подключён из Google Fonts с системным fallback.
- Overview читает только `teacher/students` и `teacher/lessons`; показывает загрузку, ошибку с retry, пустой результат, поиск, статистику и честный архив-заглушку.
- Карточка открывает детали legacy individual class. `LearningProgram` намеренно не используется как class entity; постоянная модель/настройки класса остаются UI-02.
- Modal `02` открывается/закрывается/Escape без записи. Индивидуальное и разовое обучение ведут в действующие формы, групповое честно отмечено как UI-02.
- Изменены: `platform/teacher.html`, `platform/teacher-data.mjs`, `platform/teacher-data.test.mjs`, `.ai/tas/PHASE_CHECKLISTS.md`.

## Правило продолжения

1. Читать этот файл на `main`. Если `ACTIVE_BRANCH` не `none`, сверить её HEAD и читать её более новый HANDOFF; продолжать от `NEXT_STEP` и фактического кода, не создавать параллельную задачу.
2. Если ветки нет, работать над `NEXT_ACTION`. Для большой работы создать `tas/UI-01-meleto-classes`, записать ветку и первый checkpoint с конкретным `NEXT_STEP`; после merge очистить `ACTIVE_BRANCH` и выбрать следующий пункт плана. Уточнять устаревшие записи по Git.
3. Адресно открыть [индекс экранов](./MELETO_SCREEN_INDEX.md), нужные PNG/JSON, [чеклист](./PHASE_CHECKLISTS.md), [карту кода](../CONTEXT_MAP.md) и только связанные исходники. `AGENTS.md` задаёт правила реализации и соразмерной проверки.

## Сохранить при работе

- Реальные ученики, доски, пароли и существующие связи с преподавателем не удалять/не менять; импорт не повторять. Работать с синтетическими данными для новых сценариев.
- Существующий Timeweb App Platform + managed PostgreSQL, API auth и tenant isolation использовать; новую инфраструктуру не создавать без отдельной причины.
- Production GAS/`EGA/config/manage.html` может ещё обслуживать действующие данные. Не переключать writer и не запускать production restore в рамках UI-01.
- Операционный долг старого релиза: Timeweb backup/retention и running revision не подтверждены; live submit/grade не запускались. Это `RELEASE_SAFETY`, а не NEXT_ACTION. Если появится срочная проблема эксплуатации, зафиксировать отдельный блокер без подмены плана.
