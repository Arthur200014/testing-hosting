# TAS history reconciliation — 2026-11-12

Read-only comparison at 2026-11-11 23:44 UTC. The private import XLSX snapshots were compared with the current Google Sheets tabs by their source keys. No student names, identifiers, answer JSON, credentials or raw rows are included here. Excel date serials and explicit-offset timestamps were normalized; numeric time comparisons tolerate less than 1 ms of spreadsheet precision.

| Source tab | Current nonblank rows | Imported snapshot rows | Current change against snapshot |
|---|---:|---:|---|
| Ученики | 35 | 32 filtered | All 32 retained rows unchanged; 3 previously excluded incomplete rows remain |
| ДЗ_Каталог | 70 | 70 | No additions, removals or changes |
| ДЗ_Назначения | 227 | 212 filtered | All 212 retained rows unchanged; 15 previously excluded malformed/orphan rows remain; 2 additional blank rows |
| Занятия | 322 participant rows / 294 lesson IDs | 322 participant rows | No additions, removals or changes |
| Абонементы | 31 | 31 | No additions, removals or changes |
| Тесты | 269 | 269 | No additions, removals or changes |
| Пробники | 43 | 43 | No additions, removals or changes |
| Пробник_Задания | 419 | 419 | No additions, removals or changes |
| Пробник_Сессии | 12 | 12 | No additions, removals or changes |
| Пробник_Конфигурации | 5 | 5 | No additions, removals or changes |

The filtered 32 student and 212 assignment rows exclude source blockers, so apparent new keys in the full current sheets are the known excluded rows, not a late import delta. The private source workbooks stay outside Git.

## Database evidence and limits

- Student/homework (32/70/212), lesson/subscription (287 lessons, 314 participants, 28 snapshots) and mock history (43/407/11/5 expected eligible rows) were reported as completed by the owner. These counts have not been independently checked with SQL.
- The owner supplied the test-history importer output from Timeweb: migrations current, dry-run `Created:0`, `Unchanged:233`, `CanApply:true`, 36 `student_not_imported` skips and no conflicts. This compares all 233 eligible test rows against DB values. The one-off script then stopped because its guard expected a first import; no new write was made by that invocation.
- The historical source blockers are explicit and remain in Sheets; they were not fabricated or silently deleted. Questionnaires are excluded from migration by owner request.
- This is source snapshot comparison, not M03-04 isolated restore/rehearsal. No direct SQL reconciliation of all tables, isolated backup restore, or production cutover is claimed.

## Next verification

Run the full import sequence against an isolated PostgreSQL database restored from a safe backup or initialized separately, then check row counts, tenant/program links, intentional skips, read-only replay, conflict rejection and rollback. Never use Timeweb's restore action on the active cluster for this test. Recheck Sheets for a late delta before switching any live client writes.
