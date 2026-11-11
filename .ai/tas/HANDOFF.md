# TEACHER AI STUDENT — current handoff

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-11
**ACTIVE_TASK:** none
**ACTIVE_BRANCH:** none
**CURRENT_PHASE:** P00
**LAST_COMPLETED_TASK:** P00-02 (isolated backend startup/tests, not deployment)
**LAST_TASK_COMMIT:** `fdca474a0e9824103eba41a9fa3c2fb81b0ffaba`
**NEXT_ACTION:** P00-03
**STATUS:** READY_TO_START

## Verified result
P00-02 fixed vulnerable transitive `System.Security.Cryptography.Pkcs 9.0.0`
by pinning patched `10.0.14` without disabling NuGet audit.
An isolated Docker Compose smoke now verifies PostgreSQL migrations,
API `/health/live`, `/health/ready`, generic `401` for fabricated
student credentials and `401` for unauthenticated attempt writes.

- [Integration + startup CI](https://github.com/Arthur200014/testing-hosting/actions/runs/42997203038): **57/57 PASS** and **startup smoke PASS** on GitHub runner.
- [TAS task CI](https://github.com/Arthur200014/testing-hosting/actions/runs/42997203340): backend PASS, gate PASS.
- Production/staging deployments, real users and browser workflow: **NOT_RUN**.
- No migration of real students, GAS/Firebase change or production cutover.

## Next concrete step
P00-03: check that current TAS documents and README/START_HERE links
resolve, fix only broken references. Do not re-create the archive.
Then proceed with planned remaining P00 gates and the reusable
interactive lesson vertical slice. Keep the fast workflow in `AGENTS.md`.

The P03-04 broader frontend/shared CI is not accepted solely based on these
backend checks; its earlier failures require separate targeted resolution.
