# TEACHER AI STUDENT — current handoff

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-11
**ACTIVE_TASK:** none
**ACTIVE_BRANCH:** none
**CURRENT_PHASE:** M01 (Sheets → PostgreSQL, universal domain)
**LAST_COMPLETED_TASK:** roadmap reprioritization (docs only)
**NEXT_ACTION:** M01-01
**STATUS:** READY_TO_START

## Owner-directed new goal
**FIRST:** transfer the working Google Sheets data to a subject-neutral multi-tenant PostgreSQL model, deploy ASP.NET API+private PostgreSQL on a server, and connect **existing** `EGA/config/manage.html` with server-side teacher auth. This is the main teacher workspace *today*.
**LATER:** build a new admin/dashboard for many independent teachers across any subject; *only then* revisit lesson templates, board mechanics and AI. User screenshots are future UI references, not scope for this task.

## Current verified baseline / blockers
- [Backend CI](https://github.com/Arthur200014/testing-hosting/actions/runs/42997203038): 57/57 isolated PostgreSQL tests + API startup/health/synthetic 401 PASS. **Not a live server deployment.**
- Existing `Platform.StudentImport` and `Platform.HomeworkImport` have safe local XLSX dry-run/apply and tenant checks; no production import/cutover. Last audit showed **17 blocking homework assignment source rows**, must recheck latest snapshot.
- [GAS migration audit](https://github.com/Arthur200014/testing-hosting/blob/main/docs/architecture/gas-postgres-migration-audit.md) maps Sheets and current GAS actions. Additional tables (lessons, subscriptions, tests, mocks, questionnaire, history) need migration work.
- Teacher endpoints currently lack full server-side teacher auth; `manage` still depends on legacy GAS.
- [Timeweb deploy history](https://github.com/Arthur200014/testing-hosting/blob/main/.ai/tasks/timeweb-deployment.md) BLOCKED, no verified live API. New owner request authorizes resuming server work but not inventing readiness.
- No live data write, provider switch, production deployment or teacher UI code changed in roadmap update.

## One next action
**M01-01:** read only `EGA/config/manage.html` teacher API-related regions and `docs/architecture/gas-postgres-migration-audit.md` / existing import contracts. Make actionable matrix `sheet + legacy action → PG model → API read/write → migration strategy → status`. Preserve multi-tenant/workspace and configurable subject (not hardcoded math), identify all missing entities, no real XLSX export/write needed. Update TASK_BOARD/HANDOFF and proceed toward M01-02 when checked.

Current task order and acceptance gates: [TASK_BOARD.md](https://github.com/Arthur200014/testing-hosting/blob/main/.ai/tas/TASK_BOARD.md), [PHASE_CHECKLISTS.md](https://github.com/Arthur200014/testing-hosting/blob/main/.ai/tas/PHASE_CHECKLISTS.md). Old Pxx roadmap archived. `AGENTS.md` governs lean implementation/testing.
