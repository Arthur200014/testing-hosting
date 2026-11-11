# TEACHER AI STUDENT — current handoff

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-11
**ACTIVE_TASK:** none
**ACTIVE_BRANCH:** none
**CURRENT_PHASE:** P02 (focused lesson contract)
**LAST_COMPLETED_TASK:** P01-05 (working technical MVP mechanics scope; no pedagogical pilot)
**LAST_TASK_COMMIT:** `e939cd9bd3a23a8c919438a5451ea88acc930bd3`
**NEXT_ACTION:** P02-05
**STATUS:** READY_TO_START

## Verified in this continuation

- **P00-04/P00-05:** [roadmap reconciliation](https://github.com/Arthur200014/testing-hosting/commit/40cda70cc653b3704d1767110e56dbbdfefc993d) completed; 92 original IDs kept, partial modules marked PARTIAL, production/GAS/Firebase restrictions retained.
- **Gate G00 (isolated baseline):** [57/57 PostgreSQL tests + startup/health/auth smoke PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/42997203038); prod/staging/browser **NOT_RUN**. P00 stage checklist checked with actual evidence.
- **Lean workflow:** obsolete mandatory plan/test-matrix decisions superseded by D012; root `AGENTS.md` governs.
- **P01-05:** [MVP mechanics scope](https://github.com/Arthur200014/testing-hosting/blob/main/docs/architecture/lesson-mechanics-mvp.md): 8 typed reusable math mechanics, first 5 prioritized, explicit answer formats and board controls. Design-only review PASS. Pedagogical pilot, actual renderers, and end-to-end validation **NOT_RUN**; full G01 remains open.

## Next concrete step

**P02-05:** define a strict, versioned `LessonDefinition` v1 contract and event/API boundaries for the *first* `parameterGraph` lesson. Reuse `docs/architecture/lesson-mechanics-mvp.md` and existing `platform/` + `shared/interactive/v1/`; avoid new parallel runtime. Implement a machine-validatable schema with one small synthetic example and focused validation tests if the contract code changes. No teacher/learner private data, production writes, or public page changes.

Then proceed to the reusable renderer `P08-01/P08-04`. This focused work does not imply all of G01/G02 or the entire P02 phase are accepted.

**Rules:** Read only necessary files. No broad repository or EGA/OGA scans. Preserve legacy GAS/Firebase defaults and public URLs. Report actual PASS / FAIL / NOT_RUN and commit.
