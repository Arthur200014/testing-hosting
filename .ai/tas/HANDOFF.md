# TEACHER AI STUDENT — HANDOFF

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-14
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI, UI-01…UI-08
**ACTIVE_TASK:** UI-01 — каркас кабинета и список классов
**ACTIVE_BRANCH:** none
**LAST_IMPLEMENTATION_COMMIT:** main до этого обновления плана; новый Meleto UI ещё не реализован
**NEXT_ACTION:** Открой `01_classes.png` и `02_learning_type.png` из [пакета](./MELETO_REFERENCE.md), соответствующие записи `screen_specs.json`, затем адресно проверь `platform/teacher.html`, `platform/teacher-data.mjs`, `platform/src/Platform.Api/Persistence/PlatformDbContext.cs` и teacher endpoints. Выясни, можно ли представить отдельный «класс» текущими моделями, **не предполагая**, что `LearningProgram` уже равен классу. Реализуй первый рабочий срез UI-01: Meleto shell/навигация и список классов своего workspace с поиском, состояниями загрузки/пусто/ошибка и переходом в класс; выбор формата `02` открывается и закрывается без записи. Если для списка нужны новые модели/API, добавь совместимую минимальную миграцию и адресные проверки на synthetic данных. В конце сравни desktop с PNG, обнови этот HANDOFF и соответствующие галочки чеклиста. Не внедряй в этой задаче доски, платежи или AI.
**VERIFICATION:** это только перепланирование. Meleto UI не реализован, новые UI/DB тесты NOT_RUN. Предыдущий кабинет/health проверялись отдельно (ссылки в старой истории и [RELEASE_PLAN.md](./RELEASE_PLAN.md)).

## Правило продолжения

1. Читать этот файл на `main`. Если `ACTIVE_BRANCH` не `none`, сверить её HEAD и читать её более новый HANDOFF; продолжать от `NEXT_STEP` и фактического кода, не создавать параллельную задачу.
2. Если ветки нет, работать над `NEXT_ACTION`. Для большой работы создать `tas/UI-01-meleto-classes`, записать ветку и первый checkpoint с конкретным `NEXT_STEP`; после merge очистить `ACTIVE_BRANCH` и выбрать следующий пункт плана. Уточнять устаревшие записи по Git.
3. Адресно открыть [индекс экранов](./MELETO_SCREEN_INDEX.md), нужные PNG/JSON, [чеклист](./PHASE_CHECKLISTS.md), [карту кода](../CONTEXT_MAP.md) и только связанные исходники. `AGENTS.md` задаёт правила реализации и соразмерной проверки.

## Сохранить при работе

- Реальные ученики, доски, пароли и существующие связи с преподавателем не удалять/не менять; импорт не повторять. Работать с синтетическими данными для новых сценариев.
- Существующий Timeweb App Platform + managed PostgreSQL, API auth и tenant isolation использовать; новую инфраструктуру не создавать без отдельной причины.
- Production GAS/`EGA/config/manage.html` может ещё обслуживать действующие данные. Не переключать writer и не запускать production restore в рамках UI-01.
- Операционный долг старого релиза: Timeweb backup/retention и running revision не подтверждены; live submit/grade не запускались. Это `RELEASE_SAFETY`, а не NEXT_ACTION. Если появится срочная проблема эксплуатации, зафиксировать отдельный блокер без подмены плана.
