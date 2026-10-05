# Фундамент платформы ASP.NET Core и PostgreSQL

## Статус и границы этапа

Создан изолированный вертикальный срез будущей платформы. Он не заменяет
Google Apps Script и Firebase в существующих страницах, не импортирует
production-данные и не меняет HTML/CSS/UI. Новый browser-клиент добавлен как
отключённый по умолчанию provider. Запись попыток реализована и протестирована
на уровне API; browser provider и production-трафик остаются на legacy-пути.

В этом этапе реализованы три границы модульного монолита:

- **Identity/Access**: workspace, учитель и членство учителя в workspace;
- **Students**: ученик, принадлежащая workspace учебная программа и членство
  ученика в workspace/программе.
- **Test attempts**: неизменяемая история попыток с проверкой актуального
  членства и идемпотентностью по событию.

PostgreSQL хранит внутренние UUID. Внешний стабильный код программы (например,
`EGE_MATH`) отделён от UUID и принадлежит конкретному workspace. Составной
foreign key `(WorkspaceId, ProgramId)` не позволяет связать ученика с программой
другого workspace.

## Первый API-контракт

`POST /api/v1/student-sessions`

Запрос:

```json
{
  "workspace": "school-slug",
  "code": "STUDENT-CODE"
}
```

Код передаётся только в JSON body. При успехе API возвращает краткоживущий
Bearer JWT и данные ученика, совместимые с новым `AspNetApiClient`. Token содержит
ограничивающие claims ученика, workspace, членства и роли `student`.

Неверный workspace, код, неактивный workspace, membership, программа или ученик
дают один и тот же ответ `401 application/problem+json`. Endpoint имеет
фиксированное ограничение частоты запросов по адресу клиента; превышение даёт
`429`.

## Работа с кодом ученика и секретами

- Код нормализуется на сервере и никогда не хранится открытым.
- В PostgreSQL сохраняется только HMAC-SHA256 от `workspace + code`.
- Pepper и ключ подписи JWT — разные base64-секреты не короче 32 байт.
- Схема БД проверяет длину HMAC и целостность импортной пары идентификаторов.
- Приложение завершается при отсутствующих, слабых или placeholder-секретах.
- `.env` игнорируется Git; `.env.example` содержит только явные заглушки.
- PostgreSQL не публикует порт на host/LAN. API и pgAdmin привязаны к
  `127.0.0.1`.

## Запуск и проверка

Host .NET SDK не требуется: build, migration и integration tests выполняются в
контейнерах. Точные команды находятся в `platform/README.md`.

Порядок локального запуска:

1. Скопировать `.env.example` в игнорируемый `.env`.
2. Заменить все `REPLACE_*` и независимо создать JWT key и student-code pepper.
3. Выполнить `docker compose up --build -d db migrate api`.
4. Проверить `/health/live`, `/health/ready` и безопасный запрос с несуществующим
   кодом, который должен вернуть общий `401`.

Compose запускает миграции отдельным one-shot сервисом до старта API. Автосида
нет. Таблица EF migration history явно закреплена в схеме `public`, поэтому
повторный запуск остаётся идемпотентным даже когда имя DB-пользователя совпадает
с прикладной схемой `platform`. pgAdmin включается только профилем `tools`.

## Browser integration

`shared/interactive/v1/aspnet-api-client.js` теперь инкапсулирует не только
обмен кода на session, но и browser write-path для test attempts. Единый mapper
принимает фактические legacy aliases (`correctCount`/`score`,
`totalCount`/`maxScore`, `durationSeconds`/`durationSec`,
`topicName`/`topicId`), пересчитывает процент по серверному floor-правилу и
не переносит student identity/program fields в ASP.NET request body.

Исторический момент завершения берётся из `finishedAt` раньше любых delivery
timestamps. Если legacy `startedAt` не соответствует активной длительности,
mapper восстанавливает его как `completedAt - durationSeconds`; поэтому offline
retry не сдвигает попытку в месяц фактической доставки.

Bearer session получается лениво по коду конкретного ученика и хранится только
в памяти, отдельно для каждого student code. Это позволяет teacher-side backup
отправлять результаты двух учеников с разными токенами. После reload токен не
восстанавливается из storage: outbox сохраняет исходный payload, а очередной
обычный flush получает новую session и повторяет тот же `eventId`.

Для exit-send ASP.NET не использует `sendBeacon`, так как у него нельзя задать
`Authorization`. При уже живой session используется authenticated
`fetch(..., { keepalive: true })`; без session запись остаётся в outbox.

`createAspNetTestAttemptApi()` и `createAspNetTestAttemptDataProvider()`
являются явным opt-in. Они оставляют legacy URL, teacher verification и текущую
JSONP student validation, переключая только test-attempt writes. Экспортируемый
`platformApi` по-прежнему legacy, поэтому публичные URL и production traffic
не переключены.

Перед отдельным production cutover нужно решить два compatibility edge case:
старые queued payload до этого среза могут не содержать `studentCode`, а
нулевой прогресс не может быть записан как test attempt, потому что серверный
контракт требует `total >= 1`. Эти случаи нельзя маскировать под синтетическую
успешную попытку.

Проверка browser bridge: shared `node:test` — 41/41, synthetic headless Chrome
smoke — PASS. В browser smoke подтверждены загрузка ES modules, lazy Bearer
exchange, canonical test-attempt request и сохранение legacy provider как default.

## Срез записи попыток

`POST /api/v1/test-attempts` требует Bearer JWT студента. JWT содержит `sub`,
`workspace_id` и `membership_id`; `program_id` в JWT нет. Перед каждой записью
сервер повторно загружает активное членство и проверяет активность workspace,
ученика и программы. Программа определяется через текущее членство, а
идентификаторы ученика и программы от клиента не принимаются.

Попытки сохраняются как неизменяемые исторические строки. Ограничения БД
проверяют обязательные строки, диапазоны счёта, целочисленный floor процента,
временные метки и длительность, а также формат ключа месяца и его точное
соответствие `CompletedAt` в `Europe/Moscow`. Внешние ключи
связывают попытку с workspace, составным ключом членства `(WorkspaceId,
MembershipId, StudentId)` и программой `(WorkspaceId, ProgramId)`; удаления
связанных записей ограничены. Уникальный индекс `(WorkspaceId, EventId)` даёт
идемпотентность. При гонке проигравшая запись очищает tracker, читает победителя
и возвращает replay как `200`, если содержимое эквивалентно, иначе `409`.

Месяц вычисляется из `CompletedAt` в `Europe/Moscow`. `monthlyBest` ограничен
workspace, membership, test и месяцем; порядок — процент по убыванию, длительность,
время завершения и UUID по возрастанию. Это не смешивает результаты разных
учеников, тестов, workspace или календарных месяцев.

Проверка среза: `TestAttemptTests` — 20/20, весь API suite — 27/27, combined API
и importer runner — 40/40 (2026-10-06). Это подтверждает API и интеграцию с
PostgreSQL; production-данные не переносились. Browser provider и production
traffic по-прежнему используют legacy-путь. Переход production и импорт остаются
отдельной будущей работой.
