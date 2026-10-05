# Аудит перехода с Google Apps Script и Sheets на PostgreSQL

Дата аудита: 2026-10-05
Статус: первый read-only этап завершён

## 1. Источники и границы

Проверены:

- переданный пользователем актуальный Google Apps Script: 5 181 строка,
  177 876 байт;
- переданная Google Sheets: read-only CSV export активной вкладки и XLSX export
  всей книги;
- клиентские контракты `shared/interactive/v1/` и связанные формы `EGA/6`.

В репозиторий не копировались Apps Script, строки таблицы, имена учеников,
ученические коды или другие персональные значения. Таблица и скрипт не
изменялись.

Обычный экспорт таблицы доступен без записи: активная вкладка вернула HTTP 200,
XLSX всей книги также вернул HTTP 200. REST Google Sheets metadata API вернул
`403 PERMISSION_DENIED` для незарегистрированного клиента. Поэтому названия и
заголовки 20 вкладок подтверждены экспортом, но GID всех вкладок, кроме
предоставленного `504334837`, не угадывались.

## 2. Краткий вывод

Текущую систему нельзя безопасно заменить простой сменой URL с Apps Script на
PostgreSQL. Нужна граница `браузер → ASP.NET Core API → PostgreSQL` с
серверной авторизацией, идемпотентными командами и явной схемой.

Основные причины:

1. Ученический код сейчас фактически является bearer-доступом и передаётся в
   GET/JSONP URL.
2. Несколько преподавательских чтений и записей не имеют серверной проверки
   роли. В частности, публичны получение полного пакета преподавателя,
   создание ученика, запись занятия, назначение ДЗ и изменение абонемента.
3. Защищённые операции пробников используют общий статический admin credential,
   зашитый в Apps Script и сравниваемый напрямую без подтверждённого rate limit.
4. Текущая «проверка преподавателя» в browser-клиенте сравнивает введённый код
   с поставляемым клиенту hash. Это UI-gate, а не серверная идентификация.
5. Семь изменяющих операций доступны через GET/JSONP.
6. Не все записи идемпотентны; составная операция «занятие + ДЗ» не атомарна.
7. Часть обработчиков ориентируется на заголовки, а часть — на фиксированные
   позиции колонок.
8. Некоторые результаты вычисляются клиентом и на сервере проверяются только
   по диапазону.

Firebase не участвует в постоянном хранении этих данных и пока остаётся
отдельным realtime-транспортом.

## 3. Текущий поток данных

```text
HTML-интерактив / форма
  ├─ validateStudent: GET + JSONP
  ├─ submitTest / submitHomework: POST text/plain JSON
  ├─ teacher/admin actions: GET или POST
  └─ локальные очереди повторной отправки
          ↓
Google Apps Script doGet/doPost
  ├─ ScriptLock
  ├─ CacheService
  ├─ ScriptProperties
  ├─ time triggers
  └─ чтение/запись Google Sheets
```

Общий клиент уже имеет подходящую точку замены:

- `platform-api.js` выбирает API-провайдер;
- `legacy-api-client.js` содержит текущий Apps Script transport;
- `platform-data.js` отдаёт страницам API/auth/result boundary;
- очереди результатов сохраняют payload до подтверждения сервера.

Следовательно, новый ASP.NET provider можно подключить в одном месте, не
переписывая каждую форму одновременно.

## 4. Фактический API Apps Script

### Вход и ошибки

`doGet` расположен в строках 42–136 переданного скрипта, `doPost` и dispatcher —
в строках 139–180.

- GET выбирает действие через `action`.
- POST читает JSON body либо параметры формы.
- Ответ всегда формируется как JSON или JSONP.
- Ошибка возвращается как `{ok:false,error}`, но отдельный HTTP status код не
  устанавливается. Клиент не может полагаться на 4xx/5xx.
- Текст публичной ошибки ограничивается 300 символами.
- Неизвестный GET возвращает health/capabilities; неизвестный POST завершается
  логической ошибкой.

### Матрица действий

| Действие | Назначение | Основные чтения | Основные записи | Текущая проверка / повтор |
| --- | --- | --- | --- | --- |
| `validateStudent` | Проверка ученика | Ученики/cache | — | Код или ID служит доступом; cache 6 часов |
| `getActiveMockVariantV2` | Активный пробник | Пробник_Конфигурации, properties | — | Публичное чтение |
| `listMockVariantsV2` | Список вариантов | Пробник_Конфигурации | — | Статический общий admin credential |
| `getMockVariantV2` | Вариант пробника | Пробник_Конфигурации | — | Статический общий admin credential |
| `listPendingMockReviews` | Проверка второй части | Пробники, Ученики/cache | — | Статический общий admin credential |
| `checkHomeworkSubmission` | Статус сдачи | Ученики/cache, ДЗ_Назначения | — | Код/ID ученика |
| `listStudentGroups` | Группы | Ученики | Возможна нормализация листа | Публичное чтение |
| `getTeacherFormData` | Полный teacher package | Ученики, результаты, ДЗ, занятия, темы, абонементы | Cache/version | Серверной teacher-auth нет |
| `getTeacherDataVersion` | Версия teacher cache | properties | Может создать версию | Публично |
| `getMonthlyReport` | Месячный отчёт | Ученики, тесты, ДЗ, пробники, занятия, темы | — | Код/ID ученика |
| `startMockSession` | Старт/возобновление пробника | Ученики, сессии, варианты | Пробник_Сессии | Ученик; `forceNew` разрешает новую сессию |
| `saveMockDraft` | Черновик пробника | Ученики, сессия, вариант | Пробник_Сессии | Student ID + session ID |
| `submitMock` | Завершение серверной сессии | Ученики, сессия, вариант | Пробники, задания, сессия | Стабильный event ID дедуплицируется |
| `submitAssignedMock`, `submitMock2027` | Внешний результат пробника | Ученики, Пробники | Пробники | Event ID дедуплицируется; итог присылает клиент |
| `finalizeMockReview` | Ручная проверка | Пробники | Пробники, Пробник_Задания | Статический admin credential; повтор распознаётся |
| `saveMockVariantV2` | Сохранение варианта | Пробник_Конфигурации | Пробник_Конфигурации | Статический admin credential; upsert по ID |
| `setActiveMockVariantV2` | Выбор варианта | Пробник_Конфигурации | properties | Статический admin credential |
| `deleteMockVariantV2` | Удаление варианта | Пробник_Конфигурации | Конфигурации, properties | Статический admin credential; повтор даёт ошибку |
| `submitTest` | Результат теста/игры | Ученики, Тесты | Тесты | Event ID + monthly-best |
| `submitHomework` | Результат ДЗ | Ученики, ДЗ_Назначения | ДЗ_Назначения | Event ID не является ключом дедупликации |
| `createStudent` | Создание ученика | Ученики, иногда Пробники | Ученики, иногда Пробники | Серверной teacher-auth и request ID нет |
| `saveLesson` | Запись занятия | Ученики | Занятия | Серверной teacher-auth и request ID нет |
| `saveLessonAndHomework` | Урок и назначения | Ученики, занятия, каталог | Занятия, ДЗ_Назначения | Не атомарно, request ID нет |
| `saveSubscription` | Абонемент | Ученики, Абонементы | Абонементы | Публичный upsert по ученику |
| `assignHomework` | Назначение ДЗ | Каталог, Ученики, назначения | ДЗ_Назначения | Серверной teacher-auth и request ID нет |
| `submitQuestionnaire` | Анкета | — | Анкеты_учеников | Новый submission ID при каждом вызове |
| `spinQuestionnaireRoulette` | Рулетка анкеты | Анкеты_учеников | Анкеты_учеников | Ticket делает повтор идемпотентным |

GET/JSONP выполняет не только чтение, но и `startMockSession`, `saveMockDraft`,
`submitMock`, `submitAssignedMock`, `submitMock2027`, `submitQuestionnaire` и
`spinQuestionnaireRoulette` (строки 76–89). В новом API изменения должны быть
только POST/PUT/PATCH/DELETE с авторизацией и idempotency key.

## 5. Фактическая структура Google Sheets

Числа ниже — непустые записи, полученные при read-only экспорте; значения строк
не сохранялись и не публикуются.

| Вкладка | Записей | Колонок | Подтверждённые заголовки / назначение |
| --- | ---: | ---: | --- |
| Ученики | 22 | 12 | `studentId`, `studentName`, `grade`, `groupId`, `targetScore`, `active`, `createdAt`, `inviteCode`, `notes`, `parentName`, `programId`, `targetGrade` |
| Абонементы | 18 | 8 | ученик, размер пакета, reset/update, программа, цена, базовый счётчик |
| Тесты | 218 | 16 | event/student/test/date/topic/task, correct/total/percent, timestamps, duration, schema, program |
| Пробники | 34 | 14 | event/student/mock/date/variant, scores, duration, timestamp, schema/program/grade/max/percent |
| Пробник_Сессии | 12 | 18 | session/student/mock, start/deadline, answers JSON, status/result, config snapshot, program and grading |
| Пробник_Конфигурации | 3 | 8 | mock/variant/duration/task count/config JSON/created/schema/program |
| Пробник_Задания | 136 | 14 | event/student/mock/date/task/topic, correct/answered, submitted/schema/program, points |
| ДЗ_Каталог | 48 | 8 | homework/task/name/URL/active/order/created/program |
| ДЗ_Назначения | 77 | 16 | assignment/student/homework/task/name/URL, assigned/deadline/submitted, status/score/event/lesson/schema/program |
| Занятия | 87 | 10 | lesson/student/name/date/duration/tasks/comment/attendance/created/program |
| Справочник тем | 44 | 5 | task/topic ID/name/active/program |
| Анкеты_учеников | 37 | 50 | submission/date/program/form, ответы анкеты, task1–task19, расчёты, roulette fields, raw JSON |
| Инструкция API | 47 | 4 | документирующая вкладка: раздел, поле/правило, обязательность, описание |
| Архив · Настройки | 15 | 3 | key/label/value |
| Архив · Освоение | 19 | 6 | number/name/test average/homework average/mastery/status |
| Архив · Тесты | 12 | 5 | date/topic/task/score/time |
| Архив · Пробники | 4 | 2 | date/score |
| Архив · Точки роста | 6 | 6 | topic/task/test average/homework average/mastery/deficit |
| Архив · ДЗ | 10 | 6 | assigned/submitted/topic/tasks/status/quality |
| Архив · Инструкция | 8 | 1 | описание архива месячного отчёта ЕГЭ |

Активный предоставленный GID `504334837` подтверждён как
`ДЗ_Назначения`. Другие GID без зарегистрированного Sheets API клиента не
определялись.

## 6. Подтверждённые бизнес-правила

### Ученики и доступ

- Идентификатор/пригласительный код ученика используется для поиска и как
  фактический bearer-доступ.
- Кэш ученика живёт 6 часов и сбрасывается скриптом или `onEdit`.
- Клиенты сохраняют код/ID/имя в legacy localStorage keys; browser client ID —
  в sessionStorage.

### Тесты и игры

- Сервер сохраняет лучшую попытку по сочетанию ученик + test ID + календарный
  месяц.
- Выше процент имеет приоритет; при равенстве выигрывает меньшая длительность.
- Процент вычисляется клиентом и проверяется сервером по допустимому диапазону.
- `eventId` используется для дедупликации.

### Домашние задания

- Срок назначения ограничен вариантами 24/48/72 часа.
- Сдача ищет последнюю строку по ученику и точному homework ID, а не по
  `assignmentRecordId`.
- При повторном назначении того же ДЗ выбирается последняя запись.
- Просроченная сдача технически разрешена; timestamp определяет статус.
- Клиенты отправляют `assignmentId` и `eventId`, а лист хранит
  `assignmentRecordId`, `homeworkId` и `homeworkEventId`. Это явный mapping,
  который должен стать контрактом, а не неявной логикой.

### Пробники

- Серверная сессия хранит deadline, черновик ответов и снимок конфигурации.
- Базовый лимит — 60 минут; для ОГЭ есть отдельный лимит.
- `submitMock` оценивает ответы по сохранённой конфигурации и дедуплицируется
  event ID.
- Внешний assigned-mock маршрут принимает уже вычисленный клиентом итог.
- Вторая часть допускает ручную проверку с ограничениями конкретной программы.

### Занятия и абонементы

- Дата занятия берётся текущая; длительность нормализуется к 60/90/120 минутам.
- Нужны выбранные задания либо комментарий.
- `saveLessonAndHomework` делает несколько записей без общей транзакции.
- Пакет абонемента нормализуется к 4 или 8; посещённые занятия после reset date
  увеличивают счётчик, пропуски — нет.

### Отчёты

- Месячный отчёт реализован только для ЕГЭ.
- Отчётный цикл строится по 9 проведённым занятиям; пропуски влияют на календарь,
  но не входят в число проведённых.
- Период выбирается по cycle index, дате, текущему или последнему завершённому
  циклу.
- В коде есть fallback на `submissions`, но сборщик строк отчёта это поле не
  возвращает. Поведение fallback фактически недостижимо и требует решения до
  переноса.

## 7. Технические свойства и риски

- Основные мутации используют глобальный `ScriptLock` до 15 секунд; setup — до
  30 секунд. PostgreSQL должен заменить это транзакциями и ограничениями, а не
  глобальной блокировкой всего приложения.
- Минутный trigger завершает просроченные пробники; часовой обновляет статусы ДЗ.
- Teacher cache хранится до 6 часов и инвалидируется версией в
  ScriptProperties. `onEdit` не включает лист конфигураций пробников, поэтому
  ручная правка может временно оставить устаревший cache.
- Общий admin credential для управления пробниками хранится непосредственно в
  исходнике Apps Script и сравнивается напрямую. Поскольку web app публично
  вызываем и rate limit на этих проверках не подтверждён, credential нельзя
  переносить или продолжать использовать после production cutover: его нужно
  отозвать и заменить серверной teacher/admin identity.
- Hash teacher-кода поставляется в browser module, а сравнение выполняется
  локально. Его можно извлечь и подбирать offline; это только legacy UI-gate,
  не доказательство личности и не основа для выдачи API token.
- Скрипт форматирует даты в `Europe/Moscow`. В PostgreSQL время следует хранить
  как UTC, а локальную дату занятия/отчёта вычислять с явной зоной.
- `ensureHeaderColumns_` дописывает заголовки справа, но не проверяет порядок
  базовых колонок. Позиционные записи требуют отдельной сверки перед импортом.
- Setup не создаёт большинство обязательных листов: при их отсутствии runtime
  завершится ошибкой.
- Ошибки API сейчас логические, обычно при HTTP 200. Новый client provider должен
  на переходный период нормализовать как старый envelope, так и настоящие HTTP
  статусы нового API.

## 8. Клиентские контракты, которые нельзя сломать

- `validateStudent` вызывается JSONP с `code` и callback.
- `submitTest` содержит как минимум event/student/test/topic/task/percent/duration/
  schema/program; отдельные игры добавляют correct/total и временные поля.
- `submitHomework` содержит event/student/assignment/task/topic/percent/duration/
  schema; DZ1 хранит object queue, DZ2/DZ3 — array queue.
- Очереди могут повторно отправить тот же payload после перезапуска или выхода.
- Клиентские parsers принимают несколько legacy wrapper-форматов ответа.
- `sendBeacon` и keepalive используются при закрытии страницы.
- Существующая локальная `verifyTeacher` по browser hash не является auth
  contract нового API и не должна автоматически обмениваться на серверную
  сессию.

Первый ASP.NET provider должен сохранить эти наблюдаемые формы либо иметь один
центральный compatibility mapper. Страницы не должны знать структуру SQL.

## 9. Предварительная модель PostgreSQL

Это границы будущей схемы, а не финальные migrations:

- `workspaces`, `teacher_users`, роли и membership;
- `students`, `workspace_students`, legacy identifiers/invite-code hash;
- `programs`, `topics`;
- `test_attempts`; monthly best — запрос/view, а не уничтожение истории;
- `homework_catalog`, `homework_assignments`, `homework_submissions`;
- `lessons`, `lesson_participants`;
- `subscription_plans` или текущие условия абонемента и отдельный журнал
  изменений/списаний;
- `mock_variants`, `mock_variant_versions`, `mock_sessions`, `mock_results`,
  `mock_task_results`, `mock_reviews`;
- `questionnaire_submissions`, `roulette_draws`;
- `import_batches`, `legacy_source_records` или другой журнал соответствия для
  повторяемого импорта и сверки.

Обязательные ограничения:

- внутренние UUID, внешние ключи и tenant/workspace scope;
- уникальные event/session/submission/assignment IDs в нужном workspace;
- idempotency key для каждой изменяющей команды;
- UTC timestamps плюс явная зона бизнес-отчёта;
- check constraints для процентов, длительностей, статусов и программы;
- soft archive/audit для исправлений преподавателя вместо каскадного удаления
  учебной истории.

## 10. Безопасный порядок переноса

1. Поднять локально ASP.NET Core + PostgreSQL + pgAdmin через Docker Compose;
   секреты оставить вне Git.
2. Создать workspace/teacher/student identity model и migrations.
3. Заменить ученический GET/JSONP login на POST-обмен кода на короткоживущий
   ограниченный token. Для преподавателя ввести настоящую session/role auth с
   rate limit. Перед production cutover отозвать статический Apps Script admin
   credential и legacy teacher-код/hash; не принимать их как новую identity.
4. Реализовать read-only student validation/profile и центральный
   `AspNetApiClient`, сохранив `LegacyApiClient` как fallback.
5. Первым write-пилотом перенести `submitTest`: event ID, транзакция, полная
   история попыток и вычисляемый monthly best.
6. Затем перенести ДЗ, разделив assignment и submission и сохранив дедлайны.
7. Перенести teacher operations, занятия и абонементы только после server auth.
8. После этого переносить пробники, ручную проверку, анкеты и отчёты.
9. Для каждого сценария выполнить повторяемый import, сверку агрегатов и
   отдельное переключение единственного источника записи.
10. Google Sheets не отключать, пока выбранный сценарий не проверен и не имеет
    плана отката. Долговременную независимую двойную запись не использовать.

## 11. Следующий конкретный инкремент

Следующая задача должна создать только фундамент и вертикальный read-only slice:

1. Docker Compose: PostgreSQL, pgAdmin и ASP.NET Core API.
2. Solution модульного монолита с `Identity/Access` и `Students`.
3. Первые migrations: workspace, teacher user, student и membership/import
   mapping.
4. Secure student-code exchange endpoint с rate limit и короткоживущим token.
5. `AspNetApiClient` за существующим `platform-data` boundary, но без
   production-переключения.
6. Автоматические API/integration tests на правильный код, неверный код,
   изоляцию workspace, повторный запрос и отсутствие утечки данных.

После этого можно безопасно брать первый write slice `submitTest`.

## 12. Неизвестные и необходимые подтверждения

- Фактические deployment permissions Apps Script и список установленных triggers
  не видны из исходника.
- Для автоматического мигратора нужен зарегистрированный Google API client или
  read-only service identity; публичный export достаточен для аудита, но не для
  надёжного production import.
- Требуется согласовать окончательный способ входа преподавателя и срок жизни
  ученического token.
- Требуется решить: сохранять ли старое правило monthly-best как отображение или
  как отдельную материализованную проекцию.
- Требуется подтвердить корректную семантику повторного назначения одинакового
  ДЗ и недостижимого `submissions` fallback в отчёте.
- Перед production import нужны обезличенные проверки дублей, пустых ключей,
  orphan references, допустимых статусов и временных зон. Значения строк в Git
  для этого не требуются.
