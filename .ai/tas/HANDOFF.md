# TEACHER AI STUDENT — HANDOFF

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-13
**CURRENT_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — 3 outcomes, not historical Mxx TODO queue
**ACTIVE_RESULT:** 1 — рабочий кабинет преподавателя
**ACTIVE_TASK:** сохранить уже загруженные данные при обновлении вкладок (stale-while-refresh); обновить и закрепить дорожную карту, затем закрывать реальные пробелы кабинета по целым сценариям
**ACTIVE_BRANCH:** tas/release-three-milestones
**LAST_PROGRESS_COMMIT:** `8992783` (PR #39 merged; this branch starts from main)
**NEXT_ACTION:** verify targeted `platform/teacher-data.test.mjs` and existing synthetic browser test, merge this branch if PASS. Then implement missing existing-student profile editing in teacher API+UI as part of Result 1, with focused tenant/validation tests; do not create separate tiny M04 IDs.
**VERIFICATION:** PR #39 native homework report/overview [Chromium+Node PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43477495742), [backend gate PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43477495851), [PostgreSQL PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43477495816). New cache improvement PENDING on this branch.

## Non-negotiable context
- Existing Timeweb **App Platform** deployment with private managed PostgreSQL; do not create VPS/Compose infrastructure, re-import owner-confirmed students/homework/lessons or request manual migration after code deploy.
- Owner confirmed previous import and health; no independent current production deploy check. Live student submit and teacher grade NOT_RUN by owner decision (M04-06 deferred); do not block product work. Production restore NOT_RUN, only isolated restore with separate permission/cost approval.
- **Do not change** `EGA/config/manage.html`, GAS, public URLs, live student data, secrets or old history in this branch. Switching writer to PG later requires explicit owner approval.
- Teacher UI/API source: `platform/teacher.html`, `platform/teacher-data.mjs`, `platform/teacher-report.mjs`, `platform/student.html`, `platform/src/Platform.Api/Program.cs`. Read only relevant lines/tests.
- New phase order and acceptance rules are in `RELEASE_PLAN.md`; `TASK_BOARD.md` is an archive. No extra project-management commits or microtasks. Preserve last 8 lesson report, 80/20 weights and null scores.
