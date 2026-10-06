# Миграция домашних заданий в ASP.NET Core/PostgreSQL

Status: DONE

## Цель

Перенести серверную модель домашних заданий из `ДЗ_Каталог`, `ДЗ_Назначения` и существующих сдач в ASP.NET Core/PostgreSQL без production cutover: сохранить связи с учениками и программами, дедлайны, статусы, повторные назначения и исторические результаты; дать ученику безопасное чтение своих назначений и идемпотентную отправку результата; подготовить повторяемый локальный импорт и общий browser adapter.

## Область работы

- C#-сущности и EF Core mapping/migrations для каталога ДЗ, назначений, сдач и import journal.
- Student-only API: список своих назначений и отправка результата под существующим Bearer JWT.
- Tenant/program/membership проверки по текущей БД, без доверия identity из body.
- Идемпотентность сдачи по `eventId`, повторные назначения и append-only submission history.
- `Platform.HomeworkImport`: локальный XLSX, default dry-run, явный program map, serializable all-or-nothing apply и агрегированная сверка без ПДн.
- Общий browser transport в `shared/interactive/v1/`; EGA/6 не копирует сетевую логику по отдельным HTML.
- Integration tests на изолированной PostgreSQL 17 и browser smoke EGA/6.

## Вне области работы

- Production import/cutover, Timeweb, хостинг или деплой.
- Изменение Firebase, Google Apps Script, публичных URL, UI/CSS или содержания заданий.
- Teacher/admin endpoints `assignHomework`, `saveLessonAndHomework` и другие преподавательские записи до отдельной server-side teacher-auth задачи.
- Реальные XLSX, student codes, ФИО, credentials или другие ПДн в Git/логах.

## Текущее состояние

- Homework entities, составные tenant/identity FK, миграции, import journal, student API и integration tests реализованы.
- `Platform.HomeworkImport` поддерживает read-only dry-run и serializable journaled apply; Google Sheets dates без offset трактуются по принятому Moscow contract.
- Общий opt-in browser transport подключён к `EGA/6/dz1.html`–`dz3.html`; default production provider остаётся Apps Script.
- Реальный XLSX ранее проверен только read-only: 48 строк каталога, 66 корректных назначений и 17 проблемных строк источника; `--apply` на реальных данных не выполнялся.
- После source-аудита исправлена только каскадная deadline-диагностика парсера; пропуски/несогласованности исходных строк не скрываются и не угадываются.
- 2026-10-07 добавлен GitHub Actions workflow `.github/workflows/homework-import-integration.yml`, чтобы реально прогонять Docker test-runner против PostgreSQL 17 на чистом GitHub-hosted runner без production secrets/XLSX.
- Workflow run `37545427337` на commit `37e82e6108ecf89eb4214b8992122e6b99374970` завершился `success`: checkout, Docker build, PostgreSQL 17 integration tests и cleanup прошли.
- `JEV_ROUTE: FAILED`: TypeSafe/Jev environment binding в этом runtime отсутствует; повторных попыток не выполнялось. `TERRA: UNAVAILABLE_IN_RUNTIME`; оркестратор — GPT-5.6 Sol.

## Принятые решения

- Каталог имеет stable legacy identity по `homeworkId`; assignment хранит snapshot полей, чтобы история не менялась вслед за каталогом.
- Повторные назначения — разные assignment rows; уникальность не строится на student+homework.
- `HomeworkSubmission` append-only; exact replay возвращает прежний receipt, conflicting replay блокируется.
- Student API не принимает `studentId`, `membershipId`, `workspaceId` или `programId` из body.
- `GET /api/v1/homework-assignments` возвращает только назначения текущего membership/program/workspace.
- Импорт сначала сверяет полный snapshot, затем применяет его одной транзакцией; dry-run не пишет.
- Import matching использует legacy homework/assignment IDs + workspace; program IDs проходят через явный map; student связывается только с уже импортированной external identity.
- Teacher/admin write surface остаётся закрытым до отдельной server-side teacher auth.

## Связанные файлы

- `platform/src/Platform.Api/Homework/`
- `platform/src/Platform.Api/Persistence/PlatformDbContext.cs`
- `platform/src/Platform.Api/Persistence/Migrations/`
- `platform/src/Platform.HomeworkImport/`
- `platform/tests/Platform.Api.IntegrationTests/HomeworkImportTests.cs`
- `platform/tests/Platform.Api.IntegrationTests/HomeworkTests.cs`
- `shared/interactive/v1/homework-aspnet-client.js`
- `shared/interactive/v1/homework-transport.js`
- `EGA/6/dz1.html`
- `EGA/6/dz2.html`
- `EGA/6/dz3.html`
- `.github/workflows/homework-import-integration.yml`
- `.ai/tasks/homework-import-source-audit.md`
- `docs/architecture/gas-postgres-migration-audit.md`
- `docs/architecture/platform-foundation.md`

## Выполнено

- Реализованы schema/API/import/browser части с tenant isolation, replay protection, atomic assignment summary и import reconciliation.
- EF model snapshot и migrations синхронизированы.
- Реальный XLSX проверялся только безопасным dry-run; production writes не выполнялись.
- Source-аудит 17 проблемных строк выполнен отдельно; importer не восстанавливает отсутствующие данные предположениями.
- Добавлен воспроизводимый CI runner для PostgreSQL 17 и выполнен фактический повторный прогон на `main`.

## Чек-лист выполнения

- [x] Прочитать обязательные memories/audit и проверить актуальный backend source-of-truth.
- [x] Зафиксировать student-only границу и teacher-auth non-goal.
- [x] Выполнить единственную Jev attempt и записать fallback.
- [x] Добавить homework entities, constraints, relationships и EF migrations.
- [x] Реализовать student GET assignments + authenticated idempotent POST submission.
- [x] Добавить PostgreSQL integration tests: auth/tenant, deadlines, replay/conflict/concurrency, repeated assignments.
- [x] Реализовать `Platform.HomeworkImport` dry-run/apply и reconciliation.
- [x] Покрыть importer idempotency, unknown student, conflicts, journal drift и rollback.
- [x] Подключить общий browser homework transport и проверить EGA/6.
- [x] Выполнить source-аудит реального XLSX без production apply.
- [x] Исправить подтверждённую каскадную deadline-диагностику без ослабления source validation.
- [x] Повторно запустить Docker/PostgreSQL 17 integration suite на чистом GitHub-hosted runner.
- [x] Зафиксировать результаты в task-memory и push в `main`.

## Текущий шаг

Срез завершён. Кодовый rehearsal dry-run → apply → повторный apply реально прогнан в изолированной PostgreSQL 17 через GitHub Actions. Реальный исправленный XLSX ещё не может быть применён, пока пользователь не исправит 17 проблемных строк и не будет подготовлен отдельный безопасный input/program map.

## Следующий шаг

После ручного исправления исходного `ДЗ_Назначения` выполнить отдельный rehearsal на копии исправленного XLSX: student import → homework dry-run → SQL/count reconciliation → apply → повторный dry-run/apply. Production `--apply` и cutover до успешного rehearsal не выполнять.

## Проверка

- Ранее подтверждённый полный локальный прогон: `Platform.Api.IntegrationTests` 43/43 на PostgreSQL 17, `Platform.StudentImport.IntegrationTests` 13/13, shared browser tests 52/52, desktop/mobile smoke `dz1`–`dz3` PASS.
- Дополнительный фактический CI-прогон 2026-10-07: GitHub Actions run `37545427337`, job `postgres-integration` — `success`; Docker integration test runner собран, тесты на PostgreSQL 17 прошли, cleanup с удалением volumes прошёл.
- `DryRunDoesNotWriteAndApplyIsRepeatableWithReconciliation` подтверждает: dry-run `CanApply=true`, create plan 1/1/1, фактические DB counts остаются 0/0/0 и journal=0; первый apply даёт 1/1/1 и один journal; повторный apply создаёт 0 и распознаёт 1/1/1 как unchanged, количества не растут.
- Тем же suite проверены `UnknownStudentBlocksWholeApplyWithoutPartialWrites`, `ExistingAssignmentConflictBlocksApplyAndPreservesDatabase`, `JournalReplayRejectsDatabaseDrift`, `JournalFailureRollsBackImportedRowsAndBatch`.
- CI не получает production credentials или реальные XLSX; production provider/БД не затрагиваются.
- Реальный XLSX: последняя read-only проверка — 48 catalog rows, 66 valid assignments, 17 source rows с blocking diagnostics; реальный `--apply` не запускался.

## Открытые вопросы и риски

- До исправления 17 source rows нельзя считать реальный source snapshot готовым к apply.
- Assignment `LegacyLessonId` пока не является FK на `Занятия`; это намеренная граница до migration lessons.
- Полный reconciliation именно исправленного реального XLSX требует самого исправленного файла и безопасного workspace/program map; synthetic integration suite доказывает механику, но не заменяет source-specific rehearsal.
- Без отдельной teacher auth нельзя безопасно открывать назначение/редактирование ДЗ из ASP.NET.

## Последнее обновление

2026-10-07 — добавлен и успешно выполнен воспроизводимый GitHub Actions PostgreSQL 17 integration run; dry-run/apply/idempotency/rollback rehearsal подтверждён на synthetic isolated data. Production и реальные данные не изменялись.
