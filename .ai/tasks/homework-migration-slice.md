# Миграция домашних заданий в ASP.NET Core/PostgreSQL

Status: DONE

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

- Homework entities, составные tenant/identity FK, миграции, import journal, student API и integration tests реализованы.
- `Platform.HomeworkImport` поддерживает read-only dry-run и serializable journaled apply; даты Google Sheets `dd.MM.yyyy` трактуются как московские.
- Общий opt-in browser transport подключён к `EGA/6/dz1.html`–`dz3.html`; default provider остаётся Apps Script.
- Полный PostgreSQL прогон: API 43/43, student import 13/13. Shared browser tests: 52/52. Desktop/mobile smoke трёх страниц: PASS.
- Безопасный dry-run фактического XLSX распознал 48 строк каталога и 66 валидных назначений. Ещё 17 строк исходного листа неполны и корректно блокируют apply; запись в БД не выполнялась.
- Production cutover, production apply и teacher/admin write API не выполнялись.
- `JEV_ROUTE: FAILED`: TypeSafe/Jev environment binding в текущем runtime отсутствует. Используется последовательный deterministic fallback с обязательным свежим review-pass.
- `TERRA: UNAVAILABLE_IN_RUNTIME`; оркестратор реально работает на GPT-5.6 Sol.

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
- Реализованы schema/API/import/browser части с tenant isolation, replay protection, atomic assignment summary и import reconciliation.
- EF model snapshot синхронизирован с ручными homework migrations; оба importer entrypoint имеют отдельные namespaced `Main` и совместно собираются.
- Реальный XLSX проверен только dry-run без `--apply`; исходные значения и ПДн не добавлялись в Git или отчёт.
- Fresh independent review не выявил существенных проблем в migration snapshot, tenant/replay checks, importer safety или browser provider defaults.

## Чек-лист выполнения

- [x] Прочитать обязательные memories/audit и проверить актуальный backend source-of-truth.
- [x] Зафиксировать границы student-only homework slice и teacher-auth non-goal.
- [x] Выполнить Jev attempt и честно записать runtime fallback.
- [x] Создать task-memory и отправить planning checkpoint в `main`.
- [x] Проверить фактические EGA/6 homework payload/queue semantics и legacy deadline/reassignment behavior.
- [x] Добавить homework entities, constraints, relationships и EF migration.
- [x] Реализовать student GET assignments + authenticated idempotent POST submission.
- [x] Добавить real PostgreSQL integration tests: auth/tenant, deadlines, replay/conflict/concurrency, repeated assignments.
- [x] Реализовать `Platform.HomeworkImport` с dry-run/apply и агрегированной сверкой каталога/назначений/сдач.
- [x] Добавить importer integration tests: idempotency, unknown program/student, rollback, integrity/reconciliation.
- [x] Подключить общий browser homework adapter без копирования транспорта по HTML.
- [x] Выполнить browser smoke EGA/6 homework scenario без production write.
- [x] Обновить архитектурную документацию/README и task-memory.
- [x] Выполнить fresh independent review-pass по security/data-integrity/scope.
- [x] Прогнать финальные checks, проверить diff/secrets, отметить `DONE`, commit/push `main`.

## Текущий шаг

Срез завершён и проверен; production import/cutover остаётся отдельной задачей после исправления исходных строк и подготовки реального окружения.

## Следующий шаг

После закрытия этого среза отдельно исправить 17 неполных строк исходного `ДЗ_Назначения`, подготовить реальный program map/workspace и только затем выполнять контролируемый production import/cutover отдельной задачей.

## Проверка

- `Platform.Api.IntegrationTests`: 43/43, PostgreSQL 17, pending migrations отсутствуют.
- `Platform.StudentImport.IntegrationTests`: 13/13.
- `node --test shared/interactive/v1/*.test.mjs`: 52/52.
- Headless Chromium: `dz1`/`dz2`/`dz3`, 1280×900 и 390×844 — HTTP 200, login visible, page errors отсутствуют.
- Реальный XLSX: read-only dry-run, 48 catalog rows, 66 valid assignment rows, 17 source rows с блокирующими diagnostics; `--apply` не использовался.
- Fresh independent review: существенных findings нет; остаточные границы совпадают с документированными non-goals/рисками.
- Production provider не переключался, реальные строки PostgreSQL не создавались и не изменялись.
- Jev env binding отсутствует; повторных попыток не выполнялось.

## Открытые вопросы и риски

- Assignment ссылается на lesson ID, которого в новой БД пока нет; до migration `Занятия` он хранится как nullable legacy external reference без ложного FK.
- В реальном `ДЗ_Назначения` 17 неполных строк; production apply намеренно заблокирован до исправления источника.
- Dry-run с отсутствующим synthetic workspace проверяет парсинг и отсутствие записи, но полный реальный reconciliation требует подготовленных production workspace/program map/student import и относится к отдельному контролируемому этапу.
- Без отдельной teacher auth нельзя безопасно открывать назначение/редактирование ДЗ из ASP.NET.

## Последнее обновление

2026-10-06 — implementation, deterministic verification и fresh independent review завершены; задача закрыта.
