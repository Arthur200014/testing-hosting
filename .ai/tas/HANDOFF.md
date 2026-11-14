# TEACHER AI STUDENT — HANDOFF

**STATE_UPDATED:** 2026-11-15
**PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md), Meleto UI-01…UI-08
**ACTIVE_TASK:** UI-02 — индивидуальный класс завершён до создания/обложки/приглашения/настроек/редактирования/архива
**ACTIVE_BRANCH:** `none`
**LAST_IMPLEMENTATION_COMMIT:** [`2cb6a14`](https://github.com/Arthur200014/testing-hosting/commit/2cb6a14f251c3027b71b2d77b8a0627bdf3f61d5) — [PR #52](https://github.com/Arthur200014/testing-hosting/pull/52), merged
**NEXT_ACTION:** Продолжить UI-02 *крупным связанным блоком* — **постоянная сущность группового класса + Enrollment нескольких существующих учеников + создание/просмотр/управление составом и архивом** по референсам `05_group_create_top`, `06_group_create_bottom` и `09_class_summary`. Сначала посмотреть текущие `TeacherClass`, `WorkspaceStudentMembership`, `TeacherClassService`, `platform/teacher.html`, миграции и смежные тесты. Не подменять класс `LearningProgram` и не превращать парное занятие в группу. Tenant isolation, права участников, проверка выбранных учеников, отсутствие повторных enrollment, совместимые миграции, synthetic PostgreSQL/Chromium tests; без реальных учеников, импорта или production writes. Приоритет: один полный пользовательский сценарий, не отдельные микрополя. Детальную работу с родителями/ролью приглашения оставить UI-05.
**VERIFICATION:** PASS — [TAS task CI 43652009291](https://github.com/Arthur200014/testing-hosting/actions/runs/43652009291), [Homework import integration 43652009256](https://github.com/Arthur200014/testing-hosting/actions/runs/43652009256), [Native homework browser 43652009344](https://github.com/Arthur200014/testing-hosting/actions/runs/43652009344), head `5dbce38` перед merge. Chromium 1348×926: создание и изменение обложки, создание и отзыв кода, одноразовый показ, пропажа кода при reload, студент авторизуется и подтверждает код, прежние edit/archive/reload regression; визуально просмотрены `03_individual_create.png` и `03_class_cover_invite.png`. PostgreSQL: миграции, валидация стилей, stale revision, чужой workspace и student, запрещённое повторное использование, отзыв и архив. NOT_RUN: Timeweb production/manual student data.

## Выполнено по UI-02

- [PR #48](https://github.com/Arthur200014/testing-hosting/pull/48): tenant-scoped индивидуальный `TeacherClass`, idempotent create, существующие ученики.
- [PR #49](https://github.com/Arthur200014/testing-hosting/pull/49): описание, лимиты, счётчики.
- [PR #50](https://github.com/Arthur200014/testing-hosting/pull/50): длительность, стоимость как сохранённое условие (не платёж), политики чата (не переписка).
- [PR #51](https://github.com/Arthur200014/testing-hosting/pull/51): редактирование, Revision-конкурентность, архив/восстановление без изменения ученика/истории.
- [PR #52](https://github.com/Arthur200014/testing-hosting/pull/52): обложки `lavender/sky/peach/mint` без внешних URL; учитель вручную выдаёт *одноразовый* приглашательный код уже привязанному ученику. Код случайный 32 байта/64 hex, хранится только SHA256; действует 7 дней, можно отозвать/перевыпустить, архивирование отзывает `pending`. Принятие только через существующий student JWT, workspace/membership/student проверяются на сервере; это **не** код входа, email/мессенджер не отправляются, новые учётные записи не создаются. Изменения: `platform/src/Platform.Api/Classes/*`, `Persistence/{PlatformDbContext.cs,Migrations/PlatformDbContextModelSnapshot.cs,Migrations/20261115160000_TeacherClassCoverInvitation.cs}`, `Program.cs`, `platform/{teacher.html,student.html,meleto-ui-browser.mjs}`, `tests/Platform.Api.IntegrationTests/TeacherSessionTests.cs`.

## Ограничения и экономия контекста

Следовать `AGENTS.md`, читать текущую ветку или NEXT_ACTION, использовать `.ai/CONTEXT_MAP.md`. Не сканировать EGA/OGA/platform целиком; для Meleto только нужные `05–06` PNG/JSON или ограниченные страницы Library PDF `Meleto_Design_Reference_and_Build_Brief.pdf`. Точный ZIP-пакет ранее был недоступен; не заявлять полную визуальную точность без него.

Реальные записи учеников, коды входа, Google Sheets/GAS, импорт, рабочая Timeweb-БД, production writer и деплой в этом PR не затрагивались. Бэкапы/retention остаются отдельным RELEASE_SAFETY. Предел 15–240 минут — настройка длительности занятия, а не лимит времени разработки в чате.
