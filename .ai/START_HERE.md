# AI Project Entry Point

This repository contains many educational interactives. Do not scan the whole
repository to begin a task.

## Start order

1. Read `AGENTS.md`.
2. Read `.ai/START_HERE.md`.
3. If continuing a task, read only the relevant `.ai/tasks/<task>.md`.
4. Use `.ai/CONTEXT_MAP.md` to identify likely areas.
5. Search the repository for exact task-related paths or symbols.
6. Open only relevant source files, expanding when evidence requires it.

## Sources of truth

- Engineering rules: `AGENTS.md`.
- Current implementation: Git repository on `main`.
- Short-term task memory: `.ai/tasks/<task>.md`.
- Stable architectural decisions: `docs/architecture/`.
- Repository navigation: `.ai/CONTEXT_MAP.md`.

Task files are navigation memory, not replacements for current code. If they
disagree, current code wins; report the discrepancy. Never load the entire
repository merely to regain context.

## Continuing in another AI client

For ChatGPT or another coding assistant, provide the repository name and task
name, then instruct it to read `AGENTS.md`, `.ai/START_HERE.md`, and the relevant
`.ai/tasks/<task>.md`. Let it retrieve additional source files as needed.

## External semantic memory

An external system such as Supermemory may hold stable project facts,
architecture decisions, rejected approaches and reasons, or cross-session
summaries. It is not the source of truth for current code. Priority is:

current Git code > current accepted architecture docs > active task memory >
external semantic memory.

Retrieve only task-relevant memories; never bulk-ingest external memory into
context. No external memory service is required for this workflow.

## TEACHER AI STUDENT (TAS): scoped workflow

If the user task mentions TAS, the teacher platform, interactive lesson generation, AI curator, roadmap IDs `P00`–`P15`, or continuing a TAS task:

1. Read `.ai/tas/HANDOFF.md` **on main** first. If it names an `ACTIVE_BRANCH`, fetch that branch and read its newer `HANDOFF.md` before choosing a task. For no active branch, use the one `NEXT_ACTION`.
2. Read `.ai/tas/TASK_BOARD.md` **only for the task ID / current phase**, not the entire board.
3. Read `.ai/tas/PHASE_CHECKLISTS.md` **only for that phase**.
4. Read `.ai/tas/MASTER_TZ.md` only where requirements or scope need clarification.
5. Use `.ai/CONTEXT_MAP.md` and targeted file/symbol searches; inspect just the affected source files and tests.
6. For a task longer than 5 minutes, use `.ai/tas/CHECKPOINTS.md` and push task-scoped checkpoints to `tas/<TASK_ID>` after small milestones. Update the branch `HANDOFF.md`; only a fully verified result may move to `main`. Short completed tasks follow `AGENTS.md`.

Do not bulk-read `EGA/`, `OGA/`, `platform/` or all task memories.
The current `testing-hosting` implementation is partially built; roadmap TODOs require an audit before declaring functionality missing.
Start or resume with the paste-ready text in `.ai/tas/NEW_CHAT_PROMPT.md`.
