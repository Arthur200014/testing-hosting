# TEACHER AI STUDENT — HANDOFF

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI, UI-01…UI-08
**ACTIVE_TASK:** UI-02 — индивидуальный класс: создание, настройки, редактирование, архив/восстановление
**ACTIVE_BRANCH:** `none`
**LAST_IMPLEMENTATION_COMMIT:** [`60440a1`](https://github.com/Arthur200014/testing-hosting/commit/60440a1face7a91573d6cf6d1e449a58a54cc35f) — [PR #51](https://github.com/Arthur200014/testing-hosting/pull/51), merged
**NEXT_ACTION:** Продолжить UI-02 крупным взаимосвязанным блоком: *обложка индивидуального класса, безопасный сценарий приглашения ученика и работа с приглашениями* (экран `03`, релевантные экраны приглашений). Сначала уточнить по текущему коду существующие invite flows и студентскую идентификацию, не повторять регистрацию/импорт. Обложка должна быть необязательной, без произвольных внешних URL в production-хранилище. Приглашение создавать только явным действием, никакой автоматической отправки или создания нового ученика. Сделать API + UI + synthetic tenant/security/browser/integration checks. Затем переходить к групповым классам `05–06` отдельным связанным этапом. Не обещать реализованный чат или биллинг (есть лишь настройки).
**CONTEXT_MODE:** начать с `AGENTS.md` и этого файла на `main`; ограничиться текущим NEXT_ACTION и нужными символами. Использовать `.ai/tas/MELETO_SCREEN_INDEX.md` и только релевантные кадры, без обхода EGA/OGA/platform целиком.
**VERIFICATION:** PASS — [Native homework browser 43649987944](https://github.com/Arthur200014/testing-hosting/actions/runs/43649987944), [Homework import integration 43649987912](https://github.com/Arthur200014/testing-hosting/actions/runs/43649987912), [TAS task CI 43649987920](https://github.com/Arthur200014/testing-hosting/actions/runs/43649987920) на head `7dbe225` перед merge. Synthetic Chromium 1348×926: сохранение, отмена, редактирование настроек, архивирование/восстановление с подтверждением, reload, отсутствие дублированной legacy-проекции. Снимки `31_class_edit.png` и `33_class_archive.png` просмотрены из CI artifact. .NET/PostgreSQL: invalid fields, optimistic revision conflicts, tenant isolation, archive/restore, no student modification. NOT_RUN — production/Timeweb.
 
## Выполненные блоки UI-02

- [PR #48](https://github.com/Arthur200014/testing-hosting/pull/48): tenant-scoped `TeacherClass`, GET/POST, идемпотентное создание, legacy-проекция существующих учеников.
- [PR #49](https://github.com/Arthur200014/testing-hosting/pull/49): описание до 200 символов, название новых классов до 50, счётчики, совместимая миграция.
- [PR #50](https://github.com/Arthur200014/testing-hosting/pull/50): длительность, цена как условие (не биллинг), политики чата (не сам чат); новая миграция, API/UI и тесты.
- [PR #51](https://github.com/Arthur200014/testing-hosting/pull/51): PATCH `/api/v1/teacher/classes/{classId}`, POST `.../{classId}/archive`, POST `.../{classId}/restore`; `Revision` с EF concurrency token и аддитивной миграцией `20261115150000_TeacherClassRevision` (старым записям ревизия 1). Редактор, архивные карточки, восстановление, серверная проверка revisions/workspace/validation и browser regression. Существующие названия длиннее 50 можно сохранить без переименования. Изменения только `platform/src/Platform.Api/Classes/*`, `Persistence/{PlatformDbContext.cs,Migrations/*}`, `Program.cs`, `platform/teacher.html`, `platform/teacher-data.mjs`, `platform/meleto-ui-browser.mjs`, `platform/tests/Platform.Api.IntegrationTests/TeacherSessionTests.cs`. Таблицы учеников, история и расписание не менялись.

## Безопасность и ограничения

- Не трогать реальные данные, пользователей, коды, пароли, доски, импорты, GAS, production writer. Архив класса не архивирует ученика, история сохраняется.
- Время занятия 15–240 мин — предметная настройка, не лимит времени работы ассистента.
- Production migration и deployment на Timeweb не выполнялись и отдельно не подтверждены. Бэкапы/retention — долг RELEASE_SAFETY.
- Визуальная точность всего Meleto UI-02 пока не закрыта. В Library доступен PDF `Meleto_Design_Reference_and_Build_Brief.pdf`, исходный ZIP/PNG архив ранее не был найден.
