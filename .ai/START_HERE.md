# AI project entry point

This repository contains existing educational interactives and the TEACHER AI STUDENT platform. Start with the task pointer, not a whole-repository scan.

## TEACHER AI STUDENT — current route

1. Read `AGENTS.md` and `.ai/tas/HANDOFF.md` on `main`. Resume `ACTIVE_BRANCH` if set, otherwise execute `NEXT_ACTION`. Verify the actual branch HEAD and affected code before changing files.
2. [RELEASE_PLAN.md](tas/RELEASE_PLAN.md) defines the UI-01…UI-08 Meleto roadmap; [PHASE_CHECKLISTS.md](tas/PHASE_CHECKLISTS.md) defines acceptance. The owner chose teacher cabinet first and maximum visual fidelity. Old Mxx/Pxx task boards and the previous three-result release plan are historical.
3. [MELETO_REFERENCE.md](tas/MELETO_REFERENCE.md) links the visual archive/PDF. Use [MELETO_SCREEN_INDEX.md](tas/MELETO_SCREEN_INDEX.md) to open only the relevant PNGs/JSON. If the archive is unavailable, request it; do not invent visual evidence.
4. Use [CONTEXT_MAP.md](CONTEXT_MAP.md) to locate only relevant code, models, routes and tests. Build one working scenario, verify it proportionately, commit, and update HANDOFF with one concrete next step.
5. Work in context-saving mode from `AGENTS.md`: search before reading, use bounded line ranges, open only the current 1–2 reference images, and never send whole files/site sources/diffs/logs to chat. The normal model setting is GPT-6.1 Sol with medium reasoning.

## Source precedence

Actual code and Git state > safety and architecture decisions > current HANDOFF/active task > active release plan and reference images > old notes and semantic memory. If they disagree, verify and repair stale pointers.

Existing ASP.NET Core/PostgreSQL and the teacher/student pages should be reused. Existing GAS/Firebase pages may still be active; UI tasks do not silently switch the production writer. Preserve imported students and relationships; do not rerun imports, delete students/boards or change passwords.

## Other areas

`.ai/tasks/` contains task-specific history; `docs/architecture/` contains stable design decisions; `EGA/` and `OGA/` contain educational interactives. Search only relevant files. Do not read or summarize these collections unless `NEXT_ACTION` names a dependency. The continuation text to paste is [NEW_CHAT_PROMPT.md](tas/NEW_CHAT_PROMPT.md).
