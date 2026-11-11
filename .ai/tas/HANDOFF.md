# TEACHER AI STUDENT — current handoff

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-11
**ACTIVE_TASK:** none
**ACTIVE_BRANCH:** none
**CURRENT_PHASE:** M01 (migration-first)
**LAST_COMPLETED_TASK:** M01-01 + M01-02 (targeted inventory and subject-neutral model; docs only)
**LAST_TASK_COMMIT:** `d1c443e958465d4d3f5b8a682cc1d0413ad98e0d`
**NEXT_ACTION:** M01-03
**STATUS:** READY_TO_START

## Confirmed results and limitations
- [M01-01 map](https://github.com/Arthur200014/testing-hosting/blob/main/docs/architecture/manage-postgres-coverage.md): actual `EGA/config/manage.html` calls **5 GAS actions**, no teacher ASP.NET equivalent; historic GAS audit covers **20 tabs**, including archive/service. Existing student/TestAttempt/homework models and XLSX importers identified. Earlier homework source audit: 83 assignments, 66 valid, **17 blockers**; fresh source NOT_RUN.
- [M01-02 subject-neutral model](https://github.com/Arthur200014/testing-hosting/blob/main/docs/architecture/tenant-subject-model-v1.md): reuse `Workspace`, `TeacherUser`, `WorkspaceMembership`, `Student`, `LearningProgram`; propose tenant `Subject` and `StudentEnrollment` for multiple courses per student, additive/backfill migration compatible with the existing student membership composite FK and importers. This is **design-only**, SQL/EF migrations NOT_RUN.
- Existing [backend CI](https://github.com/Arthur200014/testing-hosting/actions/runs/42997203038): 57/57 PostgreSQL tests and isolated startup smoke PASS previously; it does not cover new design or server deployment.
- Production remains **Google Sheets + GAS**. No real import, production cutover, teacher API, public page modification, or server deployment in this work. Past Timeweb deployment BLOCKED. The `manage` full data browser-cache key is not tenant-scoped and must be addressed before multi-teacher login.
- `TASK_BOARD.md` and `PHASE_CHECKLISTS.md` now point at **M01-03**; archived Pxx roadmap is not the active plan.

## One next action
**M01-03:** define a secure **server-side teacher authentication and RBAC contract** for the existing `manage` before implementing any teacher read/write endpoints: account bootstrap, tenant selection, sessions/revocation, rate limits, role permissions, cross-tenant/IDOR negative cases, cache/logout handling. Use current `platform/src/Platform.Api/IdentityAccess/` and `Program.cs` as source; no client-visible passwords, static GAS admin token, or open teacher package. If code is changed, use isolated synthetic integration tests and keep a task branch until verified. Then move to M01-04 (fresh source diagnostics), M02 staging/server, M03 data import and M04 manage API.

**Priority:** multi-teacher/multi-subject PostgreSQL → secure backend/server → real migration → existing `manage`; new admin UI, lesson mechanics, AI later. Work in scoped files, preserve legacy compatibility, report real PASS / FAIL / NOT_RUN.
