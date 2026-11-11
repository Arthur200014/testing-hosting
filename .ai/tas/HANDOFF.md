# TEACHER AI STUDENT — current handoff

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-11
**ACTIVE_TASK:** none
**ACTIVE_BRANCH:** none
**CURRENT_PHASE:** P01 (focused interactive lesson path)
**LAST_COMPLETED_TASK:** P00-04 + P00-05 (roadmap reconciliation, production boundaries)
**LAST_TASK_COMMIT:** `605ecde3c471b67ed0bad7304100bdd7702b5414`
**NEXT_ACTION:** P01-05
**STATUS:** READY_TO_START

## Verified checkpoint
- P00-02: [PostgreSQL 57/57 + startup smoke PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/42997203038); [TAS backend gate PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/42997203340). Production/staging/browser flow **NOT_RUN**.
- P00-03: TAS documentation links and lean `AGENTS.md` workflow aligned.
- P00-04: `TASK_BOARD.md` reconciled (92 task IDs preserved; 14 rows updated). Existing platform identity, migrations, homework and shared board modules marked **PARTIAL**, not DONE. Backend CI PASS does not close P03-04/full RBAC or frontend gates.
- P00-05: public URL, GAS/Firebase, real student data and production cutover restrictions already enforced by `AGENTS.md`, root/TAS README.
- P00 **G00 PASS for isolated baseline** in `PHASE_CHECKLISTS.md`. `DECISIONS.md` D012 supersedes obsolete planning mandates D009/D010.

## Next concrete step
**P01-05:** define a compact set of 5–10 reusable math interaction mechanics, input/answer types, and minimum board controls, grounded in existing `shared/interactive/v1/` and teaching examples. Prioritize graph parameters, geometry and probability; write implementable contract without redoing infrastructure or scanning all EGA/OGA. Keep user approval/pilot evidence separate from an internal draft.

Then plan `LessonDefinition` versioned contract (`P02-05`) and reusable renderer (`P08-01...`). Use existing runtime and backend, not a parallel application.

**Safety:** no real student writes or production switches. Only scoped verification and necessary tests. Do not reopen completed P00 without a concrete regression.
