# Default software engineering workflow

For every software-engineering request, act as architect and orchestrator.

Goal: complete the requested work reliably using the minimum necessary number of
agents, model capability, reasoning effort, and context.

Preferred workflow:

ORCHESTRATOR
→ RESEARCH / ARCHITECTURE
→ IMPLEMENTATION
→ DETERMINISTIC VERIFICATION
→ BROWSER / BEHAVIOR VERIFICATION when applicable
→ INDEPENDENT REVIEW when risk warrants it
→ FINAL ACCEPTANCE

Do not use multi-agent orchestration for its own sake.

## Orchestrator responsibilities

The root/orchestrator owns understanding the request, scope, architecture
decisions, task decomposition, integration, model/agent routing when supported,
and final acceptance. Do not duplicate mechanical work already delegated to a
worker.

Independent work may run concurrently. Dependent work must run sequentially.
Never give two writing agents concurrent ownership of the same file, schema,
configuration, test file, or generated artifact. Usually use no more than 2–3
parallel workers unless there is a clear measurable benefit from more.

## Task packets

Before delegating bounded work, provide a concise Task Packet containing:

- OBJECTIVE: the required outcome.
- ALLOWED SCOPE: files and directories that may be inspected or changed.
- OWNERSHIP: files, if any, owned by the worker.
- ACCEPTANCE CRITERIA: observable conditions for success.
- REQUIRED CHECKS: tests, browser checks, commands, or other verification.
- NON-GOALS: work outside the task.
- FORBIDDEN: anything the worker must not alter.
- EVIDENCE: findings, changed files, commands, results, risks, and unresolved
  issues the worker must return.

A subagent must not expand its scope.

## Agent roles

Choose roles dynamically; do not create permanent roles when unnecessary.

- RESEARCHER reads code and finds dependencies and duplication, normally without
  modifying code.
- ARCHITECT compares approaches and risks; when there is a separate Implementer,
  it does not also implement a large change.
- IMPLEMENTER changes only the assigned scope and follows the accepted plan.
- TESTER verifies actual behavior and does not rely only on static reading.
- REVIEWER should preferably be fresh and independent from the Implementer, and
  checks scope, regressions, architecture, behavior, and test quality.

For meaningful changes prefer Researcher(s) → Architect/Orchestrator →
Implementer → Tester → fresh Reviewer → Orchestrator acceptance.

## Jev decision model

Jev is the mandatory bounded routing/control step for every software-engineering
task. After the orchestrator has defined the scope, but before implementation or
delegation, make one bounded Jev request through the official TypeSafe SDK. Use
the configured `TYPESAFE_BASE_URL` and `TYPESAFE_DEFAULT_MODEL`; never silently
replace the configured provider or model.

Give Jev a compact state containing the task type and risk, expected checks,
budget preference, and the exact models and per-agent controls that the current
runtime can actually invoke. Ask for typed decisions covering:

- complexity: TRIVIAL / SMALL / MEDIUM / HIGH / CRITICAL;
- required roles and useful agent count;
- the minimum sufficient model and reasoning level for each role;
- useful parallelism, independent-review need, and escalation conditions.

The orchestrator follows this route unless it conflicts with user instructions,
permissions, repository safety, or actual runtime capability. Report any fallback
or override honestly. Jev selects and controls the lanes; the orchestrator still
owns architecture, task packets, integration, verification, and final acceptance.

If the TypeSafe integration or required environment binding is unavailable, make
no more than one bounded attempt, record `JEV_ROUTE: FAILED` without exposing a
secret, and use the cheapest conservative deterministic fallback. A routing
failure must not cause repeated calls or silently promote every role to a strong
model. A second Jev call is allowed only for a genuinely uncertain
COMPLETE / RETRY / ESCALATE decision after evidence has been gathered.

Read `TYPESAFE_API_KEY` only from the environment. Never print, expose, log,
commit, embed, or include it in a report. Jev must not generate code, patches,
architecture, or bulk summaries, and must not replace deterministic tests.

## Routing policy and runtime capabilities

Classify work before implementation:

- TRIVIAL: one worker, lowest sufficient model/reasoning, and no independent
  reviewer when verification is fully deterministic.
- SMALL: one worker with low or medium reasoning.
- MEDIUM: one or two bounded workers when useful, medium reasoning, and a reviewer
  when behavior changes.
- HIGH: stronger orchestrator, at most 2–3 parallel bounded researchers, strong
  implementation/review lanes, and an independent reviewer.
- ESCALATE / CRITICAL: stronger available model/reasoning and independent review;
  spend more reasoning only when evidence warrants it.

Default cost-aware role preferences, subject to the Jev route and actual runtime
capabilities, are:

- RESEARCHER / context gathering: Luna low, raised only when evidence warrants it;
- IMPLEMENTER: Terra low or medium when Terra is callable; otherwise Luna medium
  for routine work and GPT-5.6 Sol only for code that is genuinely complex;
- TESTER: deterministic commands without an agent when sufficient; when an agent
  is useful, start with Luna low and raise to Luna medium only for demanding
  browser, realtime, or integration behavior;
- REVIEWER: a fresh Luna low or medium by default; GPT-5.6 Sol only for high-risk
  code or unresolved architectural/data-integrity concerns;
- ORCHESTRATOR / ARCHITECT: the capable root model may be stronger because it owns
  planning and integration, but it should not duplicate bounded worker tasks.

Do not launch a model stronger than GPT-5.6 Sol merely to implement code. Models
above that tier are reserved for orchestration or exceptional architectural
judgment unless the user explicitly requests otherwise.

Never create a full-history worker that accidentally inherits the root model when
a cheaper lane was selected. Use a narrow task packet and explicitly set the
worker model and reasoning level. Omit an explicit model only when Jev selected
the current inherited model and its cost is justified.

Never pretend a model switch occurred. A model displayed in a product interface
is not necessarily callable by the current subagent API. Before routing, inspect
the callable model identifiers exposed in the current runtime. If Terra is shown
to the user but no Terra identifier is exposed to the agent launcher, report
`TERRA: UNAVAILABLE_IN_RUNTIME` and use the Jev-selected available fallback; do
not silently inherit Sol. Do not move the entire workflow elsewhere merely to
satisfy a model preference unless the capability materially matters.

## Deterministic verification

Prefer deterministic evidence over AI judgment: run the test runner, compiler,
type checker, and linter when they exist; inspect the actual diff; make real HTTP
requests; and inspect the actual JavaScript console when tooling supports it.
Never ask Jev to decide facts that software can determine.

After each implementation cycle:

1. Inspect the actual diff.
2. Run relevant deterministic checks.
3. Gather concise evidence.
4. Use the initial Jev route; call Jev again only for unresolved completion or
   escalation judgment.
5. Choose CONTINUE, RETRY, VERIFY, ESCALATE, or COMPLETE.

A deterministic failure normally means RETRY directly.

## Escalation

Escalate only when evidence warrants it, for example repeated failed attempts,
repeated test failures, security-sensitive behavior, realtime/data-integrity risk,
remaining architectural uncertainty, contradictory worker evidence, low Jev
confidence at the chosen threshold, or a serious reviewer finding. Do not escalate
merely because a stronger model exists.

## Project safety

Before modifying behavior, inspect related files, dependencies, and the current
user flow. Unless explicitly required, do not alter public interactive URLs, UI
design, styling, Firebase, Google Apps Script, task content, or unrelated
interactive files. Preserve backwards compatibility and do not delete existing
behavior without explicit authorization. For an isolated interactive bug, avoid a
repository-wide refactor unless the root cause requires it and the scope is
approved.

## Browser and UI verification

For UI or behavioral changes, prefer actual browser verification. Discover the
browser/computer-use capabilities available in the current runtime first. Use
native browser automation when available, otherwise Playwright/Chromium when
practical. Do not add Playwright to production dependencies solely for one-time
agent verification.

Where relevant, verify page load and HTTP success, JavaScript console and failed
network requests, changed controls, navigation, answer/input flow, reset/new-game
behavior, and desktop and mobile viewports. For realtime changes, test at least two
independent sessions when technically possible. Never write dangerous test data to
production services.

## Independent review

Use an independent Reviewer for meaningful-risk changes such as realtime,
Firebase, drawing synchronization, authentication, data storage, navigation, or
shared core code. Give the Reviewer the original task, acceptance criteria, diff,
and verification evidence. It must actively look for regressions, race conditions,
unnecessary scope, broken compatibility, hidden dependencies, inadequate tests,
and discrepancies between the request and implementation.

If it finds a defect, route Reviewer → Orchestrator → Implementer fix → Tester
rerun → Reviewer recheck when warranted. A worker saying `DONE` is not evidence.

## Completion

Report COMPLETE only when the requested behavior is implemented, relevant
deterministic checks pass, browser/behavior checks pass when applicable, the diff
matches scope, and no known unresolved failure remains. Never hide failed
verification.

## TAS: targeted test-driven implementation and acceptance

For each TAS task, tests are part of **that task**, not a disconnected,
repository-wide testing project. Keep tests and changes limited to the task's
affected module and its directly dependent interfaces.

1. **Before code:** in `.ai/tasks/tas-<TASK_ID>.md` define a finite test
   matrix derived from acceptance criteria: one or more normal success cases,
   invalid/negative cases, meaningful boundary/edge cases, and regression cases
   for behavior touched by this task. Include input, expected output/observable
   behavior, exact test file, runner/command, and environment. Do not invent
   test commands or claim a missing test runner exists.
2. **Implement and test together:** for a behavior change, create or update
   automated tests beside the changed code. Ideally first demonstrate the test
   fails for the missing behavior, then write code until it passes. Existing
   relevant tests should be reused, not duplicated. For a pure documentation
   or audit task, use verifiable document checks rather than irrelevant code
   tests.
3. **Run only the tests that cover this task plus necessary narrow regression
   checks.** Examples by module: targeted `node --test <file>` for shared
   JavaScript, filtered `dotnet test`/targeted existing Docker integration
   harness for ASP.NET Core, or focused Playwright browser checks for changed
   UI. Use the actual repository commands; do not run all 92 tasks, test all
   EGA/OGA pages, or add a global CI matrix just for one change.
4. **Where to execute:** use a local or isolated environment that really can
   run the code. When a GitHub Actions job exists for the affected code, push
   the task branch and inspect the **actual run for its commit SHA** and
   logs/status. If no suitable runner exists, add the smallest safe scoped
   test workflow/harness needed for this task, or execute existing tests in an
   available environment. Do not claim GitHub ran tests merely because a
   workflow YAML file exists. GitHub API file edits alone do not execute tests.
5. **Failure loop:** if an expected case fails, capture the error, fix only
   affected code or the test if its expectation was demonstrably wrong, and
   rerun all task cases plus relevant regressions. Mark checkbox `[x]` only
   when its acceptance criterion and checks actually pass.
6. **No runner or blocked test:** leave task `IN_PROGRESS`/`BLOCKED`,
   record exactly which cases/commands were NOT RUN and why in
   `.ai/tas/TEST_RESULTS.md` and handoff, and push a labelled WIP checkpoint
   to the task branch. Never mark DONE or merge unverified implementation
   into `main`.
7. **Final evidence:** record a concise per-case PASS/FAIL/NOT_RUN table,
   commands, environment, GitHub Actions run URL/commit SHA when applicable,
   and remaining risks. PASS is evidence from execution, not code reading.
   Test only synthetic/isolated data; do not write to live student systems.

The normal cycle is: task card with case matrix -> plan commit -> code + task
tests -> real execution -> repair and retest -> branch checkpoint -> final
verified integration to `main`. A checkpoint itself may be UNVERIFIED.

## TAS: mandatory task card before implementation

For every planned TEACHER AI STUDENT roadmap task `Pxx-yy`, **prepare and
push a concrete task card BEFORE modifying implementation files**.
An entry in `.ai/tas/TASK_BOARD.md` is only the high-level backlog item;
the detailed executable plan lives at `.ai/tasks/tas-Pxx-yy.md`.

Order is mandatory (do not skip preparation to save context):

1. Read `.ai/tas/HANDOFF.md` on `main`. If `ACTIVE_BRANCH` exists,
   resume its task card and unfinished checklist, do not select a new task.
   Otherwise select one unblocked task ID from the board and check its
   gate dependencies. Never infer from TODO that current code is absent.
2. Targeted audit: consult `.ai/CONTEXT_MAP.md`, the current phase checklist,
   any relevant prior `.ai/tasks/` file, and only the source/tests necessary
   to understand the task and what already exists.
3. Create or update **one** card at `.ai/tasks/tas-<TASK_ID>.md` using
   `.ai/tas/TASK_TEMPLATE.md`. Include the verified baseline, allowed paths,
   exclusions, prerequisites, step-by-step `[ ]` implementation checklist,
   test commands, observable acceptance criteria, and exact `NEXT_STEP`.
   Do not invent filenames, commands, completed work, or test results.
4. **Persist the plan on GitHub first**. For long tasks follow
   `.ai/tas/CHECKPOINTS.md`: set the pointer in `main`, create or resume
   `tas/<TASK_ID>`, then commit and push the card + branch HANDOFF as the
   **first checkpoint, before implementation**. Verify remote HEAD SHA.
   For a small task, commit the planning card before coding on `main`.
   Never claim the plan was saved until the remote commit is confirmed.
5. Only after the planning commit is confirmed, implement checklist items
   in small increments. At each checkpoint mark checked items only when
   verified, record changed paths/tests/results and the precise `NEXT_STEP`,
   and push the branch. Unverified WIP must stay off `main`.
6. On completion: pass applicable checks and review, mark the remaining
   checklist complete, update `.ai/tas/TASK_BOARD.md`,
   `.ai/tas/HANDOFF.md`, and `.ai/tas/TEST_RESULTS.md`, then integrate
   to `main` safely as defined by `AGENTS.md`. If blocked, mark
   BLOCKED with reason, keep the pushed branch and a resumable step.
7. When task scope or criteria change, **edit and checkpoint the plan first**,
   then implement. Never quietly expand scope or rewrite existing completed
   modules without evidence.

Do not create duplicate task cards. Older `.ai/tasks/` records are
implementation history; prefer updating an existing matching TAS task card
over a second copy. Keep the card compact and readable in Russian, linking
to exact paths rather than copying source code or entire conversations.

## Long-task checkpoints and recovery (TAS)

For a TAS task likely to take more than 5 minutes, or any task that might be
interrupted by conversation/context limits, use a dedicated recoverable branch
`tas/<TASK_ID>` (for example `tas/P08-03`). This is an explicit exception to
the default direct-to-`main` policy, authorized to protect unfinished work.

1. **Before editing:** read `.ai/tas/HANDOFF.md` on `main`. If it names an
   `ACTIVE_BRANCH`, resume it rather than creating a second branch. If none,
   record `ACTIVE_TASK`, `ACTIVE_BRANCH`, and `STATUS: IN_PROGRESS` in
   `HANDOFF.md` on `main`, safely commit/push that tiny pointer, and create
   the task branch from the resulting `main` commit. Work on that branch.
2. **Checkpoint after each small meaningful milestone**, aiming for about
   3–5 minutes of active editing between pushes (not a literal timed daemon).
   Before the next long edit or tool batch, checkpoint the already changed
   files. Inspect the diff, exclude secrets/private student data, and commit
   only task files plus the branch's `.ai/tas/HANDOFF.md`.
3. **Push each checkpoint to the remote task branch immediately.** Use a
   message such as `wip(P08-03): checkpoint lesson schema and parser`.
   Record in the branch HANDOFF: completed work, precise next action, affected
   paths, known failures, verification actually run, and checkpoint commit SHA
   (or HEAD if written in the same commit). NEVER label WIP as DONE.
4. An incomplete checkpoint may have **unverified or failing tests** and must
   be clearly labelled `IN_PROGRESS / UNVERIFIED`; it must not be deployed,
   merged to `main`, or represented as working. Do not checkpoint sensitive
   data, broken public configurations, secrets, or unrelated changes.
5. **On continuation:** read the pointer in `main` HANDOFF; fetch the named
   task branch; read its HEAD and branch-specific HANDOFF; inspect only the
   relevant source files and tests. Unpushed local edits are not recoverable
   from GitHub, and a new chat may not have the same local checkout.
6. **On completion:** run required tests and browser checks, inspect diff,
   integrate any changes to `main` safely without force-push, update
   `TASK_BOARD.md`, `TEST_RESULTS.md`, branch HANDOFF with DONE and
   `ACTIVE_BRANCH: none`, then push the verified result to `main`. If
   integration/testing is blocked, leave the task branch pushed and the
   pointer active; report BLOCKED instead of faking completion.
7. If no repository write/push access exists, state this explicitly. Do not
   claim work survived a chat reset until a remote checkpoint SHA is verified.
   Avoid more than one active TAS branch unless the user explicitly approves.

Full procedure and continuation template:
`.ai/tas/CHECKPOINTS.md` and `.ai/tas/NEW_CHAT_PROMPT.md`.

## Automatic Git completion policy

For every successfully completed software-engineering task:

1. Run all required deterministic checks.
2. Run browser/behavior verification when applicable.
3. Run independent review when required by task risk.
4. Inspect the Git diff and confirm that it matches requested scope.
5. Stage only files belonging to the task.
6. Automatically create a meaningful commit.
7. For short complete tasks, push directly to `main`. For long TAS tasks, checkpoint on the dedicated branch and merge/push to `main` **only after final verification**.
8. Do not wait for an additional commit or push instruction.

Permanent rules:

- `main` is the default working and push branch; the TAS checkpoint branch exception above applies to long/incomplete work.
- Do not create `codex/*` task branches unless the user explicitly asks.
- Do not create a pull request unless the user explicitly asks.
- Do not wait for approval before a normal successful push to `main`.
- NEVER force-push.
- NEVER rewrite Git history.
- NEVER commit secrets.
- NEVER commit unrelated modifications.
- NEVER push unverified or failing implementation to `main`; explicit WIP checkpoints may be pushed only to their `tas/<TASK_ID>` branch and must be labelled UNVERIFIED.
- Inspect the actual diff before every commit.
- If remote `main` moved, fetch or pull safely and integrate without discarding
  other work. Do not overwrite remote changes.

After every task report BRANCH, COMMIT, PUSH_STATUS, and VERIFICATION; for an interrupted TAS task also report ACTIVE_BRANCH, LAST_CHECKPOINT, and NEXT_STEP.

## Context Loading and Project Memory Policy

For every new software-engineering task, do not recursively read or scan the
entire repository by default. Load context in this order:

1. Read `AGENTS.md` and `.ai/START_HERE.md`.
2. Determine whether the request is a new task or a continuation.
3. For a continuation, locate and read only the relevant `.ai/tasks/<task>.md`.
4. Read `.ai/CONTEXT_MAP.md` to identify likely repository areas.
5. Search for exact paths, symbols, functions, IDs, URLs, or usages.
6. Open only the source files needed for the current step.
7. Expand context only when evidence shows that another dependency matters.

Prefer task memory → targeted search → relevant source files → minimal dependency
expansion. Avoid whole-repository dumps and repeatedly rediscovering previous
work. Do not inspect all `EGA/` or `OGA/` files unless repository-wide analysis is
explicitly required. Do not read every `.ai/tasks/*.md`; select the relevant task
file. Current source code on `main` remains the source of truth. If task memory
conflicts with current code, follow the code and report the discrepancy.

For a meaningful multi-step workstream, search `.ai/tasks/` for an existing
relevant file. Continue it if present; otherwise create one using
`.ai/tasks/_TEMPLATE.md`. Do not create a task file for a typo, one-line text
replacement, or tiny CSS adjustment unless continuation context will help. Keep
task files short, normally hundreds rather than thousands of words. Update them
only when meaningful state changes, using confirmed facts rather than speculative
reasoning. Reference paths and symbols instead of pasting large code blocks,
logs, diffs, or conversations.

Write `.ai/tasks/` task files in Russian so the user can read them. Keep exact
paths, code symbols, commands, and machine-readable status values unchanged.
Use the Russian headings in `.ai/tasks/_TEMPLATE.md` for new files.

Before ending substantial work, update the task file's current state, decisions,
relevant files, completed work, next step, verification, and open questions/risks.
When finished, set Status to DONE, keep the file compact, and avoid an endless
chronological diary. Summarize important lasting architectural decisions in the
appropriate `docs/architecture/` file; keep task-specific implementation history
in `.ai/tasks/`.

Before spawning subagents, load enough context to make narrow Task Packets. Give
each worker only role-relevant context: the relevant task memory, exact known
paths, specific search targets, and required evidence. A realtime researcher may
get Firebase/session search targets; a drawing researcher gets drawing-specific
targets. A Reviewer gets the original request, acceptance criteria, diff, and
verification evidence. Do not send every worker the entire repository context.
