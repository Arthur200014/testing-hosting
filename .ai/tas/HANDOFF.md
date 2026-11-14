# TEACHER AI STUDENT — HANDOFF

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI, UI-01…UI-08
**ACTIVE_TASK:** UI-02 — индивидуальный класс: создание + длительность + цена + политики чата завершены, [PR #50](https://github.com/Arthur200014/testing-hosting/pull/50) слит
**ACTIVE_BRANCH:** `none`
**LAST_IMPLEMENTATION_COMMIT:** [`145169a`](https://github.com/Arthur200014/testing-hosting/commit/145169aebd05655b1d322d9bba3f65e8ed261c41)
**NEXT_ACTION:** UI-02 — одним связанным пакетом реализовать **редактирование существующего индивидуального класса, архивирование и возврат из архива**, включая tenant-scoped API, совместимые миграции только при реальной необходимости, форму/карточку по релевантным экранам `09–10, 31–33`, подтверждение действий, отмену без записи, синтетические backend/browser regression и реальную проверку reload. Не архивировать/удалять ученика и его историю; архив класса — отдельное свойство. После этого перейти к обложке/приглашениям `03` и групповым классам `05–06`.
**CONTEXT_MODE:** читать `AGENTS.md` и HANDOFF на `main`; смотреть только нужные символы, миграции и 2–3 референс-кадра, не сканировать все EGA/OGA/platform и 74 экрана.
**VERIFICATION:** PASS — [TAS task CI 43648149949](https://github.com/Arthur200014/testing-hosting/actions/runs/43648149949), [Homework import integration 43648149862](https://github.com/Arthur200014/testing-hosting/actions/runs/43648149862), [Native homework browser 43648149874](https://github.com/Arthur200014/testing-hosting/actions/runs/43648149874) на `93114d9`; Chromium 1348×926: cancel/create/readback/reload, duration/price/chat toggles, screenshot `04_individual_settings.png` просмотрен. NOT_RUN — production/Timeweb, live writes. Визуальное соответствие всего UI-02 ещё не завершено.

## Выполнено

- [PR #48](https://github.com/Arthur200014/testing-hosting/pull/48): самостоятельная tenant-scoped `TeacherClass`, GET/POST, idempotent create и legacy membership projection.
- [PR #49](https://github.com/Arthur200014/testing-hosting/pull/49): название до 50 для новых классов, описание до 200, счётчики, аддитивная миграция.
- [PR #50](https://github.com/Arthur200014/testing-hosting/pull/50): объединённый срез экрана `04`: необязательная длительность 15–240 минут/шаг 5, необязательные стоимость 0–10000000 (2 знака), RUB/EUR/USD, за занятие или месяц, два флага разрешения чата. Одно сохранение через API; цена — только условие обучения без счетов/платежей, флаги чата — только настройки до UI-06. Совместимая добавочная миграция `20261115140000_TeacherClassSettings` (старым классам null/false), проверка входа, idempotency, tenant isolation, defaults старых клиентов. Путь: `platform/src/Platform.Api/Classes/*`, `Persistence/PlatformDbContext.cs`, `Persistence/Migrations/{PlatformDbContextModelSnapshot.cs,20261115140000_TeacherClassSettings.cs}`, `platform/teacher.html`, `platform/meleto-ui-browser.mjs`, `platform/tests/Platform.Api.IntegrationTests/TeacherSessionTests.cs`.

## Ограничения

- Не трогать реальные записи учеников, архив/историю их занятий, доски, пароли, импорты, GAS и production writer. Все проверки только на synthetic данных.
- Существующий Timeweb/managed PostgreSQL не менялся вручную. Реальные миграции и production deployment этим PR не подтверждены, бэкапы/retention остаются отдельным `RELEASE_SAFETY`.
- Полная визуальная точность Meleto пока не достигнута; доступный PDF референсов `Meleto_Design_Reference_and_Build_Brief.pdf` содержит кадры `03–04`. В браузерном артефакте `03` снят после прокрутки, `04` корректно показывает нижние настройки; при следующей доработке screenshot runner отдельно фиксировать прокрутку к верху перед `03`.
