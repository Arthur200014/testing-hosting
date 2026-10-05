# Первый write-срез результатов тестов

Status: IN_PROGRESS

## Цель

Заменить серверную часть legacy `submitTest` первым изолированным ASP.NET Core /
PostgreSQL write-срезом: аутентифицированно сохранять полную историю попыток,
безопасно обрабатывать повторную отправку по `eventId` и вычислять лучший
результат ученика за календарный месяц. Существующие страницы и provider пока
не переключать.

## Область работы

- Новый `POST /api/v1/test-attempts` под существующим student Bearer JWT.
- Сущность попытки, ограничения PostgreSQL и EF migration.
- Сервис атомарной записи и вычисляемого monthly-best.
- Строгий request/response contract без student code/name/id в body.
- Real PostgreSQL integration tests для auth, tenant scope, validation,
  идемпотентности, конкуренции, полной истории и monthly-best.
- Docker build/test wiring, архитектурная документация и cloud start instructions.

## Вне области работы

- Изменение HTML/CSS/JS, UI, Firebase или Google Apps Script.
- Переключение `LegacyApiClient`/`AspNetApiClient` и production traffic.
- Production import старых результатов из Google Sheets.
- Teacher/admin API, ДЗ, пробники, занятия, абонементы и отчёты.
- Отдельное хранение «лучшей строки» с уничтожением или обновлением истории.

## Текущее состояние

- `main` синхронизирован с `origin/main`; стартовый commit `8c4a280`.
- Student session exchange уже выдаёт короткоживущий JWT с `sub`,
  `workspace_id`, `membership_id` и `role=student`; программа определяется через
  актуальное membership в БД и отдельным claim не передаётся.
- Справочник учеников и безопасный локальный import slice завершены.
- Аудит подтвердил legacy `submitTest`, повторную отправку очередями, дедупликацию
  по `eventId` и правило monthly-best: выше процент, при равенстве меньше время.

## Принятые решения

- Identity (`WorkspaceId`, `StudentId` и membership) берётся из проверенного JWT
  и сверяется с актуальным membership в БД; program берётся только из этого
  membership. Body не принимает student code, имя или ID и не может подменить
  tenant.
- Request содержит только данные попытки: `eventId`, test/topic metadata,
  task number, correct/total, percent, timestamps, duration и schema version.
- Сервер повторно вычисляет ожидаемый целочисленный процент и отклоняет
  несогласованные значения; PostgreSQL дублирует критические диапазоны check
  constraints.
- Уникальность `(WorkspaceId, EventId)` делает повтор безопасным. Полностью
  совпавший повтор возвращает прежний receipt с `duplicate=true`; тот же
  `eventId` с другим содержимым — `409 Conflict`.
- Каждая новая попытка остаётся immutable. Monthly-best — запрос по
  student membership + test + московскому календарному месяцу: процент по
  убыванию, duration по возрастанию, затем стабильный timestamp/ID tie-break.
- Завершение в будущем, окончание раньше начала, нулевые/отрицательные totals,
  correct вне диапазона, отрицательное/чрезмерное время и слишком длинные IDs
  отклоняются до записи.
- Inactive workspace/student/membership/program после выдачи token запрещают
  запись, даже если JWT ещё не истёк.
- Frontend compatibility mapper будет отдельным этапом после готовности API.
- Jev route: `HIGH`, последовательная работа; implementer и reviewer —
  `gpt-5.6-sol high`; browser test не требуется без frontend-изменений.
  `TERRA: UNAVAILABLE_IN_RUNTIME`.

## Связанные файлы

- `platform/src/Platform.Api/Program.cs`
- `platform/src/Platform.Api/Persistence/`
- `platform/src/Platform.Api/StudentSessions/`
- `platform/tests/Platform.Api.IntegrationTests/`
- `docs/architecture/gas-postgres-migration-audit.md`
- `docs/architecture/platform-foundation.md`
- `platform/README.md`

## Выполнено

- Выбран следующий срез по принятому migration order.
- Проверены текущая JWT identity, persistence model и legacy payload/queue facts.
- Выполнен обязательный Jev-routing через Polza/официальный TypeSafe SDK.

## Чек-лист выполнения

- [x] Зафиксировать границы write-среза и решения по identity/idempotency/monthly-best.
- [x] Добавить PostgreSQL-модель попытки, ограничения и EF migration.
- [x] Реализовать authenticated endpoint и атомарную идемпотентную запись.
- [x] Добавить integration tests для auth, tenant scope и validation.
- [x] Добавить integration tests для duplicate/conflict, concurrency, history и monthly-best.
- [x] Обновить архитектурную документацию и команды разработки.
- [x] Прогнать полный PostgreSQL integration suite и smoke test API.
- [ ] Исправить replay после смены программы у membership и добавить regression test.
- [ ] Закрепить соответствие `MoscowMonthKey` и `CompletedAt` ограничением PostgreSQL.
- [ ] Выполнить независимый review и устранить найденные дефекты.
- [ ] Отметить задачу `DONE`, закоммитить и отправить итог в `main`.

После каждого логически завершённого блока чек-лист обновляется в отдельном
промежуточном коммите, чтобы работу можно было продолжить с последнего
подтверждённого состояния.

## Текущий шаг

Независимый review реализации, тестов и документации.

## Следующий шаг

Проверить auth/tenant/validation/idempotency/concurrency/history/monthly-best на
изолированном PostgreSQL 17, затем обновить документацию и выполнить review.

## Проверка

- Рабочее дерево перед планированием чистое, `main...origin/main`.
- Jev: `HIGH`, `SOL_5_6_HIGH` implementation/review, sequential,
  `NO_BROWSER` для backend-only среза.
- Source of truth: migration audit и текущий код на `main`; реальные данные и
  credentials не читались и не сохранялись.
- API model/service/endpoint собраны в .NET 10 без warnings/errors.
- EF migration `20261005215252_TestAttempts` применена к свежему PostgreSQL 17.
- Полный real PostgreSQL test runner: 38/38 (`25 API + 13 importer`), включая
  18 новых сценариев `TestAttemptTests`.
- Runtime smoke: `/health/live` = 200, `/health/ready` = 200, fake student
  exchange = 401, `POST /api/v1/test-attempts` без Bearer token = 401; активная
  migration — `20261005215252_TestAttempts`.

## Открытые вопросы и риски

- Точный compatibility mapping всех legacy aliases (`score`/`correctCount`,
  `durationSec`/`durationSeconds`) остаётся будущему browser-client этапу.
- Production import старой истории потребует отдельного private dry-run и
  сверки агрегатов.
- Offline delivery требует сохранять время завершения события, а не месяц
  фактической доставки; сервер должен явно использовать `Europe/Moscow`.

## Последнее обновление

2026-10-06 — схема, endpoint, 18 новых integration tests, документация и smoke
test готовы; полный runner проходит 38/38. Следующий блок — независимый review.
