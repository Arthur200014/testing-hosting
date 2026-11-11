# TAS — save and resume long tasks

Checkpoint is recovery insurance, not a mandatory timer or a sign that code works.

## When
- Small completed change: one verified commit on `main`; no task branch or planning commit needed.
- Long, risky or interruptible change: use `tas/<TASK_ID>`. If HANDOFF already names an active branch, resume it instead of creating a second one.
- Save after a **meaningful implemented milestone**, before context exhaustion, or before ending an unfinished chat; not every 3–5 minutes.

## Before a long change
Read `.ai/tas/HANDOFF.md` on `main`; determine the task and current branch. If creating a task branch, record `ACTIVE_TASK`, `ACTIVE_BRANCH`, and `NEXT_STEP` in the main HANDOFF pointer. A planning commit and template-based task card are optional, not blockers to implementation.

## At a checkpoint
1. Review changed paths and relevant diff; exclude unrelated files, secrets and student data.
2. Commit + push the actual work to the task branch; mark incomplete work `IN_PROGRESS` and unexecuted checks `NOT_RUN`.
3. Record branch, last commit (or `HEAD` if still being committed), paths, real verification status, and **one concrete NEXT_STEP** in its HANDOFF.
4. Do not merge high-risk, unverified implementation into production/main.

## At resumption
Read the main HANDOFF pointer, then the current task branch's latest HANDOFF and relevant changed code. Trust actual Git state over outdated notes. Continue from NEXT_STEP, not from a fresh audit.

## At completion
Run applicable targeted checks, integrate safely to `main` without force push, and update the main HANDOFF: clear `ACTIVE_BRANCH`, record commit and the next roadmap action. Update task boards or test reports only where they actually carry useful new information.

Never claim a pushed checkpoint was tested, deployed, or completed without evidence. Do not write tests against real students.
