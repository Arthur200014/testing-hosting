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
