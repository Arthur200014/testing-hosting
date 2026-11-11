# TEACHER AI STUDENT — HANDOFF

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-11
**CURRENT_PHASE:** M02 (managed Timeweb App Platform + managed PostgreSQL)
**ACTIVE_TASK:** M02-03 (verify Timeweb PostgreSQL backups and isolated restore)
**ACTIVE_BRANCH:** none
**LAST_PROGRESS_COMMIT:** `442cf5d8d74b39993c65b4a4f91fc7e8ee0fac33` ([PR #8](https://github.com/Arthur200014/testing-hosting/pull/8))
**NEXT_ACTION:** M02-03
**STATUS:** M02-02 DONE (owner-confirmed cloud migrations + health PASS); M02-03 pending independent backup/restore verification

## What is verified
- User supplied actual Timeweb app deployment log: **Deploy succeeded**, 2026-11-11 22:17:41 (after temporarily removing deploy health-check path); new container on port 8080, managed web-server configured. User subsequently reported **Healthy** at both HTTPS `/health/live` and `/health/ready`; thus API process and DB connectivity operational **per user**, not independently probed by assistant.
- This is an existing Timeweb **App Platform** app `Platform lms`, Dockerfile `/platform`, using a separate managed private PostgreSQL cluster. **Do not create a new VPS, Docker Compose, Caddy or PostgreSQL**; `compose.staging.yaml` is the unused alternative VPS path.
- [M02-02 PR #8](https://github.com/Arthur200014/testing-hosting/pull/8) merged: migration-health requests now have 4s query and 6s outer limits, safe exception-type logging, no DB writes. [68/68 isolated PostgreSQL integration tests PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43090374884), including blocked history returning 503 promptly; [scoped gate PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43090374899). The user reported HTTP 502 on old `/health/migrations` while `/health/live` and `/health/ready` both showed Healthy. Exact Timeweb cause still not proven; rerun after PR #8 auto deploy.
- [M02-02 PR #7](https://github.com/Arthur200014/testing-hosting/pull/7) merged: new read-only `/health/migrations` checks pending EF migrations against DB migration history; [67/67 isolated PostgreSQL integration tests PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43087810977), [backend CI gate PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43087810955). Does not auto-migrate, disclose schema/secret details, or alter manage.
- 2026-11-11: owner ran `dotnet Platform.Api.dll --migrate` in the Timeweb app console; uploaded logs show all EF migrations through `20261111120000_TeacherSessions` applied and history rows inserted. Owner subsequently confirmed public HTTPS `/health/migrations` **Healthy**, along with previously verified `/health/live` and `/health/ready` **Healthy**. This verifies no pending EF migrations for current deployed binary, not full schema integrity or historical data import. M02-02 DONE. Native Timeweb deploy health probe remains disabled and should be revisited during M02-03.
- Backup: owner discussed daily backups and manual backup, but **completed backup and restore are NOT independently confirmed**; require evidence before any data-import writes.
- Source migration blockers from M01-04 (10 malformed assignment rows, 5 orphan refs, 3 incomplete student rows) remain; parные занятия intentionally have one lesson with multiple student participants. No real data migrated or teacher manage API wired.
- **Security:** user previously posted actual PostgreSQL URI/password in chat; rotation in Timeweb and connection-string update **NOT CONFIRMED**. Do not repeat/log/store password.
- Timeweb's **deploy health check path** `/health/live` was temporarily cleared to diagnose failed deploy; API route still exists. Leave server controls unchanged until troubleshooting why original Timeweb probe failed; do not equate successful deploy with health-check-enabled verification.

## Next concrete action
1. M02-03: confirm a **completed Timeweb PostgreSQL backup** and retention; verify restore **into a separate isolated test database**, never overwrite the live `default_db`. Until evidence exists, backup/restore gate remains open.
2. Rotate previously exposed PostgreSQL password in Timeweb and update the app's secret; confirm `/health/ready` Healthy afterwards. Check private network access and native Timeweb deploy health probe without disrupting healthy public endpoints.
3. Only after backup/restore, proceed to M03 source blockers and controlled import dry-runs; no live student writes without explicit cutover approval. Preserve current GAS and `EGA/config/manage.html`.

Read narrow task instructions and Timeweb runbook only. Avoid broad repo scans. Preserve paired lesson semantics.
