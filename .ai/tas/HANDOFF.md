# TEACHER AI STUDENT — HANDOFF

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-13
**CURRENT_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — 3 outcomes, not historical Mxx TODO queue
**ACTIVE_RESULT:** 1 — рабочий кабинет преподавателя
**ACTIVE_TASK:** Result 1 — safe correction of existing paired lessons DONE; assess daily-use gaps before Result 2
**ACTIVE_BRANCH:** none (PR #43 merged)
**LAST_PROGRESS_COMMIT:** `b7404b81284d82f54f8648aca0f2f6f03b12e5d6` ([PR #43](https://github.com/Arthur200014/testing-hosting/pull/43))
**NEXT_ACTION:** Assess any remaining essential daily-use gaps from the code. If no release-blocking missing core operations, begin Result 2: focused synthetic cross-workspace E2E and measure actual page/API load latency to target data-loading bottlenecks. Keep work outcome-based (3 major results), do not invent more M04-xx. No live data writes or legacy manage/GAS edits.
**VERIFICATION:** [PR #43](https://github.com/Arthur200014/testing-hosting/pull/43) paired lesson correction merged: [Chromium PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43489358232), [PostgreSQL integration PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43489357930), [backend gate PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43489357987). No migrations/import, live production write/deployment NOT_VERIFIED. Corrected attendance/time/topic/duration; same membership IDs, linked homework/subscriptions untouched. Prior PR #42 verified.

## Non-negotiable context
- Existing Timeweb **App Platform** deployment with private managed PostgreSQL; do not create VPS/Compose infrastructure, re-import owner-confirmed students/homework/lessons or request manual migration after code deploy.
- Owner confirmed previous import and health; no independent current production deploy check. Live student submit and teacher grade NOT_RUN by owner decision (M04-06 deferred); do not block product work. Production restore NOT_RUN, only isolated restore with separate permission/cost approval.
- **Do not change** `EGA/config/manage.html`, GAS, public URLs, live student data, secrets or old history in this branch. Switching writer to PG later requires explicit owner approval.
- Teacher UI/API source: `platform/teacher.html`, `platform/teacher-data.mjs`, `platform/teacher-report.mjs`, `platform/student.html`, `platform/src/Platform.Api/Program.cs`. Read only relevant lines/tests.
- New phase order and acceptance rules are in `RELEASE_PLAN.md`; `TASK_BOARD.md` is an archive. No extra project-management commits or microtasks. Preserve last 8 lesson report, 80/20 weights and null scores.
