# Общий клиентский слой интерактивов

## Назначение

Сетевые и сервисные исправления интерактивов должны выполняться в общем
версионированном пакете, а содержание задания оставаться в его HTML.

## Текущая архитектура

Каноническая реализация находится в `shared/interactive/v1/` и не импортирует
код из `EGA/` или `OGA/`. Её можно подключать из EGA, OGA и новых
интерактивов одним из трёх публичных entry points. Внутренние transport/runtime
модули остаются деталями пакета; несовместимые схемы штрихов, курсоров,
presence и игровых событий передаются им как настройки и codecs.

Все 10 realtime-страниц задания №6 продолжают использовать прежние URL
модулей. Файлы `EGA/6/shared/v1/*.js` и `EGA/6/realtime-lifecycle.js` теперь
являются тонкими re-export-совместимостями и ведут к той же канонической
реализации, поэтому второй копии состояния или логики нет. Публичные URL,
игровые правила и Firebase namespaces не менялись.

`dz1.html`–`dz3.html` используют общий модуль авторизации, GAS transport и
очереди результатов. Содержание домашних работ, payload, draft/localStorage
ключи, provisional login, retry и pagehide-семантика остаются постраничными.

Публичная поверхность для новых и постепенно мигрируемых интерактивов состоит
из трёх файлов в `shared/interactive/v1/`:

- `platform-data.js` — API/auth/identity/result queues; браузер не обращается
  напрямую к будущей PostgreSQL.
- `platform-realtime.js` — provider-neutral realtime contract с относительными
  путями, транзакциями, подписками, presence, drawing, board и cursor.
- `interactive-runtime.js` — единственная точка композиции для HTML-страницы.

`найди ошибку-1.html` и `найди ошибку-2.html` — первый pair-пилот этого API:
каждая страница имеет один shared-import и не вызывает Firebase SDK напрямую.
Их старый относительный import сохранён и разрешается через совместимый shim.

## Принятые решения и границы

- `platform-api.js` — точка выбора серверного API. Сейчас она использует
  `legacy-api-client.js` с действующим Google Apps Script для проверки
  ученика и записи результата. При переходе к ASP.NET Core контракт API
  меняется здесь; прямого доступа браузера к PostgreSQL нет.
- `realtime-lifecycle.js` и `firebase-transport.js` — подключение, операции и подписки RTDB относительно текущего
  занятия. `session-runtime.js` и `realtime-session-adapter.js` управляют
  подписками и восстановлением присутствия после переподключения.
- Для локальной проверки новый пакет принимает
  `globalThis.__INTERACTIVE_RTDB_EMULATOR__`; прежний
  `globalThis.__EGA6_RTDB_EMULATOR__` сохранён как совместимый fallback.
- `platform-realtime.js` определяет контракт provider/transport. Текущий
  `firebaseRealtimeProvider` реализует его через `firebase-transport.js`;
  будущий `SignalRProvider` должен сохранить относительные операции, snapshot и
  transaction contract, поэтому игровым страницам не требуется смена API.
- `identity-store.js` сохраняет прежние ключи и поддерживает постраничные
  codecs. `realtime-auth.js` унифицирует безопасный JSONP lifecycle.
- `realtime-result-queue.js` поддерживает как вложенную очередь
  `{payload, playerKey}`, так и плоскую legacy-очередь `correct.html`;
  формирование payload остаётся у конкретной игры.
- `drawing-transport.js`, `shared-board.js` и `teacher-cursor.js` принимают
  настраиваемые пути, anchors и codecs, сохраняя разные realtime-контракты.
- `homework-transport.js` содержит общий GAS URL, auth/API и адаптеры двух
  legacy-форматов очереди домашних работ: object для `dz1` и array для
  `dz2`/`dz3`.

## Важные инварианты

- Firebase остаётся realtime-транспортом, Google Apps Script — действующим
  API результатов и проверки кода. UI, содержание задач и GAS не меняются.
- Завершающая транзакция игры в пилоте использует `applyLocally:false`:
  отправка результата начинается после подтверждения `finished` сервером,
  чтобы запись `submissions` не прервала локальную транзакцию.
- При высокой задержке кнопка «Далее» ждёт ответ RTDB; это сознательный
  компромисс для корректного завершения игры.
- Несовместимое изменение контрактов общих модулей требует новой версии пути.
- Новый интерактив должен импортировать публичный entry point непосредственно
  из `shared/interactive/v1/`; старые пути `EGA/6` предназначены только для
  обратной совместимости.

## Проверено

2026-10-05: общий rollout — 15/15 тестов и загрузка всех 10 realtime-страниц.
Публичный фасад — 21/21 тест, две страницы HTTP 200 без `pageerror`; на локальном
RTDB в двух Chromium contexts проверены teacher/student join, JSONP identity,
presence, cursor, stroke, игровая транзакция и offline/reconnect. Production
RTDB/GAS заблокированы в браузерных тестах.

2026-10-05: после переноса канонической реализации в репозиторный пакет прошли
24/24 модульных теста, включая проверку всех старых re-export-путей и отсутствия
обратных импортов из общего пакета в `EGA/` или `OGA/`.

## Связанная задача

`.ai/tasks/shared-ega6-rollout.md`, `.ai/tasks/ega6-public-runtime-facade.md`,
`.ai/tasks/shared-interactive-package.md`.
