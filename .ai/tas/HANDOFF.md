# TEACHER AI STUDENT — current handoff

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-11
**ACTIVE_TASK:** none
**ACTIVE_BRANCH:** none
**CURRENT_PHASE:** P00
**LAST_COMPLETED_TASK:** P00-03 (TAS documentation links and continuation rules)
**LAST_TASK_COMMIT:** `362ef0a75b04e2593fd8300abb068db1162255e9`
**NEXT_ACTION:** P00-04
**STATUS:** READY_TO_START

## Completed and verified

- **P00-02:** [PR #4](https://github.com/Arthur200014/testing-hosting/pull/4),
  merged in `d4bb04756de74020437e7f4db37ca4514722867b`.
  Patched NuGet transitive `System.Security.Cryptography.Pkcs` to `10.0.14`.
  [PostgreSQL integration + API startup CI](https://github.com/Arthur200014/testing-hosting/actions/runs/42997203038):
  **57/57 PASS**; migrations, live/ready, synthetic credential and unauthorized
  write 401 smoke **PASS**.
  [TAS scoped CI](https://github.com/Arthur200014/testing-hosting/actions/runs/42997203340):
  backend and gate **PASS**.
  Production/staging/browser flow **NOT_RUN**. No production cutover.
- **P00-03:** All documented TAS entry files are present in `.ai/tas/`,
  root README and `.ai/START_HERE.md` paths confirmed.
  Outdated mandatory plan-commits, test matrices, and frequent checkpoints
  were removed from `.ai/tas/README.md`; it now follows `AGENTS.md`.
  Documentation-only review PASS; runtime checks NOT_RUN.

## Next concrete step
**P00-04:** compare the relevant `TASK_BOARD.md` statuses against
already implemented modules and existing `.ai/tasks/` evidence. Preserve
task IDs, verify a small relevant subset at a time, and avoid traversing
all `EGA/`, `OGA/`, or `platform/`. Do not redo P00-01 audit.
The eventual product priority is the reusable interactive lesson slice.

For all work, use minimal scoped context, proportionate tests, and honest
PASS/FAIL/NOT_RUN. Existing GAS/Firebase pages and live student data remain
untouched. Earlier broad frontend/shared CI is not considered fixed by
backend-only PASS.
