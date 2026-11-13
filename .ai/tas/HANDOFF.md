# TEACHER AI STUDENT — HANDOFF

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-13
**CURRENT_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — 3 outcomes, not historical Mxx TODO queue
**ACTIVE_RESULT:** 3 — стабильный релиз (Result 2 synthetic E2E and Timeweb public health PASS)
**ACTIVE_TASK:** Result 3 — synthetic backup/restore and runtime migration safety audited; actual Timeweb managed backup state NOT_VERIFIED
**ACTIVE_BRANCH:** none (PR #46 merged)
**LAST_PROGRESS_COMMIT:** `7666f2339e25de682d2f1ff3c6dd9c9ccf00d409` ([PR #46](https://github.com/Arthur200014/testing-hosting/pull/46))
**DEPLOY_AUTOMATION:** Timeweb auto-deployment was enabled per user (2026-11-13). GitHub Pages main auto publishes. API fallback `.github/workflows/timeweb-api-auto-deploy.yml` is intentionally inactive when native deploy is used. Public Timeweb health PASS; running container commit NOT_ATTESTED. See `docs/ops/timeweb-autodeploy.md`.
**NEXT_ACTION:** Release safety: confirm existence/retention of managed Timeweb PostgreSQL backups and running deployment revision via read-only Timeweb account access, before proposing any isolated restore with explicit cost/permission. The already-verified `platform/scripts/isolated-restore-smoke.sh` uses disposable synthetic DB only (pg_dump/pg_restore/EF migrations/rollback PASS); `runtime-entrypoint.sh` applies pending schema migrations but does not rerun imports. Never restore production, reimport or switch GAS/manage without explicit approval. Authenticated teacher API latency and live student submission remain NOT_MEASURED/NOT_RUN.
**VERIFICATION:** [PR #46](https://github.com/Arthur200014/testing-hosting/pull/46) merged, [backend gate PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43500148474), [PostgreSQL integration PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43500148347), [main integration PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43500586950). [Real Timeweb read-only health PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43500996830): live HTTP200 total1150.9ms, ready HTTP200 total2222.2ms, migrations HTTP200 total702.3ms, anonymous teacher/students HTTP401 total569.3ms. One sample per endpoint; production DB writes/restore NOT_RUN. Earlier tenant, report, Chromium, delayed submission tests PASS.

## Non-negotiable context
- Existing Timeweb **App Platform** deployment with private managed PostgreSQL; do not create VPS/Compose infrastructure, re-import owner-confirmed students/homework/lessons or request manual migration after code deploy.
- Owner confirmed previous import and health; no independent current production deploy check. Live student submit and teacher grade NOT_RUN by owner decision (M04-06 deferred); do not block product work. Production restore NOT_RUN, only isolated restore with separate permission/cost approval.
- **Do not change** `EGA/config/manage.html`, GAS, public URLs, live student data, secrets or old history in this branch. Switching writer to PG later requires explicit owner approval.
- Teacher UI/API source: `platform/teacher.html`, `platform/teacher-data.mjs`, `platform/teacher-report.mjs`, `platform/student.html`, `platform/src/Platform.Api/Program.cs`. Read only relevant lines/tests.
- New phase order and acceptance rules are in `RELEASE_PLAN.md`; `TASK_BOARD.md` is an archive. No extra project-management commits or microtasks. Preserve last 8 lesson report, 80/20 weights and null scores.
