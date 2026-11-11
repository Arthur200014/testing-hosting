# TEACHER AI STUDENT — current handoff

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-11
**ACTIVE_TASK:** none
**ACTIVE_BRANCH:** none
**CURRENT_PHASE:** M01 (migration-first)
**LAST_COMPLETED_TASK:** M01-03 (teacher login baseline, PostgreSQL-backed revocable sessions)
**LAST_TASK_COMMIT:** `2e2fbc1d70c44c0e089077f7bed1f7ca71e70749` (PR #5 squash merge)
**NEXT_ACTION:** M01-04
**STATUS:** READY_TO_START

## Verified
- M01-01: [current manage + Google Sheets → PostgreSQL matrix](https://github.com/Arthur200014/testing-hosting/blob/main/docs/architecture/manage-postgres-coverage.md): five actual GAS calls in `EGA/config/manage.html`; historical inventory 20 sheets (including archive/service).
- M01-02: [multi-subject, multi-teacher model](https://github.com/Arthur200014/testing-hosting/blob/main/docs/architecture/tenant-subject-model-v1.md) is design-only; new subject/enrollment EF migrations **NOT_RUN**.
- M01-03: [PR #5](https://github.com/Arthur200014/testing-hosting/pull/5) merged. Real ASP.NET API now supports `POST /api/v1/teacher-sessions`, `GET /api/v1/teacher/me`, `POST /api/v1/teacher-sessions/logout`; salted hash, initial owner via admin-only CLI, session expiry/revocation, DB-backed active role/tenant checks and login limiter. [66/66 PostgreSQL tests + API startup smoke PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43005907321), [TAS scoped CI gate PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43005907193). [Operations/limitations](https://github.com/Arthur200014/testing-hosting/blob/main/docs/architecture/teacher-auth-m01-03.md).
- This **does not** add teacher CRUD, real onboarding/invitations, password reset, manage login UI or production/staging deployment. No live data migrated. Existing `manage.html` still uses GAS; its persistent cache is not tenant-safe.
- Stage/prod live endpoints, restored backup, HTTPS, real Sheets import, browser teacher login **NOT_RUN**. Earlier Timeweb deploy BLOCKED; no production cutover.

## Next action — M01-04
Inspect latest available source snapshot **read-only** for all needed Google Sheets headers/rows and constraints, especially the 17 formerly blocked records in `ДЗ_Назначения` (older source audit: 83 total, 66 valid, 17 blocking). Compare with importers and document **aggregate diagnostics only**, without personal data or unapproved writes. Do not assume old row counts remain current. If access/file unavailable, record precisely and proceed with synthetic validation/repair plan rather than invent results.

Then M02 private PostgreSQL + staging API deployment, M03 controlled rehearsal/import, M04 protected `manage` adapter, M05 owner-approved cutover. M06 new universal admin and invites; M07 AI/interactive later. Follow `AGENTS.md` minimal-context process.
