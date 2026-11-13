# TEACHER AI STUDENT — HANDOFF

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-13
**CURRENT_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — 3 outcomes, not historical Mxx TODO queue
**ACTIVE_RESULT:** 1 — рабочий кабинет преподавателя
**ACTIVE_TASK:** Result 1 — cabinet gaps; existing student profile edit DONE
**ACTIVE_BRANCH:** none (PR #41 merged)
**LAST_PROGRESS_COMMIT:** `80daa213281c7524275b889f94d7d546f412a717` ([PR #41](https://github.com/Arthur200014/testing-hosting/pull/41))
**NEXT_ACTION:** Continue Result 1 with a coherent native-homework deadline/status improvement: awaiting, overdue, submitted on time, submitted late in student and teacher views/report. Keep existing submission semantics (do not reject late work) and run targeted synthetic checks. After that review lesson correction editing if genuinely required for everyday workflow. Do not touch manage/GAS or live records.
**VERIFICATION:** [PR #41](https://github.com/Arthur200014/testing-hosting/pull/41) student profile edit merged. [Chromium PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43483691477), [PostgreSQL integration PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43483691480), [backend gate PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43483691523). Production edit/deploy NOT_VERIFIED; no live student data touched. Prior PR #40 verified.

## Non-negotiable context
- Existing Timeweb **App Platform** deployment with private managed PostgreSQL; do not create VPS/Compose infrastructure, re-import owner-confirmed students/homework/lessons or request manual migration after code deploy.
- Owner confirmed previous import and health; no independent current production deploy check. Live student submit and teacher grade NOT_RUN by owner decision (M04-06 deferred); do not block product work. Production restore NOT_RUN, only isolated restore with separate permission/cost approval.
- **Do not change** `EGA/config/manage.html`, GAS, public URLs, live student data, secrets or old history in this branch. Switching writer to PG later requires explicit owner approval.
- Teacher UI/API source: `platform/teacher.html`, `platform/teacher-data.mjs`, `platform/teacher-report.mjs`, `platform/student.html`, `platform/src/Platform.Api/Program.cs`. Read only relevant lines/tests.
- New phase order and acceptance rules are in `RELEASE_PLAN.md`; `TASK_BOARD.md` is an archive. No extra project-management commits or microtasks. Preserve last 8 lesson report, 80/20 weights and null scores.
