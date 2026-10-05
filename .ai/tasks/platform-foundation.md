# Фундамент ASP.NET Core и PostgreSQL

Status: DONE

## Цель

Создать безопасный локальный фундамент новой платформы: ASP.NET Core API,
PostgreSQL, pgAdmin, первые Identity/Access и Students boundaries, migrations и
обмен кода ученика на короткоживущий ограниченный token. Подготовить новый
browser API client без переключения production.

## Область работы

- Контейнеризованные API, PostgreSQL и pgAdmin.
- Модульный монолит с первыми границами Identity/Access и Students.
- Workspace isolation и внутренние UUID.
- Хранение только keyed hash ученического кода.
- Rate-limited `POST` student-session exchange.
- EF Core migrations и реальные PostgreSQL integration tests.
- Новый `AspNetApiClient` в общем JS runtime, отключённый по умолчанию.
- Документация локального запуска и принятых security-решений.

## Вне области работы

- Импорт production-строк Google Sheets.
- Production deployment или переключение с Apps Script.
- Teacher UI/login, перенос результатов, ДЗ, пробников и отчётов.
- SignalR, замена Firebase, изменения HTML/CSS/UI или Google Apps Script.

## Текущее состояние

- Добавлены ASP.NET Core 10 API, Docker Compose, PostgreSQL 17, pgAdmin,
  EF Core migration и integration test project.
- Test image собирается с `0 warnings / 0 errors`.
- Integration tests на реальном PostgreSQL 17 прошли: 7/7.
- Весь набор общего JS runtime прошёл: 30/30.
- На чистой локальной БД one-shot migration завершилась с кодом 0; API прошёл
  live/ready и generic-401 smoke.
- Исправлены синхронизация EF snapshot, длина HMAC на уровне БД и права файлов
  non-root runtime-контейнера.
- EF migration history явно закреплена в `public`: первая и немедленная
  повторная migration на чистом Compose-стеке завершились с кодом 0.

## Принятые решения

- Сборка и тесты должны работать контейнерно без host .NET SDK.
- Legacy admin credential и browser teacher hash не переносятся в новую identity.
- Student code передаётся только в POST body, не логируется и не хранится открыто.
- Код индексируется через HMAC с server-side pepper; secrets задаются environment.
- Token ограничен workspace/student scope и коротким сроком жизни.
- PostgreSQL — единственный будущий источник постоянных данных; браузер к нему
  напрямую не обращается.
- Jev выбрал backend `gpt-5.6-sol high`, JS client `gpt-6-luna medium`,
  tester/reviewer `gpt-6-luna high`.

## Связанные файлы

- `platform/`
- `compose.yaml`
- `.env.example`
- `shared/interactive/v1/`
- `docs/architecture/platform-foundation.md`

## Выполнено

- Проверены Docker/Compose, Git и состояние рабочей ветки.
- Выполнен Jev-routing через официальный TypeSafe SDK.
- Зафиксированы границы первого вертикального slice.
- Подтверждены build, migration, API/integration и shared JS проверки.
- Добавлена стабильная архитектурная документация.

## Текущий шаг

Независимый security/architecture review полного diff.

## Следующий шаг

Исправить замечания reviewer, повторить затронутые проверки, проверить diff и
secrets, затем commit/push с этим чек-листом.

## Проверка

- До начала изменений: `main`, чистое рабочее дерево, Docker daemon доступен.
- Backend container build: `0 warnings / 0 errors`.
- PostgreSQL/API integration: 7/7.
- Shared JavaScript: 30/30; legacy provider остаётся default.
- Compose config: valid.
- Clean migration: exit 0; `/health/live` и `/health/ready`: Healthy.
- Повторная one-shot migration: exit 0, `No migrations were applied`.
- Invalid student smoke: generic `401 application/problem+json`.

## Чек-лист продолжения

- [x] Docker Compose: PostgreSQL, one-shot migrate, API, pgAdmin и test DB.
- [x] Workspace/teacher/student/program boundaries и tenant-safe FK/indexes.
- [x] HMAC student-code lookup без plaintext storage.
- [x] Rate-limited `POST /api/v1/student-sessions` и short-lived JWT.
- [x] Новый `AspNetApiClient`, не включённый по умолчанию.
- [x] Начальная EF Core migration и 7 integration test scenarios.
- [x] NuGet TLS restored через временный BuildKit CA secret без отключения TLS.
- [x] Пересобрать backend после последней config-order правки.
- [x] Получить 7/7 integration tests на PostgreSQL 17.
- [x] Проверить one-shot migration, live/ready и generic-401 API smoke.
- [x] Прогнать весь набор shared JS tests и проверить legacy default.
- [x] Завершить архитектурную документацию.
- [x] Сохранить проверенные cloud start instructions (draft ждёт публикации).
- [x] Выполнить независимый security/architecture review и исправления.
- [x] Проверить diff/secrets, commit и push в `main`.

## Открытые вопросы и риски

- Начальный migration рассчитан на новую пустую PostgreSQL-базу; импорт legacy
  данных остаётся отдельной задачей.
- Production provider не переключён; дальнейший slice — безопасный `submitTest`.

## Последнее обновление

2026-10-05 — задача завершена: build и тесты зелёные, первая/повторная migration
и API smoke пройдены, review APPROVED, diff/secrets проверены, результат сохранён
в Git. Следующий этап — отдельный вертикальный срез `submitTest`, без production
cutover в рамках этого task.
