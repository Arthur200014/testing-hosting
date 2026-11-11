# TEACHER AI STUDENT — current handoff

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-11
**ACTIVE_TASK:** P00-02
**ACTIVE_BRANCH:** tas/P00-02
**CURRENT_PHASE:** P00
**LAST_COMPLETED_TASK:** P00-01
**NEXT_ACTION:** P00-02
**STATUS:** IN_PROGRESS — CI runtime evidence pending

## Current checkpoint
P00-02 verifies reproducible ASP.NET Core 10/PostgreSQL 17 startup.
The previous backend CI failed on NuGet advisory NU1902/NU1903 for
transitive `System.Security.Cryptography.Pkcs 9.0.0`.
The task branch pins patched `10.0.14` while retaining vulnerability checks,
and adds a disposable Docker Compose startup/health/auth smoke to existing
PostgreSQL integration CI.

## Next concrete step
Inspect GitHub Actions on `tas/P00-02`: both backend test suite and
startup smoke must PASS before marking P00-02 DONE and merging to main.
If still failing, fix only verified backend issues, keep branch active, and
update honest PASS/FAIL/NOT_RUN evidence. No live student data and no
production cutover. Then proceed toward the interactive lesson vertical slice.

**Previous evidence:** [selector-only CI](https://github.com/Arthur200014/testing-hosting/actions/runs/42990977589)
12/12 PASS; [old backend failing CI](https://github.com/Arthur200014/testing-hosting/actions/runs/42990533464).
