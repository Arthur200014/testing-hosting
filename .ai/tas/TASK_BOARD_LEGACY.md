> Архив плана до смены приоритета 2026-11-11. **Не использовать как NEXT_ACTION**. Актуальная доска: [TASK_BOARD.md](./TASK_BOARD.md).

# TASK_BOARD — единая доска задач TAS

**Статус на 11.11.2026:** основной репозиторий `Arthur200014/testing-hosting` подтверждён. В нём уже есть ASP.NET Core/PostgreSQL, интерактивы и тесты. Статусы ниже перенесены из проектного плана; `TODO` означает «не принято в качестве задачи TAS» и **не доказывает отсутствие реализации**. Сначала сделать выборочный аудит.

**NEXT_ACTION: `P02-05`** (LessonDefinition v1 и события первого интерактивного урока). P00-01…05 и P01-05 зафиксированы; `PARTIAL` означает «код есть, полный gate не принят». Фокус — переиспользуемый урок, не новый CRM. Production не переключался.

У каждой задачи статус из `RELEASE_GATES.md`; колонка `Evidence` — ссылка на PR/лог/скриншот + корректная команда и результат; `Commit` — hash. Не ставить `DONE`, если есть unverified assumptions. При переносе фазы не считать зависимости DONE автоматически.

## P00

| ID | Статус | Gate-зависимость | Задача | Evidence | Commit |
|---|---|---|---|---|---|
| `P00-01` | DONE (аудит кода и документальная приёмка; runtime NOT_RUN) | — | Проверить текущий репозиторий `Arthur200014/testing-hosting` и ветку `main`; сопоставить существующие `platform/`, `shared/interactive/v1/`, `EGA/`, `OGA/` с требованиями TAS и зафиксировать подтверждённое состояние без полного сканирования. | [Карточка с матрицей](../tasks/tas-P00-01.md); A1–A6 PASS (GitHub API, docs), runtime NOT_RUN; [CI run](https://github.com/Arthur200014/testing-hosting/actions/runs/42990977589) только selector | `b29b3cc8` (audit evidence) |
| `P00-02` | DONE (изолированный runner; prod/staging NOT_RUN) | — | Зафиксировать содержимое и работоспособность текущего кода (если есть): команды запуска, стек, тесты, состояние prod/staging. | [Integration + startup CI](https://github.com/Arthur200014/testing-hosting/actions/runs/42997203038): 57/57 PASS, PostgreSQL migrations, live/ready and synthetic 401 PASS; [TAS CI](https://github.com/Arthur200014/testing-hosting/actions/runs/42997203340): backend PASS. Реальные prod/staging NOT_RUN. | `fdca474a` |
| `P00-03` | DONE (ссылки и инструкции сверены) | — | Проверить, что актуальные документы TAS уже находятся в `.ai/tas/` и README/START_HERE ссылаются на них. Не переносить весь архив повторно. | Проверены файлы `.ai/tas/`, корневой `README.md` и `.ai/START_HERE.md`; обновлён противоречивший `AGENTS.md` процесс в `.ai/tas/README.md`. Документация, runtime NOT_RUN (doc-only). | main (P00-03 docs) |
| `P00-04` | DONE (выборочная сверка; без повторного полного аудита) | — | Сверить task board с реально реализованными модулями и существующими `.ai/tasks/`; сохранить ID и отметить подтверждённые результаты. Стратегия веток и коммитов уже описана в `AGENTS.md`. | Сверены `platform/src/Platform.Api/{Program.cs,Persistence/PlatformDbContext.cs}`, `compose.yaml`, `shared/interactive/v1/`, `.ai/tasks/{platform-foundation,student-directory-import,homework-migration-slice,shared-interactive-package,tas-P03-04}.md` и [backend CI](https://github.com/Arthur200014/testing-hosting/actions/runs/42997203038). Ни один PARTIAL ниже не закрывает gate целиком. | 40cda70 |
| `P00-05` | DONE (правило уже действует) | — | Зафиксировать запрет менять рабочие страницы, GAS/Firebase и production-потоки без отдельной проверенной задачи. | `AGENTS.md` (Safety and public compatibility), `README.md`, `.ai/tas/README.md`: без отдельной проверенной задачи нельзя менять рабочие страницы, GAS/Firebase, production потоки, публичные URL и реальные данные. Код не менялся. | 40cda70 |

## P01

| ID | Статус | Gate-зависимость | Задача | Evidence | Commit |
|---|---|---|---|---|---|
| `P01-01` | TODO | G00 | Провести 5–10 интервью репетиторов и описать top-5 повторяемых процессов, замер «до». | — | — |
| `P01-02` | TODO | G00 | Зафиксировать жизненный цикл занятия: планирование, перенос, отмена, пропуск, завершение. | — | — |
| `P01-03` | TODO | G00 | Утвердить абонемент: сроки, пакет, списание, возврат, долг, поздняя отмена (или пометить как запрет до утверждения). | — | — |
| `P01-04` | TODO | G00 | Уточнить права учителя/ученика/родителя/админа, объём мини-школы. | — | — |
| `P01-05` | DONE (MVP technical scope v1; pilot NOT_RUN) | G00 | Утвердить 5–10 типов интерактивов, форматы ответов, важные инструменты доски. | [`docs/architecture/lesson-mechanics-mvp.md`](../../docs/architecture/lesson-mechanics-mvp.md): 8 механик, 5 MVP, типы ответов, инструменты доски и границы AI/проверки. Это решение для разработки, не G01/user-research acceptance. | e939cd9 |
| `P01-06` | TODO | G00 | Подтвердить канал и необходимый доступ для TG и MAX, начать оформление MAX. | — | — |
| `P01-07` | TODO | G00 | Согласовать правовой аудит данных детей/контента/ИИ и область РФ. | — | — |
| `P01-08` | TODO | G00 | Перепроверить границу MVP, список post-MVP и критерии пользы. | — | — |

## P02

| ID | Статус | Gate-зависимость | Задача | Evidence | Commit |
|---|---|---|---|---|---|
| `P02-01` | TODO | G01 | Карта экранов: dashboard / students / calendar / packages / lesson room / board / assignments / reports / settings. | — | — |
| `P02-02` | TODO | G01 | В Figma/скетче пройти E2E-01 с 1 учителем и 1 учеником. | — | — |
| `P02-03` | TODO | G01 | Согласовать разрешения на доске, ошибки с сетью/перезагрузкой, загрузку материалов. | — | — |
| `P02-04` | TODO | G01 | Определить дизайн-систему: типографика, мобильный web минимум, доступность, состояния loading/error/empty. | — | — |
| `P02-05` | TODO | G01 | Нарисовать ERD/схему событий и OpenAPI по первому модулю; versioning для LessonDefinition. | — | — |
| `P02-06` | TODO | G01 | Взять стартовый набор разрешённых заданий и зафиксировать контракты. | — | — |
| `P02-07` | TODO | G01 | Провести ревью HLD и ADR с учётом масштабирования и безопасности. | — | — |

## P03

| ID | Статус | Gate-зависимость | Задача | Evidence | Commit |
|---|---|---|---|---|---|
| `P03-01` | TODO | G02 | Инициализировать web/backend/test директории и версионирование. | — | — |
| `P03-02` | PARTIAL (БД/API/migrate есть; web-сервис не подтверждён) | G02 | Docker Compose dev: PostgreSQL, API, web; Redis и хранилище по потребности. | [`compose.yaml`](../../compose.yaml): PostgreSQL 17, `migrate`, `api`, изолированная `test-db`; пункты про web и полный G02 не приняты. | — |
| `P03-03` | PARTIAL (конфигурация и миграции реализованы) | G02 | Настроить env.example, secrets policy, миграции/seed test data, локальные команды. | [`.env.example`](../../.env.example), [`platform/README.md`](../../platform/README.md), EF migrations, [CI smoke](https://github.com/Arthur200014/testing-hosting/actions/runs/42997203038); полноценный seed/dev gate не подтверждён. | — |
| `P03-04` | BLOCKED (backend PASS; общая frontend/Playwright/format gate не закрыта) | G02 | CI: lint/typecheck, dotnet format/build/test, Playwright smoke, миграции в test БД. | [Backend CI](https://github.com/Arthur200014/testing-hosting/actions/runs/42997203340): 57/57 PASS; [CI selector](https://github.com/Arthur200014/testing-hosting/actions/runs/42990977589): 12/12 PASS. Web/format/Playwright и старые shared baseline failures остаются отдельно; [карточка](../tasks/tas-P03-04.md). | 09171df9 |
| `P03-05` | PARTIAL (health/error handling есть; observability не принята) | G02 | Логи/trace IDs/healthcheck; errors возвращают безопасные коды. | [`platform/src/Platform.Api/Program.cs`](../../platform/src/Platform.Api/Program.cs): `/health/live`, `/health/ready`, безопасный 500; trace IDs и весь G02 не подтверждены. | — |
| `P03-06` | PARTIAL (изолированный чистый CI PASS; prod/dev отдельно) | G02 | Проверить запуск на чистой среде с нуля по README. | [P00-02 startup smoke](https://github.com/Arthur200014/testing-hosting/actions/runs/42997203038): PostgreSQL migrations, API live/ready, synthetic 401 PASS; ручной dev запуск из README и prod/staging NOT_RUN. | fdca474a |

## P04

| ID | Статус | Gate-зависимость | Задача | Evidence | Commit |
|---|---|---|---|---|---|
| `P04-01` | PARTIAL (модель и студенческие сессии; не полный auth) | G03 | Внедрить Organization/tenant + User/Teacher/Student, auth, session expiry. | [`PlatformDbContext.cs`](../../platform/src/Platform.Api/Persistence/PlatformDbContext.cs): Workspace, TeacherUser, Student/membership; [`Program.cs`](../../platform/src/Platform.Api/Program.cs): student Bearer JWT. Teacher login и полный role lifecycle не приняты. | — |
| `P04-02` | PARTIAL (student-policy/tenant checks; не полный RBAC) | G03 | RBAC middleware/policies и tenant scope в EF queries/handlers. | [`Program.cs`](../../platform/src/Platform.Api/Program.cs): policy `student`; student session/test/homework server-side identity и workspace isolation. Полный teacher/admin RBAC и G03 не приняты. | — |
| `P04-03` | PARTIAL (student-code exchange и throttling; нет приглашений) | G03 | Приглашение ученика по ссылке/коду с TTL, rate limiting, отзывом. | [`Program.cs`](../../platform/src/Platform.Api/Program.cs): rate-limited `POST /api/v1/student-sessions`, короткоживущий JWT. Invitation links, TTL, revoke — не подтверждены. | — |
| `P04-04` | TODO | G03 | Базовые кабинеты, вход/выход, защищённые маршруты. | — | — |
| `P04-05` | PARTIAL (student isolation tests есть; полный RBAC gate не принят) | G03 | Unit/integration tests против IDOR и cross-tenant access. | [`platform/tests/Platform.Api.IntegrationTests/`](../../platform/tests/Platform.Api.IntegrationTests/) и [PostgreSQL CI 57/57](https://github.com/Arthur200014/testing-hosting/actions/runs/42997203038); широкий cross-role/tenant E2E не принят. | — |

## P05

| ID | Статус | Gate-зависимость | Задача | Evidence | Commit |
|---|---|---|---|---|---|
| `P05-01` | TODO | G04 | CRUD/архив учеников без удаления истории. | — | — |
| `P05-02` | TODO | G04 | Календарь день/неделя, создание урока с датой, временем и длительностью 60 мин по умолчанию. | — | — |
| `P05-03` | TODO | G04 | Переносы, статусы, конфликты, журнал изменений. | — | — |
| `P05-04` | TODO | G04 | Timezone хранение UTC+IANA zone; тест отличной от сегодняшней даты. | — | — |
| `P05-05` | TODO | G04 | Доступ ученика только к собственному запланированному занятию. | — | — |
| `P05-06` | TODO | G04 | E2E: создать ученика, назначить через календарь, перенести и убедиться в сохранении. | — | — |

## P06

| ID | Статус | Gate-зависимость | Задача | Evidence | Commit |
|---|---|---|---|---|---|
| `P06-01` | TODO | G05 | Package plan и ledger table с `uniqueOperationKey` и транзакционными ограничениями. | — | — |
| `P06-02` | TODO | G05 | Создание пакета, зачисление занятий, остаток, история. | — | — |
| `P06-03` | TODO | G05 | `complete lesson` атомарно завершает урок, проводит debit и создаёт outbox record; повтор — идемпотентен. | — | — |
| `P06-04` | TODO | G05 | Reversal/adjustment, пропуск/отмена — согласно P01 и без редактирования прошлой записи. | — | — |
| `P06-05` | TODO | G05 | 100 конкурентных повторов complete, balance never double-debits. | — | — |
| `P06-06` | TODO | G05 | Страница пакета/посещений и E2E-сценарий 8→7→6 занятий. | — | — |

## P07

| ID | Статус | Gate-зависимость | Задача | Evidence | Commit |
|---|---|---|---|---|---|
| `P07-01` | TODO | G06 | Room lifecycle и приглашения, авторизация JoinRoom. | — | — |
| `P07-02` | PARTIAL (общая доска уже реализована; TAS acceptance не выполнена) | G06 | Canvas и инструменты: рисовать, цвет/толщина, ластик по штрихам, Undo/Redo, страницы, clear confirmation. | [`shared/interactive/v1/shared-board.js`](../../shared/interactive/v1/shared-board.js), [`drawing-transport.js`](../../shared/interactive/v1/drawing-transport.js), [архитектура](../../docs/architecture/ega6-shared-runtime.md). Все инструменты P07-02 и новый TAS room не подтверждены. | — |
| `P07-03` | TODO | G06 | Server authoritative sequence, ACK, event dedupe, snapshot/replay. | — | — |
| `P07-04` | TODO | G06 | Два браузера одновременно, teacher-led page nav и базовая синхронизация видимых действий. | — | — |
| `P07-05` | TODO | G06 | Disconnect/reconnect: восстановление сохранённых штрихов, не дублируются local pending events. | — | — |
| `P07-06` | TODO | G06 | Проверить 20–30 минут реального рисования, mouse/touch; размер событий, latency, reconnect. | — | — |

## P08

| ID | Статус | Gate-зависимость | Задача | Evidence | Commit |
|---|---|---|---|---|---|
| `P08-01` | TODO | G07 | Реестр Template Engine и `LessonDefinition` JSON Schema v1. | — | — |
| `P08-02` | TODO | G07 | Тестовый task bank с разрешённым контентом и resource IDs. | — | — |
| `P08-03` | TODO | G07 | 5–10 механик для урока, рендер математики/рисунков там, где требуется. | — | — |
| `P08-04` | TODO | G07 | Переиспользование шаблона с другой задачей без переписывания UI/JS. | — | — |
| `P08-05` | TODO | G07 | Старт урока из определения, запуск, ответы, результаты и сохранение попыток. | — | — |
| `P08-06` | TODO | G07 | Защита от некорректного definition и XSS в пользовательских данных/формулах. | — | — |

## P09

| ID | Статус | Gate-зависимость | Задача | Evidence | Commit |
|---|---|---|---|---|---|
| `P09-01` | PARTIAL (модель назначений и импорт есть; task bank не принят) | G08 | Назначение ДЗ из task bank; дедлайн, повторное назначение по правилам. | [`PlatformDbContext.cs`](../../platform/src/Platform.Api/Persistence/PlatformDbContext.cs): HomeworkCatalogItem/Assignment; [homework migration](../tasks/homework-migration-slice.md): API+import. Генерация назначений из TAS task bank не подтверждена. | — |
| `P09-02` | TODO | G08 | Ученический кабинет ДЗ и прогресс попытки. | — | — |
| `P09-03` | PARTIAL (сдачи и replay есть; review UX не принят) | G08 | Submit/resubmit, timestamps, status transitions и reviewer comments. | [`Program.cs`](../../platform/src/Platform.Api/Program.cs): POST homework-submissions; [homework migration](../tasks/homework-migration-slice.md): append-only/history/deadline, idempotence. Reviewer comments и полный E2E не приняты. | — |
| `P09-04` | TODO | G08 | Учитель проверяет; итог и обратная связь сохраняются без придуманных процентов. | — | — |
| `P09-05` | TODO | G08 | E2E: назначить → сдать → проверить → показать результат; тест дедлайна. | — | — |

## P10

| ID | Статус | Gate-зависимость | Задача | Evidence | Commit |
|---|---|---|---|---|---|
| `P10-01` | TODO | G09 | Определить LearningEvents, источники агрегатов и пропуски данных. | — | — |
| `P10-02` | TODO | G09 | Dashboard: посещения, пакеты, домашка, темы/ошибки. | — | — |
| `P10-03` | TODO | G09 | Teacher report за период, понятный источник каждой метрики. | — | — |
| `P10-04` | TODO | G09 | Не выставлять ноль из-за отсутствия теста/данных; явно показывать «нет данных». | — | — |
| `P10-05` | TODO | G09 | Сверить с SQL fixtures и независимым расчётом тестовых кейсов. | — | — |

## P11

| ID | Статус | Gate-зависимость | Задача | Evidence | Commit |
|---|---|---|---|---|---|
| `P11-01` | TODO | G06, G09 | Worker/Transactional Outbox/retry/idempotency/correlation. | — | — |
| `P11-02` | TODO | G06, G09 | Telegram linking flow (инициируется пользователем), отключение и шаблоны сообщений. | — | — |
| `P11-03` | TODO | G06, G09 | Триггеры урок/перенос/ДЗ/отчёт/остаток, не раскрывающие лишних данных. | — | — |
| `P11-04` | TODO | G06, G09 | MAX: получить доступ, создать и промодерировать бота, затем реализовать adapter — либо документировать `BLOCKED_EXTERNAL`, мок/contract test и fallback. | — | — |
| `P11-05` | TODO | G06, G09 | При недоступности обоих ботов урок/ledger/ДЗ продолжают работать. | — | — |
| `P11-06` | TODO | G06, G09 | Дашборд состояния уведомлений, ошибки и retry logs. | — | — |

## P12

| ID | Статус | Gate-зависимость | Задача | Evidence | Commit |
|---|---|---|---|---|---|
| `P12-01` | TODO | G08, G10 | AI Adapter с модельным провайдером, timeout, feature flag, cost limits. | — | — |
| `P12-02` | TODO | G08, G10 | Builder: prompt teacher → schema-valid definition → allow-list template/task IDs → teacher approves. | — | — |
| `P12-03` | TODO | G08, G10 | Curator: factual LearningEvents → existing resource ID recommendation → teacher approves. | — | — |
| `P12-04` | TODO | G08, G10 | Проверка hallucinated ID, некорректных JSON, отказа LLM, injection content. | — | — |
| `P12-05` | TODO | G08, G10 | PII minimization и журнал согласований; ручной fallback без AI. | — | — |

## P13

| ID | Статус | Gate-зависимость | Задача | Evidence | Commit |
|---|---|---|---|---|---|
| `P13-01` | TODO | G04–G12 | Полный E2E-01: student → calendar → package → live lesson → result → homework → notify → report/AI. | — | — |
| `P13-02` | TODO | G04–G12 | Проверка RBAC/tenant, payload limits, rate limits, XSS/CSRF, object links. | — | — |
| `P13-03` | TODO | G04–G12 | Concurrent load и нестабильная сеть доски, разные браузеры. | — | — |
| `P13-04` | TODO | G04–G12 | Backup + RESTORE drill; миграции upgrade/rollback strategy. | — | — |
| `P13-05` | TODO | G04–G12 | Конфиденциальность ПД/данные несовершеннолетних/контракты провайдеров — юридическая проверка. | — | — |
| `P13-06` | TODO | G04–G12 | CI зелёный и test report; отсутствие критических дефектов. | — | — |

## P14

| ID | Статус | Gate-зависимость | Задача | Evidence | Commit |
|---|---|---|---|---|---|
| `P14-01` | TODO | G13 | Утвердить группу 10–15 согласившихся пилотных репетиторов (это целевой план, не существующая база). | — | — |
| `P14-02` | TODO | G13 | Снять baseline по процессам, затем повторить замер по фактическому использованию. | — | — |
| `P14-03` | TODO | G13 | Тестовая публикация с наблюдаемостью, документами/согласиями, поддержкой. | — | — |
| `P14-04` | TODO | G13 | Исправить пилотные критические проблемы, провести regression и повтор E2E. | — | — |
| `P14-05` | TODO | G13 | Проверить готовность платить: интервью/предзаказ/конверсия, тестовая цена 1 490 ₽ — гипотеза. | — | — |
| `P14-06` | TODO | G13 | Зафиксировать release commit/tag, пользовательскую инструкцию, резервные сценарии. | — | — |

## P15

| ID | Статус | Gate-зависимость | Задача | Evidence | Commit |
|---|---|---|---|---|---|
| `P15-01` | TODO | G14 | Ранжировать проблемы пилота по impact/cost/risk, не только по желаниям. | — | — |
| `P15-02` | TODO | G14 | Выбирать **одну** крупную вертикаль: эквайринг / видеосвязь / parent portal / мини-школы / mobile. | — | — |
| `P15-03` | TODO | G14 | Зафиксировать ADR, новые события/миграции и фича-флаг. | — | — |
| `P15-04` | TODO | G14 | Регрессия основных сценариев и измерение бизнес-эффекта после улучшения. | — | — |

## История обновлений

- 2026-10-27: список задач создан на основе чеклистов; программные этапы не подтверждены.

## Специфика существующего репозитория

- Не создавать новый репозиторий; работа идёт в `testing-hosting`.
- Перед оценкой каждой задачи посмотреть `.ai/tasks/` и её текущую реализацию; `TODO` не равно «код отсутствует».
- Фокус продукта: объяснение теории через интерактивные механики, проверяемая генерация урока из шаблонов, автопроверка ДЗ и следующий учебный шаг по модели знаний.
- Старые рабочие страницы не переводить на новый backend автоматически.
- После каждой принятой задачи: соответствующий статус + реальные тесты + `HANDOFF.md` + коммит/push в `main` по `AGENTS.md`.

## Правило выборки следующей задачи

1. Проверить репозиторий и последнее `HANDOFF`.
2. Найти задачу с `TODO` и завершёнными gate-зависимостями; приоритет — низший ID, если нет записанного решения о блокировке. Если есть активная ветка в HANDOFF, сначала продолжить её.
3. Взять ровно одну задачу; после выборочного аудита **создать/обновить `.ai/tasks/tas-<TASK_ID>.md` из `.ai/tas/TASK_TEMPLATE.md`** с подробным чеклистом, границами файлов, тестами и критериями приёмки; **сначала push planning commit**, затем писать код.
4. Исполнять пункты карточки по одному, отмечать `[x]` только по факту, делать checkpoints на длинных задачах. Запустить проверки, обновить статус и доказательства, затем указать `NEXT_ACTION`.