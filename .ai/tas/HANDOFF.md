# TEACHER AI STUDENT — HANDOFF

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-13
**CURRENT_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — 3 outcomes, not historical Mxx TODO queue
**ACTIVE_RESULT:** 2 — сквозная проверка и скорость (Result 1 code complete; live owner test deferred)
**ACTIVE_TASK:** Result 2 — selective refresh and workspace/session/offline synthetic tests DONE; next read-only latency and remaining cross-workspace E2E checks
**ACTIVE_BRANCH:** none (PR #44 merged)
**LAST_PROGRESS_COMMIT:** `a62d2302b8ec5cf4ec1d00f9fa91b8593960cbf8` ([PR #44](https://github.com/Arthur200014/testing-hosting/pull/44))
**DEPLOY_AUTOMATION:** GitHub Pages main auto publishes. Timeweb native auto deploy needs one-time setting in Timeweb UI (not verifiable via GitHub only); opt-in API fallback `.github/workflows/timeweb-api-auto-deploy.yml` prepared and intentionally inactive until repo variables/secret set. See `docs/ops/timeweb-autodeploy.md`. Production deployment NOT_RUN.
**NEXT_ACTION:** Continue Result 2, not new M04 microtasks: obtain read-only latency metrics for teacher API/page (prefer synthetic production-like dataset, label any real Timeweb observations separately); inspect the slowest endpoint(s) before optimizing database. Complete focused tenant/auth, retries and report 80/20 E2E checks and record PASS/NOT_RUN. No live data writes, no manage/GAS edits, no paid resource provisioning.
**VERIFICATION:** [PR #44](https://github.com/Arthur200014/testing-hosting/pull/44) selective teacher refresh merged: [Chromium + 13 Node tests PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43491184697), [PostgreSQL integration PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43491184630), [backend gate PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43491184784). Synthetic UI reduced 7 GET reads to 1 after native homework writes; two synthetic workspaces, stale-session response, offline retry, expired auth PASS. Real Timeweb latency/deploy NOT_VERIFIED; no production data touched. Earlier PR #43 verified.

## Non-negotiable context
- Existing Timeweb **App Platform** deployment with private managed PostgreSQL; do not create VPS/Compose infrastructure, re-import owner-confirmed students/homework/lessons or request manual migration after code deploy.
- Owner confirmed previous import and health; no independent current production deploy check. Live student submit and teacher grade NOT_RUN by owner decision (M04-06 deferred); do not block product work. Production restore NOT_RUN, only isolated restore with separate permission/cost approval.
- **Do not change** `EGA/config/manage.html`, GAS, public URLs, live student data, secrets or old history in this branch. Switching writer to PG later requires explicit owner approval.
- Teacher UI/API source: `platform/teacher.html`, `platform/teacher-data.mjs`, `platform/teacher-report.mjs`, `platform/student.html`, `platform/src/Platform.Api/Program.cs`. Read only relevant lines/tests.
- New phase order and acceptance rules are in `RELEASE_PLAN.md`; `TASK_BOARD.md` is an archive. No extra project-management commits or microtasks. Preserve last 8 lesson report, 80/20 weights and null scores.
