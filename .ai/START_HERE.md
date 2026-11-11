# AI project entry point

This is an existing education repository. Do not start by scanning it.

## Quick start
1. For TEACHER AI STUDENT, read `.ai/tas/HANDOFF.md` on `main`. If `ACTIVE_BRANCH` is set, resume that branch and read its newer HANDOFF; otherwise take `NEXT_ACTION`.
2. Use `.ai/CONTEXT_MAP.md` to locate the relevant code, tests and dependencies. Read specific paths and bounded ranges, not complete directories.
3. If necessary, consult the current task's section in `.ai/tas/TASK_BOARD.md`, its existing `.ai/tasks/tas-<ID>.md` card and the relevant phase/architecture notes. Skip documents that do not affect the implementation.
4. Follow `AGENTS.md`: implement the requested result, test proportionately, commit, and record a minimal handoff.

## Source precedence
Current Git code > accepted architectural decisions > active task card / HANDOFF > old notes or external semantic memory.

## Where detailed history lives
- `.ai/tasks/` — task-specific implementation history (read one relevant item, not all).
- `docs/architecture/` — stable design and migration decisions.
- `.ai/tas/TASK_BOARD.md` and `PHASE_CHECKLISTS.md` — roadmap and dependencies; consult only the necessary section.
- `.ai/tas/NEW_CHAT_PROMPT.md` — short continuation prompt.

Planning commits, exhaustive test matrices, repeated full diffs, multi-agent orchestration and broad folder scans are not required. Never assume a planned feature is absent without checking its actual module. Existing GAS/Firebase pages remain in use unless a task explicitly migrates them.
