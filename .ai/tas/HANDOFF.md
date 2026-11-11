# TEACHER AI STUDENT — HANDOFF

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-11
**CURRENT_PHASE:** M02 (staging/server PostgreSQL)
**ACTIVE_TASK:** none
**ACTIVE_BRANCH:** none
**LAST_COMPLETED_TASK:** M01-04 (live, read-only Google Sheets source inventory and diagnostics)
**LAST_TASK_COMMIT:** `934791515c142338300eb508f5750f5ac9324331`
**NEXT_ACTION:** M02-01
**STATUS:** READY_TO_START (server access unverified)

## Verified
- [M01-04 live source audit](https://github.com/Arthur200014/testing-hosting/blob/main/docs/architecture/sheets-source-audit-2026-11-11.md) confirms 20 sheet tabs, headers and current nonempty row counts (e.g. 35 student rows, 223 assignment rows, 317 lesson rows, 70 catalog rows). Read-only; **no real data exported/imported/written**.
- Source blockers: **10 distinct structurally problematic homework assignment rows** (23, 27, 29, 37, 45, 56, 89, 101, 104, 105), **5 orphan student references in assignment rows** (6–10, four distinct IDs), **3 incomplete student rows** (5, 9, 14). Old 17-row audit is outdated; 13 old rows no longer exhibit former basic errors. **M03 apply prohibited** until owner-reviewed corrections/quarantine and official importer dry-run.
- Also found legacy nullable test fields, repeated lesson rows for group attendance and older mock task results with missing points; preserve as unknown, **do not auto-fill zero**.
- M01-01 mapping, M01-02 subject-neutral model and M01-03 teacher auth remain as previously verified. [Auth CI 66/66 PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43005907321); this does **not** validate live source or server deployment.

## Next action — M02-01
Goal: **staging**, private PostgreSQL 17, ASP.NET Core API, secrets outside Git and TLS for external requests. Read `.ai/tasks/timeweb-deployment.md` and `compose.yaml` before changing only deployment files. Prior Timeweb attempt **BLOCKED** (failed deploy, precise cause unknown); owner subsequently prioritized server deployment, but host/domain/SSH access are **not yet verified**.

Proceed with secure, reproducible staging configuration and targeted Compose/CI checks. Do not claim a live server deployment without actual host access and health verification. Do not publish database port or passwords, and do not switch `EGA/config/manage.html` from GAS. M02-02 migrations/health and M02-03 backup+restore gates are separate.

**Priority:** PostgreSQL + server + existing manage through authenticated teacher API; later new universal multi-teacher/multi-subject admin; interactive lessons/AI parked. Use `AGENTS.md`, minimal scope, commit only verified changes.
