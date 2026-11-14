# TEACHER AI STUDENT — HANDOFF

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI, UI-01…UI-08
**ACTIVE_TASK:** UI-02 — первый срез индивидуального класса завершён и слит; этап UI-02 продолжается
**ACTIVE_BRANCH:** `none`
**LAST_IMPLEMENTATION_COMMIT:** [`f6d2e54`](https://github.com/Arthur200014/testing-hosting/commit/f6d2e5431a193c3c59ee81548794a4b5b7564cfb) — merge [PR #48](https://github.com/Arthur200014/testing-hosting/pull/48); миграционный индекс исправлен в [`cae8c3c`](https://github.com/Arthur200014/testing-hosting/commit/cae8c3cc72fa7e2ca8bef85517b627b00e8aca02).
**NEXT_ACTION:** UI-02, следующий один небольшой сценарий экрана `03_individual_create_top`: хранить описание класса (до 200 символов) и ограничить название 50 символами, добавить счётчики и аккуратно приблизить расположение полей/кнопок к референсу. Реализовать API, модель/миграцию, форму и проверку сохранения/отмены с синтетическими данными. Затем отдельными задачами выполнить `04` (стоимость/длительность/чаты) и остальные функции UI-02; не смешивать группы, расписание, доски и платежи с этим шагом.
**CONTEXT_MODE:** читать только `NEXT_ACTION`, нужные символы/файлы, референсы `03–04`; без полных файлов/диффов и обхода всего репозитория.
**VERIFICATION:** PASS — GitHub [TAS task CI 43645726806](https://github.com/Arthur200014/testing-hosting/actions/runs/43645726806), [Homework import integration 43645726797](https://github.com/Arthur200014/testing-hosting/actions/runs/43645726797), включая .NET/PostgreSQL миграционные и интеграционные тесты. Ранее PASS — Node unit (8/8), syntax/diff, synthetic Chromium cancel/create/reload at 1348×926, workspace switch/retry/logout, native homework regression. Скриншот `03_individual_create.png` просмотрен из CI artifact [43644761870](https://github.com/Arthur200014/testing-hosting/actions/runs/43644761870); референсы `03–04` доступны на стр. 21–22 Library PDF `Meleto_Design_Reference_and_Build_Brief.pdf`. Визуальное совпадение ПОКА НЕ достигнуто: реализован только первый функциональный срез, отсутствуют описание, обложка, приглашения и нижние настройки. Точный ZIP/PNG-пакет всё ещё недоступен; PDF — доступная альтернатива. Production API/БД и реальные ученики не изменялись.

## Итог UI-02, первый срез

- `TeacherClass` — самостоятельная tenant-scoped сущность и миграция `20261115120000_TeacherClasses`; `LearningProgram` не подменяется классом.
- `GET/POST /api/v1/teacher/classes`: membership только своего workspace, проверка входа, idempotent create по RequestId, обработка конфликта.
- Учитель создаёт индивидуальный класс для существующего ученика; отмена без записи; список обновляется и сохраняется после reload. Постоянный класс заменяет legacy-проекцию, не дублируя карточку.
- Интеграционный сбой `PendingModelChangesWarning` устранён: состав FK-индекса согласован между DbContext, migration и snapshot. PR #48 слит после зелёных CI.
- Остальные поля формы, настройки, групповые классы, редактирование и архив не реализованы; это следующие части UI-02.

## Правила продолжения и безопасности

1. Читать `AGENTS.md` и этот файл на `main`; если `ACTIVE_BRANCH` не `none`, сверять более новый HANDOFF ветки. Работать только над одним `NEXT_ACTION`, использовать [карту кода](../CONTEXT_MAP.md).
2. Скриншоты `03–04` искать в указанном Library PDF, не перечитывать все 74 кадра. Сравнивать на 1348×926 с screenshot CI; не объявлять неполную форму точной копией.
3. Не трогать реальных учеников, доски, пароли, импорт, GAS или production writer. Использовать изолированные синтетические данные. Отдельный RELEASE_SAFETY (бэкапы и production revision) не является текущей задачей.
