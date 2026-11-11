# HANDOFF: TEACHER AI STUDENT

**Updated:** 2026-11-11
**REPO:** `Arthur200014/testing-hosting`
**BRANCH:** `main`
**ACTIVE_TASK:** `none`
**ACTIVE_BRANCH:** `none`
**LAST_CHECKPOINT:** `b29b3cc88d8bd84b5adc92888367c3d3d1512b9a` (P00-01 audit evidence; итог интегрирован в main)
**TASK_CARD:** `.ai/tasks/tas-P00-01.md` (`DONE`)
**PLAN_COMMIT:** `66da87d28f1ba52e8721c3555efe3b295ff1457e`
**NEXT_STEP:** P00-02 — на изолированном runner проверить команды запуска/stack/test baseline, затем готовить основной вертикальный срез урока
**CURRENT_PHASE:** `P00`
**NEXT_ACTION:** `P00-02`
**STATUS:** `DONE`

## Последняя завершённая работа: выборочный CI (инкремент P03-04)

- Создан `.github/workflows/tas-task-ci.yml`; автозапуск на push в `tas/**`, выбор `shared`/`backend`/`web`/`task` по реально изменённым файлам.
- На обновление самого CI запускаются только selector tests. Для изменённых legacy-страниц требуется тест текущего task ID; для shared JS — парный `.test.mjs` или тест задачи.
- [GitHub run 42990977589](https://github.com/Arthur200014/testing-hosting/actions/runs/42990977589) — **success**, selector 12/12 PASS, gate PASS на коде `09171df9`.
- Ранний широкий smoke run [42990533464](https://github.com/Arthur200014/testing-hosting/actions/runs/42990533464) нашёл существующие сбои: 2 старых shared теста (52 vs 50 и OGE regexp), NuGet предупреждения NU1902/NU1903 по `System.Security.Cryptography.Pkcs` 9.0.0. Они не исправлялись.
- Полный P03-04 остаётся **BLOCKED/partial** до G02 и отдельного исправления прежних ошибок. Сейчас возобновляем `P00-01`, не повторяем готовый CI-bootstrap.

## Что достоверно известно

- В `testing-hosting` существуют `EGA/`, `OGA/` и `shared/interactive/v1/`.
- Существуют `platform/`, `compose.yaml` и документация `docs/architecture/platform-foundation.md`.
- `platform/README.md` описывает ASP.NET Core 10, PostgreSQL 17, API сессий и тестовых попыток, импорт и тесты.
- Существующие GAS/Firebase интерфейсы не были полностью заменены новым backend; описание текущей миграции находится в архитектурной документации.
- В `AGENTS.md` есть правила узкого чтения, тестирования, автоматических коммитов, а также специальное правило сохранения долгих задач в ветку `tas/<TASK_ID>`. Подробности: `.ai/tas/CHECKPOINTS.md`.
- **Мы не запускали Docker, тесты и браузерные сценарии при создании этих документов.** Все статусы приёмки требуют проверки на рабочем коде.

## Приоритет

Интерактивная теория на переиспользуемых шаблонах; проверяемая генерация урока через LLM; ДЗ и проверка; знания ученика и следующий шаг. CRM/абонементы/календарь — важны, но не должны заслонять эту цель.

## Завершён P00-01 — целевой аудит без изменений production

- Подтверждены по исходникам: ASP.NET Core/PostgreSQL API сессий, тестов и ДЗ; `PlatformDbContext`, миграционный Compose; shared interactive/data/realtime; EGA/6 compatibility shim; прямой GAS на выборочной OGA/6 странице.
- Матрица «модуль → доказательство → тесты → пробел → roadmap ID» и документальные кейсы A1–A6 сохранены в [карточке P00-01](../tasks/tas-P00-01.md).
- GitHub run [42990977589](https://github.com/Arthur200014/testing-hosting/actions/runs/42990977589) подтвердил **только selector scope PASS**, shared/backend/web/task SKIPPED. Предыдущий широкий [42990533464](https://github.com/Arthur200014/testing-hosting/actions/runs/42990533464) имеет shared/restore failures, не исправленные в рамках P00-01.
- Runtime, Docker/dotnet, браузер и prod **NOT_RUN** в P00-01. Этот аудит не означает готовый MVP, не закрывает G00/G02 и не запускает другие задачи.
- **NEXT_ACTION P00-02:** установить истинную воспроизводимость существующего backend в безопасной изолированной среде; после закрытия P00 gate — главный продуктовый путь P01-05 → P02-05 → P08 (интерактивные шаблоны) → P12 (проверяемая LLM-генерация), с повторным использованием P07 transport и P09/P10 данных.

## Запрет на широкое чтение

Не читать весь `testing-hosting` и не грузить всю историю чатов. По каждому task ID выбрать **3–10 релевантных файлов** и расширять область только по найденным зависимостям. Это ориентир, а не запрет читать необходимую дополнительную зависимость.

## Заключительная запись каждого чата

```text
TASK_ID:
STATUS: TODO | IN_PROGRESS | BLOCKED | DONE
BRANCH:
ACTIVE_BRANCH:
LAST_CHECKPOINT:
TASK_CARD:
PLAN_COMMIT:
COMMIT:
PUSH_STATUS:
FILES_CHANGED:
VERIFICATION: команды + реальные результаты / не запускались
OPEN_ISSUES:
NEXT_STEP:
NEXT_ACTION: Pxx-yy
```

Никогда не обозначать `DONE` без проверок и подтверждённого коммита. Если был только GitHub-read без локального теста, так и написать.
