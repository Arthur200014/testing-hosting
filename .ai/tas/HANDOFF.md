# TEACHER AI STUDENT — HANDOFF

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-13
**CURRENT_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — 3 outcomes, not historical Mxx TODO queue
**ACTIVE_RESULT:** 2 — сквозная проверка и скорость (Result 1 code complete; live owner test deferred)
**ACTIVE_TASK:** Result 2 — targeted post-mutation cache invalidation and synthetic workspace-switch/network safety
**ACTIVE_BRANCH:** tas/cabinet-fast-safe-refresh
**LAST_PROGRESS_COMMIT:** `b7404b81284d82f54f8648aca0f2f6f03b12e5d6` ([PR #43](https://github.com/Arthur200014/testing-hosting/pull/43))
**NEXT_ACTION:** Verify targeted cache-invalidation tests and synthetic browser suite (including workspace isolation, stale responses and retry), fix observed failures; merge if PASS. Continue Result 2 with read-only latency measurement where production access is permitted, and targeted backend optimization only if evidence supports it. Do not alter manage/GAS or live student records.
**VERIFICATION:** [PR #43](https://github.com/Arthur200014/testing-hosting/pull/43) paired lesson correction merged: [Chromium PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43489358232), [PostgreSQL integration PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43489357930), [backend gate PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43489357987). No migrations/import, live production write/deployment NOT_VERIFIED. Corrected attendance/time/topic/duration; same membership IDs, linked homework/subscriptions untouched. Prior PR #42 verified.

## Non-negotiable context
- Existing Timeweb **App Platform** deployment with private managed PostgreSQL; do not create VPS/Compose infrastructure, re-import owner-confirmed students/homework/lessons or request manual migration after code deploy.
- Owner confirmed previous import and health; no independent current production deploy check. Live student submit and teacher grade NOT_RUN by owner decision (M04-06 deferred); do not block product work. Production restore NOT_RUN, only isolated restore with separate permission/cost approval.
- **Do not change** `EGA/config/manage.html`, GAS, public URLs, live student data, secrets or old history in this branch. Switching writer to PG later requires explicit owner approval.
- Teacher UI/API source: `platform/teacher.html`, `platform/teacher-data.mjs`, `platform/teacher-report.mjs`, `platform/student.html`, `platform/src/Platform.Api/Program.cs`. Read only relevant lines/tests.
- New phase order and acceptance rules are in `RELEASE_PLAN.md`; `TASK_BOARD.md` is an archive. No extra project-management commits or microtasks. Preserve last 8 lesson report, 80/20 weights and null scores.
