# Browser-client срез отправки результатов тестов

Status: IN_PROGRESS

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
- `shared/interactive/v1/aspnet-api-client.js` сейчас реализует только
  `validateStudentCode()` и session normalization.
- `shared/interactive/v1/platform-api.js` по-прежнему создаёт
  `LegacyApiClient`; production traffic остаётся на Apps Script.
- `createPlatformData()` уже делегирует `submitResult`, `sendResultOnExit` и
  result queues через provider/API boundary, поэтому предпочтителен shared adapter,
  а не изменения каждой страницы.
- Точный legacy payload и retry semantics ещё нужно подтвердить по shared queues
  и их тестам до выбора mapper contract.
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

## Чек-лист выполнения

- [x] Подтвердить фактические legacy payload aliases и retry/outbox semantics в shared runtime.
- [ ] Подтвердить существующие JS tests/test runner и минимальный набор файлов для изменения.
- [x] Спроектировать единый compatibility mapper и session lifecycle без изменений отдельных страниц.
- [ ] Добавить mapper legacy `submitTest` → `POST /api/v1/test-attempts`.
- [ ] Добавить authenticated `submitResult` в `AspNetApiClient` с нормализованными ошибками.
- [ ] Определить безопасное поведение `sendResultOnExit` с Bearer auth и keepalive без потери retry.
- [ ] Подключить opt-in ASP.NET browser provider, оставив legacy default.
- [ ] Добавить deterministic tests для mapping, auth, duplicate/conflict, timeout/network и retry.
- [ ] Проверить offline/reload/replay semantics с неизменным `eventId` и completion timestamp.
- [ ] Выполнить browser/behavior verification без production write.
- [ ] Выполнить независимый review и устранить найденные дефекты.
- [ ] Обновить архитектурную документацию и task memory.
- [ ] Прогнать итоговые checks, поставить `Status: DONE`, закоммитить и отправить в `main`.

Чек-лист обновляется только после фактического завершения и проверки соответствующего
пункта; промежуточные состояния фиксируются в task memory.

## Текущий шаг

Реализация shared mapper/client и opt-in data provider.

## Следующий шаг

Прогнать существующие `node:test` suites, затем точечно дополнить payload builders,
которым не хватает данных для строгого ASP.NET contract.

## Проверка

- Исходный backend write slice: 40/40 real PostgreSQL tests.
- Production provider на момент старта остаётся `LegacyApiClient`.
- Production import/write и реальные student data в рамках задачи запрещены.

## Открытые вопросы и риски

- Нужно подтвердить, какие aliases реально присутствуют в shared/legacy payload:
  `score`/`percent`, `correctCount`/`correct`,
  `durationSec`/`durationSeconds` и timestamp variants.
- `sendBeacon` не позволяет выставить Bearer Authorization header; нельзя
  механически перенести legacy exit-send без решения по keepalive/outbox.
- Нужно проверить, где и как browser session/JWT живёт во время повторной доставки,
  особенно после reload/expiration.
- Нельзя допустить, чтобы retry создавал новый `eventId` или заменял исторический
  `CompletedAt` текущим временем доставки.

## Последнее обновление

2026-10-06 — research завершён; подготовлен shared mapper/session/provider слой,
перед push выполнены локальные syntax checks и 5/5 prototype unit tests.
