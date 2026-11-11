# M01-02 — универсальная модель tenant / преподаватель / предмет / курс / ученик

**Статус:** техническая схема v1 (2026-11-11), проектирование PASS; **EF migrations, реальная БД и API НЕ изменены**. Основана на [фактической M01-01 карте](./manage-postgres-coverage.md) и [PlatformDbContext](../../platform/src/Platform.Api/Persistence/PlatformDbContext.cs). Вводится после отдельной миграции и focused PostgreSQL tests.

## Принципы

1. **Workspace — граница доступа и владения.** Один преподаватель может принадлежать нескольким workspace, ученики/курсы/результаты каждого workspace не становятся доступны другим по общему studentId, email или URL.
2. **Предмет не равен программе/экзамену.** Subject («математика», «английский», «физика») → много Course/Program («профиль ЕГЭ», «разговорный английский», «ОГЭ»). Программа имеет owner `WorkspaceId`, `SubjectId`, код и название, необязательные настройки.
3. **Ученик может изучать несколько предметов и курсов** у одного преподавателя, но история и выдача ДЗ должны быть привязаны к конкретному enrollment/course. Не копировать ученика для каждого предмета.
4. **Сохраняем существующий API.** `WorkspaceStudentMembership.ProgramId` и вход по коду пока являются legacy primary program. Новый enrollment вводится отдельно; текущие student-only homework/test endpoints сохраняют семантику до отдельного versioned migration.
5. **Приватность.** Не хранить реальные ФИО/пригласительные коды/родительские данные в task docs и test fixtures; teacher API передаёт только разрешённые поля, server выводит workspace из сессии.

## Уже есть в коде

| Сущность | Фактические свойства и ограничения | Решение |
|---|---|---|
| `Workspace` | `Id`, уникальный `Slug`, `IsActive` | Сохранить как tenant, добавить настройки временной зоны/локали позже |
| `TeacherUser` | `Id`, `Email`, уникальный `NormalizedEmail`, `IsActive` | Глобальная login identity, **не** право доступа ко всем workspace |
| `WorkspaceMembership` | `WorkspaceId,TeacherUserId,Role,IsActive`; unique пара | Основа server auth/RBAC, после M01-03 обрабатывается `Role` и активность |
| `Student` | `Id,DisplayName,IsActive,CreatedAt` — без `WorkspaceId` | Все выборки только через tenant membership. Персональные заметки/родители — workspace-scoped extension |
| `WorkspaceStudentMembership` | `WorkspaceId,StudentId,ProgramId,CodeHash,ImportSource,ImportExternalId,IsActive` | Сохраняем tenant-level student record; `ProgramId` пока legacy primary. Unique `(WorkspaceId,StudentId)` не допускает второй такой membership |
| `LearningProgram` | `WorkspaceId,Code,DisplayName,IsActive`, `(WorkspaceId,Code)` unique | Переиспользуем как Course/Program, добавляем `SubjectId`, без hardcode `EGE_MATH` в domain |
| `TestAttempt`, homework entities | tenant/composite FKs и legacy student membership/program links | **Не переписывать связи задним числом**; новые enrollment-aware возможности вводить через versioned API |

## Проект новых/расширенных таблиц (не существующие EF entities)

| Название (логическое) | Ключи и поля | Уникальность / правила |
|---|---|---|
| `Subject` | `Id,WorkspaceId,Code,DisplayName,IsActive` | unique `(WorkspaceId,Code)`, FK `WorkspaceId` |
| `LearningProgram.SubjectId` | `(WorkspaceId,SubjectId)` FK; `DisplayName`, `Code` уже есть | Каждая программа принадлежит ровно одному предмету **после explicit backfill**. Не угадывать предмет по произвольному коду |
| `StudentEnrollment` | `Id,WorkspaceId,StudentMembershipId,ProgramId,IsActive,JoinedAt,ArchivedAt` | unique active `(WorkspaceId,StudentMembershipId,ProgramId)`; составные tenant/program FK |
| `WorkspaceStudentProfile` | `WorkspaceId,StudentId,Grade,Target,ParentContact,Notes` (опционально и с политикой ПДн) | unique `(WorkspaceId,StudentId)`; данные одного teacher workspace не показывать другому |
| `CourseGroup` (по потребности) | `Id,WorkspaceId,ProgramId,Label,IsActive` | unique scoped key; legacy `groupId` сопоставлять явно |
| `WorkspaceSettings` | `WorkspaceId,TimeZoneId,Locale,DefaultCurrency` | IANA zone (в пилоте `Europe/Moscow`); цена в minor units + ISO currency, не глобальный `₽` hardcode |
| Исторические `Lesson/Participant/Subscription/Ledger` | `WorkspaceId`, teacher membership, optional `ProgramId/EnrollmentId`, `ImportSource/ExternalId` | Схемы создаются в M03-02; PK/FK tenant-scoped, операции идемпотентны, lesson+HW atomic |

Рекомендация для `StudentEnrollment`: FK `(WorkspaceId,StudentMembershipId)` → membership и `(WorkspaceId,ProgramId)` → program; не доверять `WorkspaceId` из browser body. Не создавать вторую `Student` сущность на каждую программу.

## Миграционный порядок без нарушения работающего backend

1. **Additive migration:** создать `Subject` с tenant-ключами, сделать `LearningProgram.SubjectId` **nullable** на время перехода, добавить `StudentEnrollment` и опциональные workspace student profile/settings.
2. **Explicit mapping:** подготовить per-workspace `programId → Subject` mapping вне Git. Для пилота `EGE_MATH` и `OGE_MATH` могут указывать на один настраиваемый математический Subject, но это не универсальное правило. Неизвестные коды = блокирующая диагностика, не guess.
3. **Backfill staged:** для каждого действующего `WorkspaceStudentMembership` создать ровно один enrollment соответствующей legacy `ProgramId`, с import identity/идемпотентностью; сверить `membership count == enrollment count for legacy primary`, другие курсы пока пусты.
4. **Import compatibility:** существующие `StudentImport` и `HomeworkImport` пока работают с прежними `ProgramId` и import journals. Обновлять их только в отдельной задаче с регрессией dry-run/duplicate/apply; нельзя молча менять digest program map.
5. **Versioned APIs:** текущие student test/homework endpoints работают на primary program. Новые multi-course действия используют `EnrollmentId` только после проверки членства server-side; не доверять student-provided teacher/workspace/program IDs.
6. **Constraint tightening:** сделать `LearningProgram.SubjectId NOT NULL` только после успешного полного backfill и проверки всех рабочих/staging tenants. Технически пустой субъект не должен блокировать старые imports до завершения backfill.
7. **No cutover yet:** пока не появились настоящая teacher auth, source reconciliation, серверные backups и автоматические tenant tests, рабочие `manage` и GAS остаются неизменными.

## Правила защиты, которые должны проверить тесты будущих миграций/API

- Два teacher/workspace с одинаковыми student display names получают разные scoped профили/курсы, чужая запись возвращает запрет, а не чужой DTO.
- Один студент в workspace может иметь **два и более enrollment**, но ровно один current legacy `WorkspaceStudentMembership`.
- Нельзя добавить enrollment в program чужого workspace даже если подменить `ProgramId`.
- `TeacherUser` в двух workspace может переключить активный tenant только с авторизованной сессией; роль `teacher` одного workspace не открывает второй.
- Повторный backfill/import не создаёт новых enrollments/subjects, не меняет event IDs, баллы и исходные timestamps.
- После archive/restore не происходит удаления связанной истории занятий, результатов и ledger.
- UTC instant и tenant IANA timezone сохраняют корректную локальную дату; отсутствие оценки/данных не означает 0.

## Следующий шаг

**M01-03:** спроектировать и реализовывать server-side teacher login/RBAC (workspace role, session expiry/revocation, tenant-scoped read/write, rate limiting). До teacher auth не добавлять публичные teacher endpoints к реальным данным. Исходные данные и staging/prod остаются нетронутыми.

**Проверка M01-02:** PASS — структура согласована с действующими ключами `PlatformDbContext` и существующим контрактом ученической сессии. NOT_RUN — migrations, runtime, новые объекты в PostgreSQL, интеграционные тесты и реальные import writes. Это **архитектурное решение**, а не заявка о внедрённой схеме.
