# Безопасный импорт справочника учеников в PostgreSQL

Status: DONE

## Цель

Подготовить повторяемый локальный импорт листа `Ученики` из XLSX Google Sheets
в существующую модель ASP.NET Core/PostgreSQL. Сначала всегда выполняется
`dry-run`; production import и переключение сайта в эту задачу не входят.

## Область работы

- Отдельный CLI-проект `platform/src/Platform.StudentImport/`.
- Чтение только листа `Ученики` из локального XLSX-файла.
- Явное сопоставление legacy `programId` с программами workspace.
- Валидация заголовков, типов, обязательных значений, дублей и конфликтов.
- Агрегированный отчёт без значений строк и персональных данных.
- Идемпотентный `--apply` одной PostgreSQL-транзакцией.
- Журнал import batch без имён, кодов и legacy identifiers в отчётах.
- Integration tests на реальном PostgreSQL 17.
- Безопасный browser smoke только на странице из `EGA/6/`.

## Вне области работы

- Production import или автоматическое чтение Google Sheets по credentials.
- Переключение `LegacyApiClient`, публичных URL или источника записи.
- Изменение HTML/CSS/UI, Firebase или Google Apps Script.
- Импорт тестов, ДЗ, пробников, занятий, абонементов и отчётов.
- Новая teacher/admin авторизация и endpoint `submitTest`.
- Хранение grade/group/target score/notes/parent/target grade до отдельного
  решения по их модели.

## Текущее состояние

- `main` синхронизирован с `origin/main`, рабочее дерево до планирования чистое.
- Фундамент API/PostgreSQL и student-session exchange завершён в `8a49cde`.
- Аудит подтвердил лист `Ученики`: 22 записи и 12 заголовков; значения строк
  в Git не сохранялись.
- `WorkspaceStudentMembership` уже содержит `CodeHash`, `ImportSource` и
  `ImportExternalId` и tenant-safe уникальные ограничения.
- Публичный CSV привязан к GID другой вкладки; для листа `Ученики` выбран XLSX.

## Принятые решения

- CLI принимает локальный XLSX; сам не обращается к production Google API.
- Без `--apply` команда работает только как `dry-run`.
- `studentId` используется как external identity только после проверки
  непустоты и уникальности внутри файла и отсутствия конфликтов в БД.
- `inviteCode` нормализуется существующим `StudentCodeHasher`; сохраняется
  только HMAC-SHA256. Plaintext нельзя логировать, сохранять в БД или Git.
- `studentName` отображается в `Student.DisplayName`; `active` — в активность
  ученика и membership; `programId` проходит только через явный program map.
- Отсутствующие в новом снимке ученики автоматически не деактивируются.
- Совпавший повтор ничего не меняет; расхождение существующей записи является
  конфликтом, а не скрытым update.
- Workspace и программы создаются при `--apply` только из явных безопасных CLI/
  mapping-настроек и в той же транзакции; `dry-run` лишь показывает план.
- Ошибка любой строки блокирует весь `--apply`; частичного импорта нет.
- Source workbook, mapping с реальными значениями и любые credentials находятся
  вне Git. Тесты используют только синтетические данные.
- Jev route: `HIGH`; researcher `gpt-6-luna medium`; implementation lane не
  выше `gpt-5.6-sol high`; browser/test lane `gpt-6-luna medium`; независимый
  review обязателен. `TERRA: UNAVAILABLE_IN_RUNTIME`.

## Связанные файлы

- `platform/src/Platform.StudentImport/`
- `platform/src/Platform.Api/Persistence/`
- `platform/src/Platform.Api/Students/`
- `platform/tests/`
- `compose.yaml`
- `platform/README.md`
- `docs/architecture/platform-foundation.md`
- `EGA/6/`

## Чек-лист задач

- [x] Изучить аудит, текущую модель и формат источника.
- [x] Получить обязательный Jev-routing.
- [x] Закоммитить и отправить этот planning-checkpoint в `main`.
- [x] Зафиксировать CLI contract и синтетические XLSX fixtures.
- [x] Реализовать строгий XLSX parser и безопасный агрегированный report.
- [x] Реализовать default dry-run и доказать отсутствие записей.
- [x] Добавить import batch journal и миграцию.
- [x] Реализовать транзакционный идемпотентный `--apply`.
- [x] Проверить дубли code/external ID, неизвестные программы и rollback.
- [x] Проверить совпадение нормализации с student-session exchange.
- [x] Собрать контейнеры и прогнать real PostgreSQL integration tests.
- [x] Выполнить browser smoke на одном интерактиве `EGA/6/` без внешних записей.
- [x] Выполнить независимый security/data-integrity review и исправления.
- [x] Обновить архитектурную документацию и cloud start instructions.
- [x] Проверить diff/secrets, commit и push завершённого этапа в `main`.

## Текущий шаг

Этап завершён: importer, PostgreSQL-проверки, безопасный browser smoke,
независимый review, исправление digest/content TOCTOU и документация готовы.

## Следующий шаг

Открыть отдельную задачу для следующего листа/серверного API по приоритету
миграции; production import и переключение клиентов не выполнять автоматически.

## Проверка

- Исходное состояние: `main...origin/main`, изменений нет.
- Jev через Polza/официальный TypeSafe SDK: `HIGH`, обязательный review.
- Read-only researcher подтвердил пригодность текущей membership/import model.
- `docker compose config --quiet` и `git diff --check`: успешно.
- Docker build: 0 warnings, 0 errors.
- Real PostgreSQL 17: 20/20 тестов (API 7/7, importer 13/13).
- Проверены dry-run без записей, HMAC-only, повтор и конкурентный повтор,
  конфликты, rollback, сохранение отсутствующих в снимке записей и session
  exchange.
- После исправления single-snapshot digest-инварианта повторно пройдены real
  PostgreSQL 17 tests: 20/20; JavaScript regression tests: 30/30.
- Browser smoke `EGA/6/найди ошибку-1.html`: desktop 1440×1000 и mobile
  390×844, HTTP 200, runtime/стартовое лобби загружены, console/page/network
  errors и внешние записи отсутствуют. Для Chromium использован изолированный
  временный NSS trust store; проверка TLS не отключалась.
- Независимый security/data-integrity review: APPROVED. Найденный риск между
  отдельным hash/read устранён: digest и parser используют один bounded snapshot
  (XLSX 32 MiB, program map 1 MiB), повторный review — APPROVED.
- Cloud start instructions сохранены в configuration draft; для применения в
  новых средах требуется review/save и публикация environment configuration.

## Открытые вопросы и риски

- Реальные форматы boolean/date/number и program IDs проверяются только в
  приватном dry-run и не публикуются.
- Текущая схема намеренно не принимает дополнительные profile-поля: их нельзя
  молча потерять при окончательном production migration.
- Для будущего автоматического чтения Sheets потребуется отдельная read-only
  Google identity; этот этап её не создаёт.

## Последнее обновление

2026-10-05 — первый student-directory import slice полностью проверен и закрыт:
20/20 PostgreSQL tests, 30/30 JavaScript tests, browser smoke и независимый
review пройдены; найденный TOCTOU риск исправлен; документация обновлена.
