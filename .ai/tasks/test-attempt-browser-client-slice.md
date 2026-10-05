# Browser-client срез отправки результатов тестов

Status: DONE

## Цель

Подключить уже готовый ASP.NET Core `POST /api/v1/test-attempts` к общему browser
data boundary без изменения отдельных интерактивов и без production cutover:
нормализовать legacy payload, использовать student Bearer session, сохранить
offline/retry/idempotency semantics и оставить legacy provider безопасным
default/fallback до отдельного этапа переключения production traffic.

## Область работы

- `shared/interactive/v1/aspnet-api-client.js`: authenticated отправка test attempt.
- Compatibility mapper legacy `submitTest` payload → строгий ASP.NET contract.
- Интеграция с существующим `platform-data` / result queue boundary без копирования
  логики по HTML-страницам.
- Сохранение `eventId`, исходных completion timestamps и повторной доставки.
- Нормализация HTTP/timeout/network/conflict/unauthorized ошибок для очереди.
- Тесты mapper/client/queue поведения на synthetic data.
- Browser/behavior verification общего пути без production write.
- Обновление архитектурной документации по подтверждённому browser contract.

## Вне области работы

- Production cutover с Google Apps Script на ASP.NET.
- Production import старой истории результатов.
- Изменение Firebase, Google Apps Script, UI, CSS или содержимого заданий.
- Teacher/admin API, homework, mocks, lessons, subscriptions и reports.
- Массовая правка отдельных EGA/OGA HTML, если общий boundary позволяет избежать её.
- Отправка реальных ученических данных в тестах или diagnostics.

## Текущее состояние

- Backend write slice завершён: `POST /api/v1/test-attempts`, PostgreSQL history,
  replay/conflict/concurrency/monthly-best и DB invariants проходят real PostgreSQL
  integration suite 40/40.
- `shared/interactive/v1/aspnet-api-client.js` теперь содержит centralized legacy
  mapper, lazy student-session exchange, in-memory session cache per student code,
  authenticated `submitResult()` и Bearer `fetch(..., keepalive:true)` для exit-send.
- `shared/interactive/v1/platform-api.js` по-прежнему создаёт
  `LegacyApiClient`; production traffic остаётся на Apps Script.
- `createPlatformData()` уже делегирует `submitResult`, `sendResultOnExit` и
  result queues через provider/API boundary, поэтому предпочтителен shared adapter,
  а не изменения каждой страницы.
- Подтверждены 4 `submitTest` builder в `EGA/6`; shared queues сохраняют исходный
  payload и повторяют тот же `eventId`, а mapper предпочитает исторический
  `finishedAt` и не использует время фактической доставки как `CompletedAt`.
- `JEV_ROUTE: FAILED`: TypeSafe/Jev runtime binding недоступен; используется
  последовательный deterministic fallback с независимым review.

## Принятые решения

- Не переключать default provider и не направлять production traffic в ASP.NET в
  рамках этой задачи.
- Не принимать student identity из legacy payload: новый API использует только
  Bearer JWT/session, как и backend write slice.
- `eventId` и время завершения события должны переживать offline/retry без
  регенерации при повторной доставке.
- Compatibility mapping должен быть централизован в shared layer и покрыт
  deterministic tests.
- Любая необходимость править отдельные страницы должна быть доказана
  отсутствием нужных данных в общем payload/boundary.

## Связанные файлы

- `shared/interactive/v1/aspnet-api-client.js`
- `shared/interactive/v1/platform-api.js`
- `shared/interactive/v1/platform-data.js`
- `shared/interactive/v1/legacy-api-client.js`
- `.ai/tasks/test-attempt-write-slice.md`

## Выполнено

- Создан отдельный browser-client workstream после завершения backend write slice.
- Зафиксированы production safety boundaries и запрет на cutover в этой задаче.
- Подтверждены 4 фактических `submitTest` builder в `EGA/6` и legacy aliases.
- Подтверждено, что очереди сохраняют исходный payload и дедуплицируют по `eventId`.
- Спроектирован hybrid opt-in provider: legacy auth/URL остаются прежними, только test-attempt write идёт в ASP.NET; Bearer session лениво получается по student code и кэшируется в памяти отдельно для каждого кода.
- Реализованы mapper, authenticated submit, session refresh и keepalive exit-send.
- Точечно дополнены только три нужные EGA/6 страницы: `correct.html`,
  `mix.html` и `триг-уравнения-практика.html`; остальные интерактивы не менялись.
- Добавлены deterministic contract/retry/session tests и synthetic headless-browser smoke.
- `REVIEWER: UNAVAILABLE_IN_RUNTIME`: отдельный reviewer/subagent в текущем runtime
  отсутствует, поэтому выполнен свежий review-pass оркестратором после deterministic
  verification. Блокирующих code-level дефектов не найдено; добавлены regression
  tests для expiry/401 refresh, а cutover edge cases вынесены в документацию.

## Чек-лист выполнения

- [x] Подтвердить фактические legacy payload aliases и retry/outbox semantics в shared runtime.
- [x] Подтвердить существующие JS tests/test runner и минимальный набор файлов для изменения.
- [x] Спроектировать единый compatibility mapper и session lifecycle без изменений отдельных страниц.
- [x] Добавить mapper legacy `submitTest` → `POST /api/v1/test-attempts`.
- [x] Добавить authenticated `submitResult` в `AspNetApiClient` с нормализованными ошибками.
- [x] Определить безопасное поведение `sendResultOnExit` с Bearer auth и keepalive без потери retry.
- [x] Подключить opt-in ASP.NET browser provider, оставив legacy default.
- [x] Добавить deterministic tests для mapping, auth, duplicate/conflict, timeout/network и retry.
- [x] Проверить offline/reload/replay semantics с неизменным `eventId` и completion timestamp.
- [x] Выполнить browser/behavior verification без production write.
- [x] Выполнить независимый review и устранить найденные дефекты.
- [x] Обновить архитектурную документацию и task memory.
- [x] Прогнать итоговые checks, поставить `Status: DONE`, закоммитить и отправить в `main`.

Чек-лист обновляется только после фактического завершения и проверки соответствующего
пункта; промежуточные состояния фиксируются в task memory.

## Текущий шаг

Задача завершена: opt-in browser bridge готов и проверен, default provider остаётся
legacy, временный validation workflow удалён из итогового дерева.

## Следующий шаг

Отдельная задача production cutover: выбрать реальный `baseUrl/workspace`,
разобрать legacy pending queues/zero-progress policy и только после этого
ограниченно включать ASP.NET writer.

## Проверка

- Исходный backend write slice: 40/40 real PostgreSQL tests.
- Production provider на момент старта остаётся `LegacyApiClient`.
- Production import/write и реальные student data в рамках задачи запрещены.
- Shared browser `node:test`: 41/41 после payload compatibility fixes и review regressions.
- Headless Chrome smoke: PASS; ES modules загрузились, lazy Bearer exchange и
  `POST /api/v1/test-attempts` contract отработали на synthetic fetch, default
  `platformApi` остался legacy.
- Expired session: exit-send не отправляет без usable Bearer; обычный submit
  выполняет новый student-session exchange.
- Attempt `401`: bearer cache очищается, следующий retry получает новую session.
- Offline/reload retry: очередь повторяет идентичные `eventId` и исторический
  `CompletedAt`.
- Backend не менялся; предыдущий real PostgreSQL runner остаётся 40/40.

## Открытые вопросы и риски

- Default provider намеренно остаётся legacy; фактический production cutover и
  настройка реального ASP.NET `baseUrl/workspace` — отдельная задача.
- Bearer session хранится только в памяти. После reload outbox повторно обменивает
  student code на новую короткоживущую session перед доставкой; токен в storage не
  сохраняется.
- Exit-send ASP.NET выполняется только при уже живой session; иначе payload остаётся
  в outbox до обычного flush, что предотвращает unauthenticated beacon write.

## Последнее обновление

2026-10-06 — browser-client slice завершён: shared `node:test` 41/41,
headless Chrome smoke PASS, review fallback выполнен, документация обновлена,
default provider остаётся legacy; production cutover не выполнялся.
