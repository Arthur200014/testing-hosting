# TEACHER AI STUDENT — current handoff

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-11
**ACTIVE_TASK:** none
**ACTIVE_BRANCH:** none
**CURRENT_PHASE:** P00
**LAST_COMPLETED_TASK:** P00-01 (targeted audit, not runtime verification)
**LAST_TASK_COMMIT:** `3f3a2e468cfb2af2ccb8fe0ac317630abd0dcd02` (main merge of P00-01)
**NEXT_ACTION:** P00-02
**STATUS:** READY_TO_START

## Next concrete step
P00-02: verify reproducibility of the existing ASP.NET Core/PostgreSQL backend with the available isolated runner (startup, dependencies, focused baseline tests). Record actual PASS/FAIL/NOT_RUN, then continue toward the lesson vertical slice. Do not redo P00-01 audit.

## Known evidence and blockers
- P00-01 audit: existing backend, shared runtime, GAS/Firebase compatibility documented in `.ai/tasks/tas-P00-01.md`.
- CI selector run [42990977589](https://github.com/Arthur200014/testing-hosting/actions/runs/42990977589): 12/12 PASS **for selector only**, not backend or browser functionality.
- Older broad smoke run [42990533464](https://github.com/Arthur200014/testing-hosting/actions/runs/42990533464) found pre-existing shared test failures and NuGet warnings. Do not present them as fixed.
- Backend runtime / Docker / browser checks were **NOT_RUN** in P00-01. P03-04 broader CI remains partial/blocked.

## Continuation rules
Read `AGENTS.md` and `.ai/CONTEXT_MAP.md`; then only the code/tests needed for P00-02. Consult task board/phase docs if a dependency is unclear. Resume an existing ACTIVE_BRANCH first.

For an unfinished task, keep a compact record here (and on its branch where applicable): task ID, branch, latest pushed SHA, changed paths, verification status, blocker, and one next step. Detailed logs and past checklists live in task files and Git history, not here.

**Priority:** reusable interactive lessons -> AI-curated content -> homework/checking -> student knowledge and next step. Avoid unrelated CRM work during this product slice.
