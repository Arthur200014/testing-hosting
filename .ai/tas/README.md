# TEACHER AI STUDENT — рабочий маршрут

Существующий проект в `Arthur200014/testing-hosting`. Владелец выбрал максимально точное воспроизведение доступного интерфейса преподавателя Meleto; сначала классы. [HANDOFF.md](./HANDOFF.md) содержит **единственный текущий шаг**, [RELEASE_PLAN.md](./RELEASE_PLAN.md) — очередь UI-01…UI-08, [PHASE_CHECKLISTS.md](./PHASE_CHECKLISTS.md) — приёмку.

## Старт за минуту

1. Прочитать `AGENTS.md` и `HANDOFF.md` на `main`. Продолжить `ACTIVE_BRANCH` или `NEXT_ACTION`; сверить Git-состояние до изменения.
2. По [MELETO_SCREEN_INDEX.md](./MELETO_SCREEN_INDEX.md) выбрать нужные ID, открыть PNG/JSON из [пакета](./MELETO_REFERENCE.md) и только нужные исходники по [CONTEXT_MAP.md](../CONTEXT_MAP.md).
3. Реализовать сценарий на существующих моделях/API или добавить минимальную совместимую модель. Проверить визуально в одном viewport, поведение и права. Commit/push; после значимого этапа обновить HANDOFF одним следующим шагом.

### Что уже есть

`platform/teacher.html`, `platform/student.html`, `platform/src/Platform.Api/`, импортированные ранее данные и часть student/lesson/homework/subscription сценариев. Код не равен готовности Meleto UI: перед галочкой проверить полный сценарий.

### Что читать только по необходимости

- `.ai/tas/MASTER_TZ.md` — долговременное видение; не очередь задач.
- `.ai/tas/DECISIONS.md`, `docs/architecture/` — устойчивые решения и контракты.
- `.ai/tasks/`, `TEST_RESULTS.md` — история конкретной связанной задачи.
- `TASK_BOARD.md`, `TASK_BOARD_LEGACY.md`, `PHASE_CHECKLISTS_LEGACY.md` — архив старых Mxx/Pxx задач; **не** источник NEXT_ACTION.

Не сканировать целиком `EGA/`, `OGA/`, `platform/` и все 74 изображения при каждом новом чате. Не повторять импорт и не менять действующий writer без отдельного решения. Одна работающая ветка для одного незавершённого этапа; HANDOFF должен пережить смену чата.
