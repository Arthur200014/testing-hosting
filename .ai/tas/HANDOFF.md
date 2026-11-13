# TEACHER AI STUDENT — HANDOFF

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-13
**CURRENT_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — 3 outcomes, not historical Mxx TODO queue
**ACTIVE_RESULT:** 1 — рабочий кабинет преподавателя
**ACTIVE_TASK:** Result 1 — safe correction of paired lessons (date, attendance, duration, topic)
**ACTIVE_BRANCH:** tas/cabinet-lesson-correction
**LAST_PROGRESS_COMMIT:** `786430ff161bac678ea13dc02932090fae0667d4` ([PR #42](https://github.com/Arthur200014/testing-hosting/pull/42))
**NEXT_ACTION:** Verify synthetic Chromium/Node and isolated PostgreSQL tests for lesson correction in tas/cabinet-lesson-correction; fix failures, merge on PASS. Then assess remaining daily-workflow gaps; if none, move to Result 2 cross-workspace E2E and performance measurements. Do not alter live data or legacy manage/GAS.
**VERIFICATION:** [PR #42](https://github.com/Arthur200014/testing-hosting/pull/42) homework deadlines merged: [Chromium + Node PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43487940944), [PostgreSQL integration PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43487940976), [backend gate PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43487941000). No migration, no server writes beyond synthetic tests. Production deployment/late-submission NOT_VERIFIED. Prior PR #41 verified.

## Non-negotiable context
- Existing Timeweb **App Platform** deployment with private managed PostgreSQL; do not create VPS/Compose infrastructure, re-import owner-confirmed students/homework/lessons or request manual migration after code deploy.
- Owner confirmed previous import and health; no independent current production deploy check. Live student submit and teacher grade NOT_RUN by owner decision (M04-06 deferred); do not block product work. Production restore NOT_RUN, only isolated restore with separate permission/cost approval.
- **Do not change** `EGA/config/manage.html`, GAS, public URLs, live student data, secrets or old history in this branch. Switching writer to PG later requires explicit owner approval.
- Teacher UI/API source: `platform/teacher.html`, `platform/teacher-data.mjs`, `platform/teacher-report.mjs`, `platform/student.html`, `platform/src/Platform.Api/Program.cs`. Read only relevant lines/tests.
- New phase order and acceptance rules are in `RELEASE_PLAN.md`; `TASK_BOARD.md` is an archive. No extra project-management commits or microtasks. Preserve last 8 lesson report, 80/20 weights and null scores.
