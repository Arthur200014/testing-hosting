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

## Automatic Git completion policy

For every successfully completed software-engineering task:

1. Run all required deterministic checks.
2. Run browser/behavior verification when applicable.
3. Run independent review when required by task risk.
4. Inspect the Git diff and confirm that it matches requested scope.
5. Stage only files belonging to the task.
6. Automatically create a meaningful commit.
7. Automatically push directly to `main`.
8. Do not wait for an additional commit or push instruction.

Permanent rules:

- `main` is the default working and push branch.
- Do not create `codex/*` task branches unless the user explicitly asks.
- Do not create a pull request unless the user explicitly asks.
- Do not wait for approval before a normal successful push to `main`.
- NEVER force-push.
- NEVER rewrite Git history.
- NEVER commit secrets.
- NEVER commit unrelated modifications.
- NEVER push an implementation whose required verification failed.
- Inspect the actual diff before every commit.
- If remote `main` moved, fetch or pull safely and integrate without discarding
  other work. Do not overwrite remote changes.

After every task report BRANCH, COMMIT, PUSH_STATUS, and VERIFICATION.

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
