# TEACHER AI STUDENT — актуальная доска задач (migration-first)

**Дата:** 2026-11-11. **Единственный актуальный NEXT_ACTION:** `M03-02` (Timeweb apply миграции и истории после merged PR #12; M02-03 restore отдельно не подтверждён).
**Цель первой версии:** работающая PostgreSQL + сервер + **существующая** преподавательская форма `EGA/config/manage.html`. Новая админка — позже. Интерактивный движок, AI и оформление уроков — отложены.
**Продукт:** универсальная multi-tenant платформа для преподавателей **разных предметов**, а не персональная система для одного учителя и не исключительно ЕГЭ/ОГЭ.

## Как читать статусы
- `DONE`: результат и проверки завершены; `PARTIAL`: часть кода уже есть, но конкретный gate не пройден; `TODO`: задача впереди; `PARKED`: сознательно отложено.
- Технический импортёр `DONE` **не означает** перенос реальных данных. Изолированный CI `PASS` **не означает** развёртывание на сервере.
- Для текущей работы **только Mxx IDs и порядок ниже**. Старые 92 Pxx IDs не удалены: архив точного прежнего плана — [TASK_BOARD_LEGACY.md](./TASK_BOARD_LEGACY.md). Ссылки и старые коммиты сохраняются.
- Gates последовательные только там, где требуется. Внутри этапа можно параллелить инфраструктуру и код, но не подменять фактическую приёмку.

## Уже существует — переиспользовать
- ASP.NET Core 10, PostgreSQL 17, Docker Compose, JWT student session; прежний [CI 57/57 + startup smoke](https://github.com/Arthur200014/testing-hosting/actions/runs/42997203038) **PASS**.
- XLSX importers для `Ученики`, `ДЗ_Каталог`, `ДЗ_Назначения` и opt-in student transport. Реальный production apply — **NOT_RUN**; ранее 17 строк назначений были проблемными.
- Существующая рабочая `EGA/config/manage.html` использует legacy GAS; teacher auth и teacher write API ещё не реализованы для production.
- Предыдущий Timeweb deployment был `BLOCKED` — не считать развёрнутым без свежих проверок.
- Existing P01-05 math mechanics spec остаётся документацией; её реализацию **не начинать** до M07.

## Приоритетный маршрут

### 1. M01 — Данные и универсальная модель
**Зависимости:** G00

| ID | Статус | Конкретная работа | Критерий готовности | Связь с прежними задачами |
|---|---|---|---|---|
| `M01-01` | DONE (адресная сверка Git; свежий XLSX NOT_RUN) | Адресно сопоставить все вкладки Google Sheets и запросы `EGA/config/manage.html` с API, чтением и записью; отметить, что уже реализовано, а что отсутствует. | [Матрица manage→Sheets→PG](../../docs/architecture/manage-postgres-coverage.md): 5 действий формы, 20 вкладок, границы teacher auth/tenant/cache/atomicity; документальная проверка PASS. | P00-04; gas-postgres-audit |
| `M01-02` | DONE (техническая модель v1; миграции NOT_RUN) | Спроектировать workspace/tenant → преподаватель → ученик → предмет → курс/программа; разные предметы и разные преподаватели без привязки к ЕГЭ/ОГЭ. | [Subject/Course/Enrollment tenant model](../../docs/architecture/tenant-subject-model-v1.md): существующие ключи сохранены, additive migration/backfill и cross-tenant проверки определены; runtime NOT_RUN. | P04-01/02; P02-05 (частично) |
| `M01-03` | DONE (teacher login, DB session/RBAC/revoke; приглашения M06) | Защищённый вход преподавателя и workspace-role checks без публичной регистрации: admin-only bootstrap, JWT/session/revoke, rate limit. Полная teacher CRUD аудиторская запись M04, приглашения M06. | [PR №5](https://github.com/Arthur200014/testing-hosting/pull/5), [auth contract](../../docs/architecture/teacher-auth-m01-03.md): [PostgreSQL 66/66 PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43005907321), [TAS CI gate PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43005907193). Prod/staging NOT_RUN. | P04-01...05 |
| `M01-04` | DONE (live read-only audit; source repairs outstanding) | Сверить свежий snapshot Google Sheets, дубли, пустые обязательные поля и ранее найденные 17 проблемных назначений. | [Live audit 2026-11-11](../../docs/architecture/sheets-source-audit-2026-11-11.md): 20 вкладок, 10 структурных строк ДЗ + 5 orphan ссылок, 3 неполных ученика; корректировка и XLSX dry-run остаются M03-01. Реальные записи NOT_CHANGED. | existing import audits |

**Gate:** G-M01: есть карта листов/действий manage, утверждённая subject-neutral модель, схема изоляции преподавателей и перечень аномалий источника.

### 2. M02 — Изолированный сервер и PostgreSQL
**Зависимости:** G-M01 модель + доступ к окружению

| ID | Статус | Конкретная работа | Критерий готовности | Связь с прежними задачами |
|---|---|---|---|---|
| `M02-01` | PARTIAL (Timeweb managed API+PostgreSQL online; security gate pending) | Поднять приватную PostgreSQL и staging API на выбранном сервере (учесть прежнюю неудачную попытку Timeweb), сетевое разделение, env/secret manager. | Managed Timeweb App Platform и приватный кластер PostgreSQL уже существуют. [Лог деплоя 2026-11-11](../../docs/deployment/timeweb-managed-migrations.md): Build succeeded, Deploy succeeded, user-confirmed HTTPS `/health/live` и `/health/ready` Healthy. Пароль БД ранее оказался в чате — **ротация НЕ подтверждена**; hosted TLS и network access проверены только по сведениям пользователя. VPS/Compose/Caddy **не требуются** для этого варианта. | P03-02/03; timeweb-deployment |
| `M02-02` | DONE (владелец подтвердил `Healthy` после настоящего `--migrate`) | Развернуть ASP.NET Core Docker image, отдельный `--migrate`, доступ через HTTPS/proxy/CORS и health. | [PR №7](https://github.com/Arthur200014/testing-hosting/pull/7) + [PR №8](https://github.com/Arthur200014/testing-hosting/pull/8), [68/68 PostgreSQL CI PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43090374884). Владелец через консоль Timeweb запустил `dotnet Platform.Api.dll --migrate`; присланные логи подтверждают применение до `20261111120000_TeacherSessions`, затем HTTPS `/health/live`, `/health/ready` и `/health/migrations` ответили `Healthy` по сообщению владельца. Проверка native deploy health probe пока отключена; контролировать в M02-03. Restore и импорт не выполнялись. | P03-05/06 |
| `M02-03` | TODO | Добавить автоматический backup PostgreSQL, проверить restore, изоляцию доступов, логи/алерты и обновление без потери данных. | Пробное восстановление на отдельной БД; задокументированы retention и restore steps; минимальный staging smoke. | P13 backup/security |

**Gate:** G-M02: API + приватная PostgreSQL доступны на staging по HTTPS, миграции воспроизводимы, health PASS, backup/restore проверен. Это не prod.

### 3. M03 — Полный перенос исторических данных в PostgreSQL
**Зависимости:** G-M01 + G-M02

| ID | Статус | Конкретная работа | Критерий готовности | Связь с прежними задачами |
|---|---|---|---|---|
| `M03-01` | PARTIAL (owner-confirmed staged apply; skipped invalid source rows) | Existing student/homework importers deployed; actual private filtered snapshot imported through Timeweb. | Owner reports one-shot import command reached `TAS IMPORT COMPLETE` (student 32, catalog 70, assignment 212 according to prepared filtered XLSX); not independently SQL-queried. Source 3 student/15 assignment blockers left in original Sheets, not erased. [PR #10](https://github.com/Arthur200014/testing-hosting/pull/10) remains open. | student-directory-import; homework-migration-slice |
| `M03-02` | PARTIAL (schema/importer merged; Timeweb apply NOT_RUN) | PostgreSQL lesson, participant and subscription snapshot schema + private CLI importer in App Platform. | [PR #12](https://github.com/Arthur200014/testing-hosting/pull/12) merged: 70/70 PostgreSQL CI PASS; preserves one lesson for multiple participants with independent attendance; subscriptions represent package snapshot only, no inferred payment/balance. **Next:** apply additive migration and one-off private history importer in Timeweb; real restore remains unverified. | P05; P06 |
| `M03-03` | TODO | Добавить импорт `Тесты`, `Пробники`, сессии/задачи/варианты, анкеты и архивные данные, где есть бизнес-потребность. | Тесты и пробники не теряют баллы, event IDs и review; сырые JSON/ПДн изолированы; повторяемый импорт. | P09/10; mock legacy |
| `M03-04` | TODO | Сделать rehearsal всех импортов на приватной тестовой/стейджинговой копии в правильной очереди; replay, конфликт, rollback, SQL сверки. | Счётчики и ключи сходятся по каждому листу/tenant; 0 дублей, 0 тихо потерянных строк; целостность подтверждена. | P03 baseline + import suites |
| `M03-05` | TODO | Сформировать протокол сверки источника и PG и дельта-план для записей, поступающих после snapshot; зафиксировать ready-to-cutover. | Отчёт расхождений и карта unresolved rows; до закрытия расхождений нет записи в production PG. | P13 release gate |

**Gate:** G-M03: весь выбранный исторический набор воспроизводимо загружается в staging, совпадают связи/агрегаты, повтор не создаёт дублей; production всё ещё не переключён.

### 4. M04 — Сделать текущую manage работающей через API/PostgreSQL
**Зависимости:** G-M02 + tenant/auth contract + нужные сущности M03

| ID | Статус | Конкретная работа | Критерий готовности | Связь с прежними задачами |
|---|---|---|---|---|
| `M04-01` | TODO | Реализовать server-side teacher auth/RBAC, scope всех teacher endpoints по workspace, роли и ограниченный срок сессии. | Неверная/истёкшая сессия, чужой ученик/tenant и подмена ID отклоняются; integration tests PASS. | P04-01...05 |
| `M04-02` | PARTIAL | Защищённые чтения учеников, уроков, ДЗ, тестов, пробников и абонементов доступны в отдельном кабинете; отчёт по последним 8 занятиям. Старую manage владелец решил оставить без изменений. | Проверить отчёт на живой контрольной выборке; tenant scope защищён API. | manage; P05/P09/P10 |
| `M04-03` | TODO | Сделать защищённые idempotent teacher write endpoints: создать/архивировать ученика, сохранить урок, урок+ДЗ, назначить ДЗ, абонементы/правки. | Запись atomic где связана; 2 одинаковых запроса не создают дублей; никакой записи в чужой workspace. | manage; P05/P06/P09 |
| `M04-04` | TODO | Ввести в `EGA/config/manage.html` переключаемый API adapter и staging opt-in, не переписывая UI и не меняя публичную ссылку. | На staging read/write идут через PostgreSQL, legacy остаётся default до одобрения; безопасный rollback switch. | P04-04; shared/interactive |
| `M04-05` | PARTIAL | Сквозной синтетический сценарий API: вход → ученики → каталог → парный урок + ДЗ → абонемент → чтение, второй преподаватель с другим предметом; отчёт покрыт отдельным расчётом. | Изолированный PostgreSQL CI, затем живое чтение отчёта владельцем; сбой сети и браузерный E2E ещё не закрыты. | P05/P06/P09 E2E |
| `M04-06` | TODO | Встроенное ДЗ без внешней ссылки: преподаватель создаёт содержание, назначает ученику; ученик открывает и сдаёт ответ в TAS, преподаватель видит сдачу. | Рабочий сценарий на отдельной платформе с tenant isolation, nullable оценкой до проверки и защитой от повторной отправки; старые GAS формы не используются как источник нового результата. | M04-05; P06 |

**Gate:** G-M04: на staging преподаватель через существующую manage видит и создаёт свои записи, операции записываются в PostgreSQL, чужие данные недоступны; legacy fallback сохранён.

### 5. M05 — Рабочий сервер и безопасный переход с Google Sheets
**Зависимости:** G-M03 + G-M04

| ID | Статус | Конкретная работа | Критерий готовности | Связь с прежними задачами |
|---|---|---|---|---|
| `M05-01` | TODO | Подготовить production API/DB на сервере: HTTPS, доступ, миграции, резервирование, метрики и закрытие лишних портов; сохранить публичную manage. | Прод-среда и восстановление проверены; stage != prod; нет приватных ключей в репозитории. | P13/P14; server |
| `M05-02` | TODO | Согласовать окно переключения; backup Sheets и PG, остановка/очередь старых записей, финальный export/delta import и reconcile. | Результат подписанной сверки без пропущенных занятий, начислений, дедлайнов и результатов; точка восстановления. | migration cutover |
| `M05-03` | TODO | Только после отдельного разрешения переключить `manage` на PG как единственного writer; legacy read-only/rollback по заранее проверенной процедуре. | Создание и просмотр записей через сервер PASS; нет двух активных writer; live данные не теряются. | P14 release |
| `M05-04` | TODO | Провести пострелизную проверку, мониторинг, защиту от расхождений, сценарий возврата с переносом PG-дельты. | Проверены ключевые отчёты/платежи/занятия; мониторинг и инцидент-процедура рабочие; rollback не теряет новые записи. | P13/P14 |

**Gate:** G-M05: конкретный сервер/домен, backend+PG и manage доступны; подтверждён полный backup, финальная сверка, одно авторитетное хранилище; только после явного одобрения cutover.

### 6. M06 — Универсальная админка для преподавателей (после manage)
**Зависимости:** G-M05

| ID | Статус | Конкретная работа | Критерий готовности | Связь с прежними задачами |
|---|---|---|---|---|
| `M06-01` | TODO | Добавить onboarding второго преподавателя, workspace, предметы и курсы без математических hardcodes, настраиваемые правила/типы занятий. | Два tenant, разные дисциплины (например, математика и язык), строгая изоляция по API и UI. | P01/P04 |
| `M06-02` | TODO | Постепенно создать новый интерфейс админки: главная, ученики, расписание, материалы, задания, финансы, отчёты; ориентиры — присланные скриншоты. | Рабочие экраны используют те же API; сначала основные действия manage, без дублирования бизнес-логики. | P02/P05/P06/P10 |
| `M06-03` | TODO | Пилот с несколькими преподавателями, настройка прав, импорта, предметных настроек и миграция функций из manage по одной. | Межпредметный pilot E2E и измеренные ошибки/время; manage не удалять до подтверждённого паритета. | P14 |

**Gate:** G-M06: два независимых преподавателя с разными предметами ведут данные без пересечения, рабочий UI постепенно заменяет manage без потери функций.

### 7. M07 — После инфраструктуры: уроки, механики, AI
**Зависимости:** G-M06 или отдельное утверждённое решение

| ID | Статус | Конкретная работа | Критерий готовности | Связь с прежними задачами |
|---|---|---|---|---|
| `M07-01` | PARKED | Вернуться к `LessonDefinition`, банку заданий, общей доске и межпредметным интерактивам только после надёжной базы и manage. | Предметная абстракция, не только ЕГЭ; прежние P01-05/P02-05/P07/P08 не уничтожены. | P01-05, P02-05, P07/P08 |
| `M07-02` | PARKED | Внедрять AI-генерацию, оценивание, рекомендации, мессенджеры и другие расширения только отдельными безопасными срезами. | Нет влияния ошибки LLM на записи уроков, финансы и идентичность. | P11/P12/P15 |

**Gate:** Позднее: проверяемый LessonDefinition, интерактив и AI без влияния на данные/основные операции.

## Обязательные границы
- Сейчас **не переносить реальные данные** и не менять default GAS в `manage.html`: подготовка схемы/CI/импорта ≠ разрешение переключить production. Реальный apply только после backup + rehearsal + свежей сверки и явного cutover.
- Не выкладывать в Git XLSX, student codes, имена, токены, пароли и персональные данные; не проверять запись на реальных учениках.
- Каждый объект и endpoint ограничивается workspace/tenant; предмет — атрибут курса/программы, не hardcoded «математика».
- Сохранять legacy ID, даты, статусы, историю, баллы и остатки; проблемные строки не угадывать и не выбрасывать.
- Не строить ещё один UI параллельно с `manage`; интерактивы/фронтенд отложены до устойчивой БД.
- Исполнять `AGENTS.md`: минимальный целевой контекст, тесты по риску, commit + push, короткий HANDOFF. Не создавать огромные отчёты ради процесса.
