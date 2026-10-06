# Миграция домашних заданий в ASP.NET Core/PostgreSQL

Status: IN_PROGRESS

## Цель

Перенести серверную модель домашних заданий из `ДЗ_Каталог`, `ДЗ_Назначения` и существующих сдач в ASP.NET Core/PostgreSQL без production cutover: сохранить связи с учениками и программами, дедлайны, статусы, повторные назначения и исторические результаты; дать ученику безопасное чтение своих назначений и идемпотентную отправку результата; подготовить повторяемый локальный импорт и общий browser adapter.

## Область работы

- C#-сущности и EF Core mapping/migrations для каталога ДЗ, назначений, сдач и import journal.
- DTO/service/endpoints только для ученического сценария: список своих назначений и отправка результата под существующим Bearer JWT.
- Tenant/program/membership проверки по текущей БД, без доверия identity из body.
- Идемпотентность сдачи по `eventId` и защита от конфликтующего replay.
- Сохранение assignment snapshot (homework/task/name/url/program), assigned/deadline/submitted/status/score/event/lesson/schema и повторных назначений.
- Отдельный CLI `Platform.HomeworkImport`: локальный XLSX, default dry-run, явный program map, транзакционный apply, агрегированная сверка без ПДн.
- Общий browser слой в `shared/interactive/v1/`; интерактивы EGA/6 используют его без копирования сетевой логики по HTML.
- Integration tests на изолированной PostgreSQL и synthetic browser smoke для EGA/6.

## Вне области работы

- Production import, production cutover, Timeweb, хостинг или деплой.
- Изменение Firebase, Google Apps Script, публичных URL, UI/CSS или содержания заданий.
- Teacher/admin endpoints `assignHomework`, `saveLessonAndHomework` и любые преподавательские записи до отдельной серверной teacher-auth задачи.
- Массовая правка EGA/OGA страниц.
- Реальные данные, student codes, имена, credentials или XLSX с ПДн в Git/логах.

## Текущее состояние

- `Ученики`, student sessions, PostgreSQL `test-attempts` и opt-in общий browser adapter уже реализованы; default provider остаётся Apps Script.
- Текущий `PlatformDbContext` содержит students/programs/memberships/import journal/test attempts, но homework model пока отсутствует.
- `POST /api/v1/test-attempts` показывает текущий паттерн: identity только из Bearer JWT, актуальный membership/program перепроверяются в БД, replay по `(WorkspaceId, EventId)` идемпотентен.
- Аудит подтверждает листы: `ДЗ_Каталог` — 8 колонок, `ДЗ_Назначения` — 16 колонок. Подтверждённые поля assignment: assignment/student/homework/task/name/URL, assigned/deadline/submitted, status/score/event/lesson/schema/program.
- Legacy `submitHomework` пишет в `ДЗ_Назначения`, а `assignHomework` и `saveLessonAndHomework` сейчас не имеют достаточной server-side teacher auth; новые teacher-write операции в этот срез не входят.
- Фактический перенос реальных данных в рабочую PostgreSQL не подтверждён.
- `JEV_ROUTE: FAILED`: TypeSafe/Jev environment binding в текущем runtime отсутствует. Используется последовательный deterministic fallback с обязательным свежим review-pass.
- `SUBAGENTS: UNAVAILABLE_IN_RUNTIME`; `TERRA: UNAVAILABLE_IN_RUNTIME`; оркестратор реально работает на GPT-5.6 Sol.

## Принятые решения

- Каталог — отдельная immutable/stable identity модель по legacy `homeworkId`; assignment имеет собственный legacy external ID и snapshot полей, чтобы история не менялась при редактировании каталога.
- Повторные назначения — отдельные строки assignment; уникальность не строится на student+homework.
- Сдача хранится отдельной append-only сущностью `HomeworkSubmission`; assignment содержит вычисляемое/зафиксированное текущее состояние, но история event replay не уничтожается.
- Student API не принимает `studentId`, `membershipId`, `workspaceId` или `programId` из body.
- `GET /api/v1/homework-assignments` возвращает только назначения текущего membership и его текущей программы/workspace.
- `POST /api/v1/homework-submissions` требует `assignmentId`, `eventId`, result fields и completion timestamp; exact replay возвращает прежний receipt, conflicting replay — `409`.
- Дедлайн проверяется сервером относительно исторического `deadline`; поздняя сдача не теряется, а получает явный late-status, если legacy semantics допускают хранение результата. Если текущий legacy код докажет запрет записи после дедлайна, правило будет скорректировано до реализации endpoint.
- Импорт сначала создаёт/сверяет каталог, затем assignments/submissions в одной транзакции apply; dry-run не пишет.
- Import matching: legacy homework/assignment IDs + workspace; program IDs проходят только через явный map; student assignment связывается через существующий импортированный student external identity.
- Teacher/admin write surface откладывается до отдельной серверной teacher-auth задачи.

## Связанные файлы

- `platform/src/Platform.Api/Persistence/PlatformDbContext.cs`
- `platform/src/Platform.Api/Program.cs`
- `platform/src/Platform.Api/Students/`
- `platform/src/Platform.Api/TestAttempts/`
- `platform/src/Platform.StudentImport/`
- `platform/tests/Platform.Api.IntegrationTests/`
- `shared/interactive/v1/platform-data.js`
- `shared/interactive/v1/platform-api.js`
- `shared/interactive/v1/aspnet-api-client.js`
- `EGA/6/dz1.html`
- `EGA/6/dz2.html`
- `EGA/6/dz3.html`
- `docs/architecture/gas-postgres-migration-audit.md`

## Выполнено

- Прочитаны обязательные project/task memories и migration audit.
- Проверены актуальные `PlatformDbContext`, API routing и test-attempt identity/idempotency pattern.
- Выполнена единственная допустимая попытка Jev routing; environment binding отсутствует.
- Создан planning checkpoint до начала implementation.

## Чек-лист выполнения

- [x] Прочитать обязательные memories/audit и проверить актуальный backend source-of-truth.
- [x] Зафиксировать границы student-only homework slice и teacher-auth non-goal.
- [x] Выполнить Jev attempt и честно записать runtime fallback.
- [x] Создать task-memory и отправить planning checkpoint в `main`.
- [ ] Проверить фактические EGA/6 homework payload/queue semantics и legacy deadline/reassignment behavior.
- [ ] Добавить homework entities, constraints, relationships и EF migration.
- [ ] Реализовать student GET assignments + authenticated idempotent POST submission.
- [ ] Добавить real PostgreSQL integration tests: auth/tenant, deadlines, replay/conflict/concurrency, repeated assignments.
- [ ] Реализовать `Platform.HomeworkImport` с dry-run/apply и агрегированной сверкой каталога/назначений/сдач.
- [ ] Добавить importer integration tests: idempotency, unknown program/student, rollback, integrity/reconciliation.
- [ ] Подключить общий browser homework adapter без копирования транспорта по HTML.
- [ ] Выполнить browser smoke EGA/6 homework scenario без production write.
- [ ] Обновить архитектурную документацию/README и task-memory.
- [ ] Выполнить fresh independent review-pass по security/data-integrity/scope.
- [ ] Прогнать финальные checks, проверить diff/secrets, отметить `DONE`, commit/push `main`.

## Текущий шаг

После planning checkpoint проверить точные payload/queue semantics в `EGA/6/dz1.html`–`dz3.html` и shared API, затем реализовать backend model/API.

## Следующий шаг

Открыть только связанные EGA/6/shared файлы, подтвердить legacy semantics, после чего добавить schema/API/tests минимальным срезом.

## Проверка

- Project rules и task memories прочитаны.
- Код на `main` подтверждает существующий student JWT + test-attempt pattern.
- Production provider не переключался, реальные данные не читались и не изменялись.
- Jev env binding: отсутствует; повторных попыток не будет.

## Открытые вопросы и риски

- Точный legacy смысл `status`, `score`, `submittedAt` и late submission нужно подтвердить по актуальным EGA/6 payloads/коду до фиксации API semantics.
- Assignment может ссылаться на lesson ID, которого в новой БД пока нет; до migration `Занятия` его нужно хранить как nullable legacy external reference, а не создавать ложный FK.
- Реальные XLSX форматы дат/boolean/score и возможные пустые/старые строки проверяются только приватным dry-run позднее.
- Без отдельной teacher auth нельзя безопасно открывать назначение/редактирование ДЗ из ASP.NET.

## Последнее обновление

2026-10-06 — создан planning checkpoint для homework migration slice; implementation ещё не начата.
