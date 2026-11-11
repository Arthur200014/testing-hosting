# TAS task card — optional template for multi-stage work

Use only when the task is complex enough to benefit from a persistent checklist. Small changes do not need a task card or planning commit.

**TASK_ID:** Pxx-yy
**STATUS:** TODO / IN_PROGRESS / BLOCKED / DONE
**BRANCH:** main or tas/Pxx-yy
**LAST_COMMIT:** <published SHA or none>
**NEXT_STEP:** <one concrete action>

## Outcome
What observable result should work for the teacher/student?

## Scope
Relevant paths and existing dependencies. List any areas that must not change.

## Existing baseline
Only verified facts about code that already exists. Link to older audit/architecture notes instead of copying them.

## Implementation
- [ ] Main change
- [ ] Necessary follow-up / compatibility
- [ ] Relevant verification and publication

## Verification
Write only checks useful for this feature. For each, record: command or browser scenario, PASS / FAIL / NOT_RUN, and important limitation. No mandatory four-case matrix.

## Recovery
Changed files, actual remote commit and one concrete NEXT_STEP. Keep entries short; old detailed evidence may remain in Git history or linked reports.

Do not mark high-risk behavior as production-verified without running its required checks. Never record invented test outcomes.
