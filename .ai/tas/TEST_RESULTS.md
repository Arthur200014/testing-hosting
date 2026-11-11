# TAS: журнал подтверждённых проверок

## 2026-11-11 — перенос workflow-документации

- Проверены через подключённый GitHub API: структура корня, наличие `platform/`, `shared/interactive/v1/`, `compose.yaml`, `AGENTS.md`, `.ai/START_HERE.md`, `.ai/CONTEXT_MAP.md`.
- `platform/README.md` и `docs/architecture/platform-foundation.md` прочитаны выборочно. Это документация, **не доказательство прохождения тестов сегодня**.
- `docker compose`, `dotnet test`, Playwright и публикация на VPS **не запускались** в этой задаче.
- Для каждого следующего ID записывать: команда, дата, среда, фактический результат, ссылки на логи/коммит. Не писать `PASS` без запуска.

## 2026-11-11 — протокол checkpoint / восстановления

- Подготовлены правила Git-коммитов для WIP-веток и восстановления контекста между чатами; проверка содержания документации и публикации выполняется через GitHub API.
- Работающий автоматический таймер/daemon для сохранения **не запускался и не устанавливался**. Правило означает сохранение после малых завершённых этапов, не гарантированное событие каждые 3–5 минуты.
- Исходники сайта, PostgreSQL, API и тесты не менялись; исполняемые тесты не запускались.

## 2026-11-11 — обязательная карточка задачи перед реализацией

- Документально закреплена стадия `PLAN`: существующая задача -> точечный аудит -> чеклист -> first planning commit -> код -> checkpoints -> тесты -> DONE.
- Добавлен шаблон `.ai/tas/TASK_TEMPLATE.md` и изменён маршрут нового чата. Это настройка процесса, а не запуск задач `P00-01` и далее.
- Исполняемый код и реальные ученические данные не изменяются; runtime тесты по данному документальному коммиту не запускались.

## 2026-11-11 — требование целевых тестов к каждой TAS-задаче

- В инструкции ИИ закреплён цикл: карточка и кейсы -> код+тесты -> реальное выполнение -> исправление FAIL -> повторный прогон -> DONE только после PASS.
- Для отдельной задачи используются только её тесты и узкая регрессия. При невозможности запустить обязательную проверку статус BLOCKED/NOT_RUN.
- Это изменение **только документации**; созданные правила проверены чтением GitHub-файлов, но runtime-тесты новой функциональности TAS здесь не проводились. Новый общий workflow не создавался.

## 2026-11-11 — TAS CI-bootstrap, задача P03-04

- Локально: `node --test scripts/tas-ci-scope.test.mjs` — **PASS 12/12**; YAML синтаксически проверен парсером. Эти проверки охватывают выборочное назначение тестов, включая позитивные, негативные и граничные случаи.
- GitHub-hosted: [TAS task CI run #42990977589](https://github.com/Arthur200014/testing-hosting/actions/runs/42990977589), SHA `09171df9d9f1c534b33fad33f725e5ed29631687`: **scope PASS 12/12; gate PASS**; job `shared`, `backend`, `web`, `task` — **SKIPPED** (их исходники не менялись). Нельзя называть их проверенными на этом SHA.
- Первый отладочный прогон [#42990533464](https://github.com/Arthur200014/testing-hosting/actions/runs/42990533464) выявил ранее существовавшие проблемы: shared runtime 110 PASS и 2 FAIL (`homework-gas-pages.test.mjs`: 52 страницы против ожидаемых 50; `mock-exam-variant-save.test.mjs`: устаревшее regex-ожидание); backend Docker restore FAIL из-за уязвимой зависимости `System.Security.Cryptography.Pkcs` 9.0.0 (NU1902 / NU1903). Не исправлено — за пределами CI-bootstrap.
- Для этого коммита новая CI-конфигурация действительно опубликована в task-ветке и проверена на GitHub. Полный P03-04 пока **BLOCKED/частично**, поскольку G02 не подтверждён, фронтенд отсутствует и зависимые базовые тесты требуют отдельного ремонта.

## 2026-11-11 — P00-01, выборочный аудит существующей платформы (документальный WIP)

- GitHub API: проверены права, SHA `main`, first plan commit `66da87d28f1ba52e8721c3555efe3b295ff1457e`, исходники `Program.cs`, `PlatformDbContext.cs`, shared entrypoints, EGA compatibility shim и OGA/6/dz1.html. A1–A4: **PASS как проверка чтением кода**, не runtime.
- Исторический CI: run [42990977589](https://github.com/Arthur200014/testing-hosting/actions/runs/42990977589) имеет SUCCESS только в scope+gate, shared/backend/web/task SKIPPED; run [42990533464](https://github.com/Arthur200014/testing-hosting/actions/runs/42990533464) failure, 2 shared теста FAIL, Docker restore не завершён (NU1902/NU1903). A5: **PASS как проверка реальных GitHub run/logs**.
- Исполняемые тесты P00-01: **NOT_RUN**. Установлен Node 22, но git HTTPS не резолвится; Docker и dotnet недоступны. Публичные сайты, prod API и данные учеников не тронуты. Для документального аудита обязательна только A6 (сверка записей и git diff).
- Следующее: PASS A6 -> закрыть P00-01 и перенести документацию в main; P00-02 — реальный baseline запуск только в изолированной среде.

## 2026-11-11 — P00-01 финальная приёмка документального аудита

| Кейс | Среда | Результат | Подтверждение |
|---|---|---|---|
| A1 | GitHub repo/branch API | PASS | права, main SHA, plan-commit `66da87d28f1ba52e8721c3555efe3b295ff1457e` |
| A2 | targeted GitHub fetch_file | PASS | Program.cs, DbContext, StudentSession/TestAttempt/Homework tests |
| A3 | targeted GitHub fetch_file | PASS | legacy `platformApi` default, opt-in ASP.NET, Firebase realtime |
| A4 | targeted GitHub fetch_file | PASS | EGA/6 shim и OGA/6/dz1.html, отсутствие широкого сканирования |
| A5 | GitHub Actions run/jobs/logs API | PASS (исторические статусы) | [42990977589](https://github.com/Arthur200014/testing-hosting/actions/runs/42990977589): selector success; [42990533464](https://github.com/Arthur200014/testing-hosting/actions/runs/42990533464): shared/backend failures |
| A6 | GitHub compare_commits + 7 проверок связности | PASS 7/7 | `22de2e67` → `b29b3cc8`, изменены лишь TAS documents |

**Runtime-tests:** NOT_RUN сегодня: `node --test`, Docker/.NET/PostgreSQL integration, Playwright, production smoke. Причина: audit-only, нет Docker/dotnet, git checkout через DNS недоступен. Это НЕ доказательство работоспособности и будет предметом P00-02. Данные учеников не использовались. **Статус P00-01: DONE (документальный scope).**
