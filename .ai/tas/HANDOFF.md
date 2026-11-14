# TEACHER AI STUDENT — HANDOFF

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI, UI-01…UI-08
**ACTIVE_TASK:** UI-02 — первый срез: постоянный индивидуальный класс и создание
**ACTIVE_BRANCH:** `tas/UI-02-individual-class-create`
**CONTEXT_MODE:** читать только текущий `NEXT_ACTION`, нужные участки кода и экраны `03–04`; без полного архива/репозитория/логов; production-данные не менять
**LAST_IMPLEMENTATION_COMMIT:** [`c6c1f07`](https://github.com/Arthur200014/testing-hosting/commit/c6c1f071f46f19c48f07c8a6e089483a69a15edc) — модель/API/миграция и форма создания индивидуального класса
**NEXT_ACTION:** Дождаться CI ветки и исправить только реальные ошибки. Затем получить видимый в текущей Library файл `Meleto_Reference_Pack.zip` (`libfile_2a4feb1037c08191997ce235ce5fd686`) или вложение, открыть только `03_individual_create_top` и `04_individual_create_bottom`, сравнить форму при `1348×926` и сделать адресные визуальные правки. После зелёных checks открыть/слить PR, очистить `ACTIVE_BRANCH` и продолжить UI-02 с настройками нижней части `04`; группы, расписание, доски и платежи не смешивать с этим шагом.
**VERIFICATION:** PASS — `node --test platform/teacher-data.test.mjs platform/teacher-mutation.test.mjs` (8/8), inline/browser syntax, `git diff --check`. PASS — synthetic Chromium/Node 22: cancel/create/reload формы при `1348×926`, workspace switch/cache/retry/logout, native homework regression. NOT_RUN локально — .NET/PostgreSQL integration, потому что `dotnet` отсутствует; тест tenant/idempotency добавлен и должен пройти в GitHub CI. BLOCKED — сравнение с PNG `03–04`: Library read по точному ID сообщил, что файл не видим; точный поиск и полный paginated list owned/shared также не нашли ZIP. Production API/БД не вызывались.

## UI-02 checkpoint

- PR #47 с UI-01 слит в `main` коммитом `3c1ca20`.
- `TeacherClass` — отдельная tenant-scoped сущность; `LearningProgram` остаётся предметной программой.
- `GET/POST /api/v1/teacher/classes`: активный ученик только своего workspace, валидация, request-id idempotency и conflict semantics.
- Миграция `20261115120000_TeacherClasses`; существующие ученики, занятия и связи не переписываются.
- В кабинете индивидуальный вариант открывает форму, отмена не пишет, создание обновляет список; постоянный класс заменяет legacy-проекцию того же ученика без дубля.
- Группы, стоимость, длительность, чат, обложка, редактирование и архив остаются следующими частями UI-02; чеклист `03–06` ещё не закрыт.

## Правило продолжения

1. Начать с этого файла на `main`; если `ACTIVE_BRANCH` не `none`, сверить её HEAD и более новый HANDOFF на ветке.
2. Не повторять merge/import и не создавать параллельную ветку. Продолжать от `NEXT_ACTION` и фактического Git.
3. Реальные ученики, доски, пароли, production writer и GAS не менять; новые проверки выполнять только на synthetic данных.
