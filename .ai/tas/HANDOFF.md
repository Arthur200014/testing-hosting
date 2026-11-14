# TEACHER AI STUDENT — HANDOFF

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI, UI-01…UI-08
**ACTIVE_TASK:** UI-02 — индивидуальный класс, второй срез (описание и счётчики) завершён и слит
**ACTIVE_BRANCH:** `none`
**LAST_IMPLEMENTATION_COMMIT:** [`0cd96d7`](https://github.com/Arthur200014/testing-hosting/commit/0cd96d7dfb72bfab63b4b690f7cf825d568f1f29) — [PR #49](https://github.com/Arthur200014/testing-hosting/pull/49), описание класса, валидация и форма.
**NEXT_ACTION:** UI-02, один небольшой функциональный срез экрана `04_individual_create_bottom`: настройка длительности индивидуального занятия как свойства класса (сохранение/чтение/отмена, проверка границ и tenant isolation). Не создавать реальные занятия, не менять расписание и платежи. Затем отдельными задачами стоимость и чаты, обложка/приглашения экрана `03`, групповые классы, редактирование/архив.
**CONTEXT_MODE:** читать `AGENTS.md` и этот файл на `main`, затем только релевантные символы и референс `04` (Library PDF `Meleto_Design_Reference_and_Build_Brief.pdf`, стр. 22); не открывать все 74 кадра/архив и не сканировать EGA/OGA/platform.
**VERIFICATION:** PASS — [TAS task CI 43647169099](https://github.com/Arthur200014/testing-hosting/actions/runs/43647169099) и [Homework import integration 43647169123](https://github.com/Arthur200014/testing-hosting/actions/runs/43647169123) на коммите `bb5d704`; PASS — [Native homework browser 43647112818](https://github.com/Arthur200014/testing-hosting/actions/runs/43647112818) на UI-коде `f24d51e` (последующий коммит менял только .NET-тест). Chromium 1348×926: создание/отмена/reload, счётчики, показ описания. Скриншот `03_individual_create.png` из artifact браузерного CI просмотрен; отличие от полного Meleto ожидаемо — отсутствуют обложка, приглашение и остальные настройки. NOT_RUN — проверки на реальном Timeweb/production; локального .NET SDK нет, использован CI.

## Выполненные срезы UI-02

- Первый ([PR #48](https://github.com/Arthur200014/testing-hosting/pull/48)): `TeacherClass`, tenant-scoped `GET/POST /teacher/classes`, idempotent create, PostgreSQL миграция; legacy-проекция без дублей, отмена без записи.
- Второй ([PR #49](https://github.com/Arthur200014/testing-hosting/pull/49)): `Description` до 200 символов (аддитивная миграция с пустым значением для старых записей), новые названия до 50 символов на API/UI. Старый DB varchar(200) для `Title` оставлен ради совместимости. Счётчики и поля формы, отображение описания, idempotency с учётом описания, синтетические browser/integration regression.
- Изменены: `platform/src/Platform.Api/Classes/{TeacherClass.cs,TeacherClassService.cs}`, `Persistence/{PlatformDbContext.cs,Migrations/PlatformDbContextModelSnapshot.cs,Migrations/20261115130000_TeacherClassDescription.cs}`, `platform/teacher.html`, `platform/meleto-ui-browser.mjs`, `platform/tests/Platform.Api.IntegrationTests/TeacherSessionTests.cs`.

## Ограничения безопасности

- Не изменять production API/БД, реальные данные учеников, пароли, доски, импорты, GAS или writer в рамках UI-02; тестировать только синтетические данные.
- Полное визуальное соответствие Meleto по `03–04` ещё не достигнуто; PDF доступен, исходный ZIP/PNG пакет всё ещё недоступен в Library.
- Старый RELEASE_SAFETY (Timeweb backup/retention и running revision) — отдельный операционный долг, не NEXT_ACTION.
