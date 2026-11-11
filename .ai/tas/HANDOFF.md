# TEACHER AI STUDENT — HANDOFF

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-11
**CURRENT_PHASE:** M02 (managed Timeweb App Platform + managed PostgreSQL)
**ACTIVE_TASK:** M02-02 (verify pending EF migrations on real cloud database)
**ACTIVE_BRANCH:** none
**LAST_PROGRESS_COMMIT:** `442cf5d8d74b39993c65b4a4f91fc7e8ee0fac33` ([PR #8](https://github.com/Arthur200014/testing-hosting/pull/8))
**NEXT_ACTION:** M02-02
**STATUS:** PARTIAL — bounded migration check + 68/68 CI PASS; Timeweb migration status still unknown

## What is verified
- User supplied actual Timeweb app deployment log: **Deploy succeeded**, 2026-11-11 22:17:41 (after temporarily removing deploy health-check path); new container on port 8080, managed web-server configured. User subsequently reported **Healthy** at both HTTPS `/health/live` and `/health/ready`; thus API process and DB connectivity operational **per user**, not independently probed by assistant.
- This is an existing Timeweb **App Platform** app `Platform lms`, Dockerfile `/platform`, using a separate managed private PostgreSQL cluster. **Do not create a new VPS, Docker Compose, Caddy or PostgreSQL**; `compose.staging.yaml` is the unused alternative VPS path.
- [M02-02 PR #8](https://github.com/Arthur200014/testing-hosting/pull/8) merged: migration-health requests now have 4s query and 6s outer limits, safe exception-type logging, no DB writes. [68/68 isolated PostgreSQL integration tests PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43090374884), including blocked history returning 503 promptly; [scoped gate PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43090374899). The user reported HTTP 502 on old `/health/migrations` while `/health/live` and `/health/ready` both showed Healthy. Exact Timeweb cause still not proven; rerun after PR #8 auto deploy.
- [M02-02 PR #7](https://github.com/Arthur200014/testing-hosting/pull/7) merged: new read-only `/health/migrations` checks pending EF migrations against DB migration history; [67/67 isolated PostgreSQL integration tests PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43087810977), [backend CI gate PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43087810955). Does not auto-migrate, disclose schema/secret details, or alter manage.
- Source migration blockers from M01-04 (10 malformed assignment rows, 5 orphan refs, 3 incomplete student rows) remain; parные занятия intentionally have one lesson with multiple student participants. No real data migrated or teacher manage API wired.
- **Security:** user previously posted actual PostgreSQL URI/password in chat; rotation in Timeweb and connection-string update **NOT CONFIRMED**. Do not repeat/log/store password.
- Timeweb's **deploy health check path** `/health/live` was temporarily cleared to diagnose failed deploy; API route still exists. Leave server controls unchanged until troubleshooting why original Timeweb probe failed; do not equate successful deploy with health-check-enabled verification.

## Next concrete action
1. After Timeweb auto-deploys latest `main` (PR #8), open `https://arthur200014-testing-hosting-8c4e.twc1.net/health/migrations`. Expect `Healthy` (no pending EF migrations), `Unhealthy`/HTTP 503 (pending/history blocked/error, inspect sanitized app logs), or HTTP 502 (Timeweb proxy/connection still failing, inspect request logs). A 404 means old version. Do not claim migrations applied from `/health/ready`.
2. If `Healthy`, application migrations are already applied; confirm via actual endpoint before M02-02 completion. If `Unhealthy`, require a backup (M02-03) BEFORE `dotnet Platform.Api.dll --migrate` via the now-working private Timeweb container console (if accessible). Do not open public /migrate or DB port; never guess tables or run silent live writes.
3. Rotate exposed DB credential and update Timeweb secret, confirm API ready again; ensure M02-01 security gate. Investigate Timeweb native health probe prior to re-enabling it.
4. M02-03 backup and test restore, then M03 source repairs/official importer dry-run, staged import, M04 tenant-protected teacher API + unchanged `manage.html`, M05 owner-approved cutover.

Read `docs/deployment/timeweb-managed-migrations.md` and current code; avoid broad repo scan. Preserve existing GAS, live students and paired lesson semantics.
