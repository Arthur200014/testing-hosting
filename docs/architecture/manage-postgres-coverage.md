# M01-01 — карта перехода manage / Google Sheets → PostgreSQL

**Статус:** DONE (целевая сверка кода, 2026-11-11). **NOT_RUN:** свежий XLSX export, runtime, настоящий импорт и сервер. Не считать старые количества актуальными.

**Основания:** [действующая manage](../../EGA/config/manage.html), [аудит GAS и Sheets](./gas-postgres-migration-audit.md), [EF model](../../platform/src/Platform.Api/Persistence/PlatformDbContext.cs), [API Program.cs](../../platform/src/Platform.Api/Program.cs), [student importer](../../platform/src/Platform.StudentImport/), [homework importer](../../platform/src/Platform.HomeworkImport/), [source audit](../../.ai/tasks/homework-import-source-audit.md). Никаких реальных строк, ученических кодов и credentials в Git не перенесено.

## 1. Реальные запросы нынешней manage

Форма задаёт `API_URL = HOMEWORK_GAS_URL`, загрузка — JSONP, запись — `fetch` POST text/plain JSON. Обнаружены **ровно пять actions** самой формы (другие legacy actions GAS используются другими страницами или не вызываются в этой форме):

| Legacy action | Параметры | Ответ/эффект для manage | ASP.NET Core сейчас |
|---|---|---|---|
| `getTeacherFormData` (GET JSONP) | `forceRefresh` | `ok,version,students[],groups[],catalog[],statistics` (в т.ч. `currentMonth,subscriptionVersion,students[studentId]` с `summary,topics,tests,homework,mocks,lessons,subscription`) | **Нет teacher read API** |
| `getTeacherDataVersion` (GET JSONP) | — | `ok,version` для обновления кэша | **Нет** teacher-scoped версии/ETag |
| `createStudent` (POST) | `studentName,grade,groupId,programId,targetScore,targetGrade,initialScore,initialPrimaryScore,initialGrade,parentName,notes` | `studentId,inviteCode`, иногда начальная диагностика | **Нет** teacher create; есть только импорт студентов |
| `saveLessonAndHomework` (POST) | `programId,lessonAt,lessonDate,durationMinutes,taskNumbers,topicComment,studentStatuses[{studentId,status}],assignHomework,homeworkId` плюс параметры ДЗ | `lessonId,lessonCount,homeworkAssigned,homeworkCount,homeworkMessage` | **Нет** teacher lesson/assignment write |
| `saveSubscription` (POST) | `studentId,packageSize,lessonPrice,lessonCount,setCount,reset` | `ok`, обновление счётчика после повторной загрузки | **Нет** teacher subscription/ledger API |

**Форма не вызывает напрямую** `saveLesson` или `assignHomework`, хотя такие действия есть в GAS. Результаты `submitTest`, `submitHomework`, пробников возникают на других страницах и затем попадают в `statistics`.

**Контракт чтения:** `getTeacherFormData` возвращает полный пакет данных по всем ученикам, включая группы, каталог и `statistics.students[id]`. Достаточно одного tenant-scoped защищённого DTO/adapter для временного сохранения текущего UI; не требуется пересоздавать форму или новый frontend прямо сейчас.

## 2. Листы → PostgreSQL / API / импорт

Названия и числа ниже — **из прежнего read-only аудита**, не из нового живого Google Sheets. `EXISTS` = есть код/модель, **не означает импорт реальных записей**; `NEEDED` = нет модели, импорта или teacher endpoints.

| Вкладка (записей в раннем снимке) | Как используется / что сохранять | Состояние и действия |
|---|---|---|
| `Ученики` (22) | `students,groups`, профиль, program, приглашение | `Student` + `WorkspaceStudentMembership`, XLSX importer **EXISTS**. Профильные поля (grade/parent/targets/notes) пока не в полном импорте; M01-02/M03-01. Teacher create M04-03 **NEEDED** |
| `Абонементы` (18) | персональная цена, пакет, reset/счётчик, посещения | Plan/Subscription/Ledger **NEEDED**; M03-02, M04-02/03. Не терять history/reset |
| `Тесты` (218) | `statistics.tests`, лучшие попытки | `TestAttempt` + student write **EXISTS**; historical importer и teacher read **NEEDED**, M03-03/M04-02 |
| `Пробники` (34) | `statistics.mocks`, баллы/проверка | MockResult/Review/history **NEEDED**, M03-03 |
| `Пробник_Сессии` (12) | черновики/время/ответы/состояния | MockSession snapshot + importer **NEEDED**, M03-03 |
| `Пробник_Конфигурации` (3) | варианты, версии, активный | MockVariant/Version **NEEDED**, M03-03 |
| `Пробник_Задания` (136) | баллы за отдельные задания | MockTaskResult/import **NEEDED**, M03-03 |
| `ДЗ_Каталог` (48) | `catalog[]`/выбор ДЗ | `HomeworkCatalogItem` + importer **EXISTS**; teacher read **NEEDED**, M04-02 |
| `ДЗ_Назначения` (77 в раннем снимке) | `statistics.homework`, дедлайны, статусы | `HomeworkAssignment`, `HomeworkSubmission`, importer, student API **EXISTS**; teacher read/write **NEEDED**, M04-02/03. Source repair M01-04 |
| `Занятия` (87) | `statistics.lessons`, посещаемость, запись урока | Lesson/Participant/Attendance и импорт **NEEDED**, M03-02; teacher write M04-03 |
| `Справочник тем` (44) | `statistics.topics`, предметные темы | Topic/Subject/Program linkage **NEEDED**, M01-02/M03-03 |
| `Анкеты_учеников` (37) | анкеты и диагностика | Questionnaire/Answers history **NEEDED**, M03-03; ограничить доступ |
| `Инструкция API` (47) | описание скрипта, не учебные записи | Не импортировать в business tables; оставить документацией |
| `Архив · Настройки` (15) | исторические опции | Проверить использование, переносить только нужные настройки |
| `Архив · Освоение` (19) | старые агрегаты | Исторический snapshot/provenance, не замена фактических попыток |
| `Архив · Тесты` (12) | старые результаты | M03-03: сохранять provenance и защищаться от дублей |
| `Архив · Пробники` (4) | старые результаты | M03-03: сохранить историю оценивания |
| `Архив · Точки роста` (6) | старые аналитические срезы | По необходимости snapshot, не выдумывать новые learning events |
| `Архив · ДЗ` (10) | старые назначения/сдачи | M03-03: сверить event/assignment identity |
| `Архив · Инструкция` (8) | документация архива | Не импортировать в business tables |

**Итого 20 вкладок:** 13 основных/служебных и 7 архивных. Нет доказательства, что все они по-прежнему имеют такие же headers/число строк. Комментарий `manage.html` также упоминает возможные legacy `ДЗ_Сдачи` в статистике; существование этого листа **не подтверждено** прошлой таблицей метаданных — проверить при M01-04. Для календаря и освоения `manage` учитывает именно строки назначения, а не самостоятельные сдачи.

**Различие снимков:** позже source audit зафиксировал `ДЗ_Назначения` **83 строки: 66 валидных и 17 блокирующих**, ранее было 77. Числа относятся к разным временам, не складывать и не объявлять ошибкой БД. Исправить source или явно разрешить остатки только после нового dry-run; без догадок и частичного apply.

## 3. Существующий backend, который нужно переиспользовать

В `Program.cs` уже есть:
- `POST /api/v1/student-sessions` — обмен кода на short-lived student JWT;
- `POST /api/v1/test-attempts` — student write;
- `GET /api/v1/homework-assignments` и `POST /api/v1/homework-submissions` — студент;
- `GET /health/live`, `GET /health/ready` — health.

EF уже хранит `Workspace, TeacherUser, WorkspaceMembership, LearningProgram, Student, WorkspaceStudentMembership, TestAttempt, HomeworkCatalogItem, HomeworkAssignment, HomeworkSubmission` и import journals. `Platform.StudentImport`, `Platform.HomeworkImport` реализованы для локального XLSX (dry-run + repeatable apply). **Teacher auth и защищённых teacher endpoints в текущем Program.cs нет.** Предлагаемое будущее `/api/v1/teacher/*` — название проекта, не существующий маршрут.

## 4. Риски и обязательные будущие исправления

1. **Teacher auth / tenant:** `getTeacherFormData` и все изменения должны быть доступны только действующей серверной teacher session и workspace; старый browser hash/статический GAS credential — не auth.
2. **Cross-teacher cache:** `manage` хранит полный `students/groups/catalog/statistics` JSON в `localStorage` под общим ключом `teacher-form-data-v14-subscriptions-ege-oge-combined`. Перед multi-tenant доступом удалить/изолировать этот кэш по tenant/session и очищать при logout или switch.
3. **Idempotency:** `saveLessonAndHomework` отправляется без устойчивого request ID, при timeout повтор может создать дубли. Нужен client-generated idempotency key, atomic transaction for lesson + attendance + homework. `saveSubscription` должен создавать аудируемый ledger, не уничтожать старые значения.
4. **Subject-neutral домен:** сейчас в UI `EGE_MATH/OGE_MATH`, 19/25 заданий, 4/8 занятий. Это **UI-правила пилота**, не ограничения PostgreSQL. M01-02 определить `Subject`, `Course/Program`, enrollments; также перепроверить текущий `WorkspaceStudentMembership.ProgramId` и unique-ограничения перед поддержкой нескольких предметов.
5. **Даты и сохранность:** legacy `Europe/Moscow`; в новой модели хранить UTC timestamps и IANA zone для расписания/отчётов, исходные IDs, статусы, оценки, price/reset/due. Пустые даты не восстанавливать по соседям.
6. **Безопасное переключение:** до source repair, staging import rehearsal, backup/restore и отдельного одобрения **GAS/Sheets остаётся единственным production writer**; не допускать silent dual-write.

## 5. Следующий шаг

**M01-02:** на основе матрицы определить универсальную tenant/teacher/student/subject/course/enrollment модель, кардинальность и FK, отразить ограничения уже существующих StudentImport/HomeworkImport, договориться о миграционном пути без потери legacy IDs. Дальше M01-03 teacher auth, M01-04 свежий source check, затем сервер M02 и импорт M03.

**Проверено:** 5 точных действий формы и 20 вкладок сверены с текущим backend. **NOT_RUN:** свежие Google Sheets, production data, SQL migrations, браузерные тесты, серверное развёртывание. Это **документальная инвентаризация**, а не завершённый перенос.
