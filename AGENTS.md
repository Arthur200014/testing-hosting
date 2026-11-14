# Engineering workflow — result first

## Goal and priorities
Deliver working changes to the existing repository with the least necessary context, tool calls, documentation, and tests. The actual Git code is the source of truth. Prefer implementation over planning paperwork. Do not mistake a committed change for a verified one.

## Scope and context
- For TEACHER AI STUDENT (TAS), first read `.ai/tas/HANDOFF.md` on `main`; resume `ACTIVE_BRANCH` if present, otherwise use `NEXT_ACTION`. The active product queue is `.ai/tas/RELEASE_PLAN.md`; old Mxx/Pxx boards are historical. For Meleto UI work, use `.ai/tas/MELETO_REFERENCE.md` and only the relevant screen IDs.
- Use `.ai/CONTEXT_MAP.md` to find files; read only related code, dependencies, and existing tests. Never scan all `EGA/`, `OGA/`, or `platform/` just to start.
- Prefer symbol searches and bounded line ranges. Do not print large source files, full logs, JSON API responses, or whole diffs into chat. Fetch/process large files inside a tool call and return only findings.
- Avoid rereading unchanged code. If source or instructions disagree with a stale handoff, verify in Git and correct the pointer.

## Context budget — mandatory
- Start with `AGENTS.md` + `HANDOFF.md`. Read the plan/checklist only for the active stage and open architecture/history documents only when the current code leaves a real question. Do not preload background “just in case”.
- Search first (`rg`, symbols, route names, selectors), then read bounded regions around matches. For a large HTML/JS/C# file, never request the whole file when the relevant component/function can be located. Initial discovery should normally touch only the files named by `NEXT_ACTION`.
- For Meleto, open only the current 1–2 PNGs and their JSON records. Do not load the 74 screenshots, the whole PDF, or the complete screen catalog into a model turn.
- Never paste an entire file, generated site, repository tree, diff, test log, database response, network trace, or screenshot manifest into chat or a handoff. Process it in the tool/runtime and report paths plus a short finding. Use `git diff --stat`/`--name-only` and targeted hunks instead of a full diff.
- One turn targets one reviewable scenario, not the whole site. Reuse existing components and perform the edit before optional research. Do not create parallel agents, broad audits, speculative refactors, duplicate documentation, or plan-only commits for an ordinary UI task.
- Run the smallest relevant check once; expand or rerun only after a failure or a material risk. Do not run the whole repository suite, build new test infrastructure, or create cosmetic tests for a scoped UI change.
- Keep progress updates, commit messages, HANDOFF and the final report compact. Save only information needed to resume: outcome, changed paths, actual checks, blocker if any, and one concrete next step.

## Implementation
1. Identify one concrete outcome and the minimal files required.
2. For ordinary changes, implement directly. No mandatory task packet, Jev call, subagent, architectural report, detailed test matrix, or planning commit.
3. Use existing patterns/components; preserve compatibility. Do not refactor unrelated features.
4. Inspect only the changed regions and affected interfaces; check for accidental changes, secrets, and sensitive data.
5. Run the minimum *relevant* verification described below, fix actual failures, and publish a coherent commit. For simple complete work, one commit on `main` is fine.
6. After every completed task, send a concise chat report with: what was done, changed paths, actual checks (PASS / FAIL / NOT_RUN), problems or limitations, commit link, and the next step written to HANDOFF. Do not reproduce code or diffs already stored in Git.

Additional research, architecture review, independent review, and agents are **optional** and justified only by genuine complexity or risk. Never attempt a missing SDK integration merely to satisfy process.

## Proportionate verification
- **Docs, copy, CSS, small visual tweaks:** check changed content/syntax and visual behavior when a browser is available. Do not create automated tests purely for cosmetics.
- **UI controls, mathematical graphs, local JavaScript:** test the changed scenario and any directly related existing behavior; reuse existing tests. For math, validate representative values/constraints where relevant.
- **Backend, API, storage, data migrations:** run focused existing tests and add a small regression test when logic changes and the test can be run.
- **Auth, student scores, concurrency, realtime, Firebase/GAS integrations:** verify high-risk success/failure paths and focused regression/integration behavior; use isolated synthetic data, not live student records.
- Do not run a whole repository suite for a local change. Do not build new test infrastructure unless needed to establish correctness for the actual task.
- Record unavailable checks as NOT_RUN. For a low-risk change, a documented limitation need not block publishing. For a high-risk, unverified change, keep it on a task branch and report the blocker; do not call it production-verified.

## Git and continuation
- Before writing, verify the current target branch and file revision. Never overwrite concurrent edits, use force-push, or include unrelated files.
- Small complete changes: commit + push once. For a long or interrupted TAS task, resume/use `tas/<TASK_ID>` and checkpoint **after meaningful milestones or before context exhaustion**, not every 3–5 minutes.
- Keep `.ai/tas/HANDOFF.md` short: task, status, branch, last published commit, changed paths, next actionable step, and true verification status. Update it when task state changes or recovery requires it.
- `.ai/tas/TASK_BOARD.md`, `.ai/tas/TEST_RESULTS.md`, phase checklists, and `.ai/tasks/` are references or optional detailed evidence, not mandatory edits on every small change.
- Use a short task card only for a complicated, multi-stage task that benefits from checkpointing. Detailed background stays in the relevant task/architecture document, not in HANDOFF.

## Safety and public compatibility
Do not change public URLs, unrelated lessons, UI styling, Firebase, Google Apps Script, database schemas, production configs, or live student data unless the task requires it. Never commit secrets or personal student records. Preserve existing behavior and avoid production test writes. During the Meleto UI rebuild, never delete live students or boards, change passwords, rerun completed imports, or switch the production writer as an incidental UI task. Do not claim tests, browser checks, deployment, or push succeeded without verifying them.
