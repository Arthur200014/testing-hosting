# Публичный runtime-фасад EGA/6

Status: DONE

## Цель

Скрыть внутренние модули auth/results/Firebase/session/drawing за 2–3 публичными
точками входа, чтобы новый интерактив подключал один `interactive-runtime.js`,
а смена GAS на ASP.NET API и Firebase на SignalR выполнялась централизованно.

## Область работы

- `EGA/6/shared/v1/platform-data.js` — публичный data/API фасад.
- `EGA/6/shared/v1/platform-realtime.js` — публичный realtime фасад.
- `EGA/6/shared/v1/interactive-runtime.js` — композиция обоих фасадов.
- Перевод `найди ошибку-1.html` и `найди ошибку-2.html` на одну общую точку
  импорта как репрезентативной пары.
- Модульные и локальные браузерные проверки, документация архитектуры.

## Вне области работы

Миграция остальных страниц, изменение UI/контента/URL, Firebase/GAS, создание
ASP.NET Core/PostgreSQL/SignalR, изменение схем payload и localStorage.

## Текущее состояние

В `shared/v1` есть три публичные точки входа: data, realtime и композиционный
runtime. Пара `найди ошибку-1/2` импортирует только `interactive-runtime.js` и
не содержит прямых Firebase SDK-вызовов; все операции идут по относительным
путям через provider-neutral transport.

## Принятые решения

- Малые модули остаются внутренними и тестируемыми; сокращается публичная
  поверхность, а не физически сливается весь код в большой файл.
- Браузерный data-слой обращается к API, а не напрямую к будущей PostgreSQL.
- Realtime provider остаётся Firebase; фасад должен допускать будущий SignalR.
- Jev: `HIGH`; implementer — GPT-5.6 Sol medium, tester/reviewer — Luna medium,
  максимум два worker. Terra недоступна launcher этой сессии.
- После остановки GPT-5.6 Sol по usage limit завершение реализации выполнено
  через предусмотренный fallback Luna medium.

## Связанные файлы

`EGA/6/shared/v1/`, `EGA/6/realtime-lifecycle.js`,
`EGA/6/найди ошибку-1.html`, `EGA/6/найди ошибку-2.html`,
`docs/architecture/ega6-shared-runtime.md`.

## Выполнено

- Подтверждён текущий набор прямых импортов и границы pair-пилота.
- Выполнен обязательный Jev-routing через Polza/TypeSafe SDK.
- Добавлены `platform-data.js`, `platform-realtime.js` и
  `interactive-runtime.js`; внутренние модули остались отдельными.
- Data-фасад объединяет API, JSONP auth, identity и legacy-очереди результатов.
- Realtime-фасад задаёт provider-контракт для lifecycle, относительных операций,
  value/child subscriptions, presence, drawing, board, cursor и dispose.
- Пара `найди ошибку-1/2` переведена на один shared-import без изменения UI,
  контента, URL, Firebase paths, identity и result payload.
- Первое ревью выявило прямые Firebase-вызовы; они удалены, повторное ревью
  подтвердило устранение blocker без новых high-замечаний.

## Текущий шаг

Реализация и проверки завершены.

## Следующий шаг

Последовательно переводить остальные семейства интерактивов на публичный runtime,
не меняя их content callbacks и транспортные контракты.

## Проверка

21/21 Node tests; syntax и `git diff --check` проходят. Обе страницы: HTTP 200,
module-ready, без `pageerror` и production Firebase/GAS. В двух клиентах на
локальном RTDB проверены teacher/student join, JSONP identity, presence,
teacher cursor, stroke, игровая транзакция и восстановление после offline.
Повторное независимое ревью: blocker/high замечаний нет.

## Открытые вопросы и риски

- Полный finish из 15 заданий и фактическое заполнение result queue не выполнялись
  в browser-smoke; вложенный формат `{payload, playerKey}` покрыт unit-тестами и
  сохранён в конфигурации pair-пилота.
- Страницы пока передают `firebaseConfig` как вход default provider; будущий
  SignalR provider может игнорировать этот параметр, а затем конфигурацию можно
  централизовать при пакетной миграции.

## Последнее обновление

2026-10-05: публичный runtime-фасад и pair-пилот завершены и проверены.
