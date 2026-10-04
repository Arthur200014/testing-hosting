# Общий клиентский слой EGA/6

## Назначение

Сетевые и сервисные исправления пилотных интерактивов должны выполняться в
общих модулях, а содержание задания оставаться в его HTML.

## Текущая архитектура

К `EGA/6/shared/v1/` подключены все 10 realtime-страниц задания №6. Их
публичные URL, игровые правила и Firebase namespaces не менялись. Общие
операции вынесены в transport/runtime-модули, а несовместимые схемы штрихов,
курсоров, presence и игровых событий передаются им как настройки и codecs.

`dz1.html`–`dz3.html` используют общий модуль авторизации, GAS transport и
очереди результатов. Содержание домашних работ, payload, draft/localStorage
ключи, provisional login, retry и pagehide-семантика остаются постраничными.

Публичная поверхность для новых и постепенно мигрируемых интерактивов состоит
из трёх файлов:

- `platform-data.js` — API/auth/identity/result queues; браузер не обращается
  напрямую к будущей PostgreSQL.
- `platform-realtime.js` — provider-neutral realtime contract с относительными
  путями, транзакциями, подписками, presence, drawing, board и cursor.
- `interactive-runtime.js` — единственная точка композиции для HTML-страницы.

`найди ошибку-1.html` и `найди ошибку-2.html` — первый pair-пилот этого API:
каждая страница имеет один shared-import и не вызывает Firebase SDK напрямую.

## Принятые решения и границы

- `platform-api.js` — точка выбора серверного API. Сейчас она использует
  `legacy-api-client.js` с действующим Google Apps Script для проверки
  ученика и записи результата. При переходе к ASP.NET Core контракт API
  меняется здесь; прямого доступа браузера к PostgreSQL нет.
- `firebase-transport.js` — операции и подписки RTDB относительно текущего
  занятия. `session-runtime.js` и `realtime-session-adapter.js` управляют
  подписками и восстановлением присутствия после переподключения.
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

## Проверено

2026-10-05: общий rollout — 15/15 тестов и загрузка всех 10 realtime-страниц.
Публичный фасад — 21/21 тест, две страницы HTTP 200 без `pageerror`; на локальном
RTDB в двух Chromium contexts проверены teacher/student join, JSONP identity,
presence, cursor, stroke, игровая транзакция и offline/reconnect. Production
RTDB/GAS заблокированы в браузерных тестах.

## Связанная задача

`.ai/tasks/shared-ega6-rollout.md`, `.ai/tasks/ega6-public-runtime-facade.md`.
