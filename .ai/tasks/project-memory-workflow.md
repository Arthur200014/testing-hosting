# Task-scoped project memory workflow

Status: DONE

## Goal

Add compact context loading, task memory, and architecture memory guidance to the
existing Codex workflow.

## Scope

`AGENTS.md`, `.ai/`, and `docs/architecture/` documentation.

## Non-goals

Application behavior, Codex skill implementations, and external memory services.

## Current state

The existing workflow rules on `main` remain unchanged. The context policy and
memory entry points have been verified locally.

## Decisions

Current code on `main` wins over task memory. Task files are short navigation
notes; architecture files hold lasting verified decisions.

## Relevant files

`AGENTS.md`, `.ai/START_HERE.md`, `.ai/CONTEXT_MAP.md`,
`.ai/tasks/README.md`, `.ai/tasks/_TEMPLATE.md`,
`.ai/tasks/project-memory-workflow.md`,
`docs/architecture/README.md`, `docs/architecture/_TEMPLATE.md`.

## Completed

- Confirmed the top-level `EGA/` and `OGA/` areas with shallow inspection.
- Added the new documentation without changing application files.
- Verified the original `AGENTS.md` content is preserved byte for byte.
- Verified all changed files are in scope and contain no detected secret values.

## Current step

No active implementation step; documentation and checks are complete.

## Next step

For a future substantial task, create or continue its own task file.

## Verification

`git diff --check` passed. The diff contains eight expected documentation files;
`.codex/`, `EGA/`, `OGA/`, and `README.md` are unchanged. Secret scan passed.

## Open questions / risks

None identified.

## Last updated

2026-10-04: Verified and completed the context and project memory setup.
