# TEACHER AI STUDENT — HANDOFF

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-11
**CURRENT_PHASE:** M02 (staging / private PostgreSQL / API server)
**ACTIVE_TASK:** M02-01 (real VPS deployment pending)
**ACTIVE_BRANCH:** none — reviewed staging configuration merged to `main`
**LAST_COMPLETED_TASK:** M01-04 (live Sheets read-only audit)
**LAST_PROGRESS_COMMIT:** `9d06c1e21a1859211c66194eef5989e4f36c96ba` (PR #6)
**NEXT_ACTION:** M02-01 (finish on real host; config done, server unverified)
**STATUS:** PARTIAL — config CI PASS, remote VPS/DNS/TLS/health NOT_RUN

## Verified work
- **M02-01 configuration:** [PR #6](https://github.com/Arthur200014/testing-hosting/pull/6) merged. Adds `compose.staging.yaml` with internal-only PostgreSQL network, API private+ingress, public HTTPS Caddy (80/443), `.env.staging.example` with synthetic placeholders and ignored private env, safe preflight + [VPS deployment runbook](https://github.com/Arthur200014/testing-hosting/blob/main/docs/deployment/tas-staging.md).
- [Staging config workflow](https://github.com/Arthur200014/testing-hosting/actions/runs/43019796458): **PASS** Docker Compose topology, Caddy syntax, rejection of placeholders, acceptance of random synthetic secrets. No live server was contacted.
- **Paired lessons:** owner confirmed identical `lessonId` across students is normal. The migration model is now explicit: one `Lesson` per workspace/lessonId, several `LessonParticipant` records per student with individual attendance/status; no deduplication by lessonId across participant rows. Updated `M03-02`, checklist, source-audit note and tenant model.
- **M01-04 source blockers still pending M03:** 10 structurally invalid homework assignment rows, 5 orphan references, 3 incomplete student rows; report at `docs/architecture/sheets-source-audit-2026-11-11.md`. No XLSX apply or production writes.

## Next action
**M02-01:** Real deployment requires a server with **authorized SSH or cloud-console access**, an actual staging DNS name and Docker Compose v2. Previous Timeweb attempt was BLOCKED and there is **no verified server connection in this chat**. Follow `docs/deployment/tas-staging.md` on the chosen VPS: create private env on host, run preflight, start private PostgreSQL, run migrations, start API + Caddy, verify public HTTPS `/health/live`, `/health/ready`, DB port 5432 not published. Never upload credentials to Git or chat. Do not mark M02-01 DONE based on local CI.

Then M02-02 repeatable startup/health and M02-03 backup+restore; M03 data migration dry-run/reconciliation; M04 tenant-scoped teacher API + existing `manage.html`; M05 owner-approved cutover. Until then **Google Sheets/GAS remains production**. New universal admin, AI, interactives are deferred.

**Constraints:** Read only relevant repo files; use existing ASP.NET Core 10 / PostgreSQL 17, preserve multi-tenant/multi-subject and paired session model; no unrelated UI, student data, production settings or secrets.
