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
5. Run the minimum *relevant* verification described below, fix actual failures, and publish a coherent commit. For TAS application changes, complete the release-to-live workflow below; commit/push or an open PR is only a checkpoint. Small documentation-only changes may go directly to `main` without an application deployment.
6. After every completed task, send a concise chat report with: what was done, changed paths, actual checks (PASS / FAIL / NOT_RUN), release state (branch / merged / deployed / live-verified), problems or limitations, commit/PR and live URL when applicable, and the next step written to HANDOFF. Do not reproduce code or diffs already stored in Git.

Additional research, architecture review, independent review, and agents are **optional** and justified only by genuine complexity or risk. Never attempt a missing SDK integration merely to satisfy process.

## Proportionate verification
- **Docs, copy, CSS, small visual tweaks:** check changed content/syntax and visual behavior when a browser is available. Do not create automated tests purely for cosmetics.
- **UI controls, mathematical graphs, local JavaScript:** test the changed scenario and any directly related existing behavior; reuse existing tests. For math, validate representative values/constraints where relevant.
- **Backend, API, storage, data migrations:** run focused existing tests and add a small regression test when logic changes and the test can be run.
- **Auth, student scores, concurrency, realtime, Firebase/GAS integrations:** verify high-risk success/failure paths and focused regression/integration behavior; use isolated synthetic data, not live student records.
- **TAS data-backed UI flows:** reuse `platform/scripts/calendar-real-browser.sh` / `platform/calendar-real-browser.mjs` for browser checks against an actual isolated API/PostgreSQL with dedicated test teachers and persisted records. Mocked UI checks supplement this; they do not establish persistence. Never use an existing production owner's settings, students or lessons as test-write targets.
- Do not run a whole repository suite for a local change. Do not build new test infrastructure unless needed to establish correctness for the actual task.
- Record unavailable checks as NOT_RUN. For a low-risk change, a documented limitation need not block publishing. For a high-risk, unverified change, keep it on a task branch and report the blocker; do not call it production-verified.

## TAS release-to-live — required completion

- **Owner clarification (2026-11-15):** Timeweb native auto-deploy from main is configured and confirmed by the owner. When its panel is inaccessible, proceed with isolated API/PostgreSQL/browser verification, required CI, merge and Pages publication. Record Timeweb completion/revision and live writes as independently NOT_VERIFIED / NOT_RUN; they do not block the next scoped feature in this owner-approved mode. Do not ask for production credentials or a live test workspace just to continue. All production data-safety rules still apply.
- The owner's standing instruction authorizes routine merge and deployment of completed, relevant TAS changes through the existing GitHub Pages + Timeweb setup. Finish implementation → relevant tests/required green checks → merge into main → verify frontend and API deployment completion → live browser acceptance → update HANDOFF on main. Do not repeatedly ask permission for these already-authorized steps; respect protected-branch reviews, actual access limits and explicit user pauses.
- Before starting another feature, finish publication of the previous completed scenario. Resume an existing releasable PR instead of accumulating unrelated scenarios on it. If a release is blocked, fix the in-scope blocker or report the exact missing access/configuration/failed check and preserve a concrete release NEXT_ACTION. Do not silently replace deployment with more feature development.
- Verify both delivery paths separately: GitHub Pages serves the teacher/student interface; Timeweb serves the API/PostgreSQL. Inspect actual workflow/app results, current target branch, and new migration readiness. A successful CI run, push, accepted deploy request or health 200 does not prove that the new version is live. Avoid duplicate deploy triggers if native Timeweb auto-deploy already completed.
- Record MERGED_SHA, frontend publication evidence, API deployment evidence/revision and live acceptance independently. If the running API commit cannot be identified, record UNKNOWN and verify the changed live endpoint/behavior; do not invent a revision or infer it from health alone. If this prevents meaningful acceptance, mark RELEASE_BLOCKED.
- Use the real published platform in the browser after deployment, with its actual deployed API/database (no route interception, mocks or local API substitution). Check the changed scenario, save/cancel where relevant, reload/re-enter and verify persisted results and a directly affected existing path. A unit/integration run on an isolated database is pre-release evidence, not live acceptance.
- Existing real owner/student records may be inspected read-only through the authorized UI to confirm loading, navigation and relationships. Write acceptance must use a dedicated, explicitly identified test teacher/workspace and synthetic students/lessons on the live platform; create only the minimum needed test fixtures in that test workspace. Do not modify real students' results, attendance, lessons, boards, settings or credentials as a test. Do not send invitations, notifications or payments. Do not expose personal data/screenshots or credentials in Git, artifacts or chat.
- Never retarget `calendar-real-browser.sh`, database-reset/TRUNCATE scripts or local test seed/import commands to production. Reuse/create designated live test accounts through ordinary permitted application flows, with known test ownership. If authentication, a test workspace or a safe write path is unavailable, report LIVE_WRITE_NOT_RUN with the exact blocker; readonly health does not replace the missing functional test.
- Deploy additive application migrations through the existing deployment process; preserve production data and existing links. Verify migration/ready health and the actual changed API behavior. A migration requiring destructive conversion, production restore, writer switch or new infrastructure needs a separate decision.
- Keep HANDOFF on main current after release or interruption: ACTIVE_BRANCH/PR, implementation status, release evidence, live tests and any blocker must reflect reality. Never leave main saying ACTIVE_BRANCH=none while unfinished work exists. Main's release requirements also apply while resuming an older task branch; retain them when merging branch instructions.
- Documentation-only updates require content/diff verification and commit/push, not an application redeploy or live data writes. Distinguish these from application releases.

## TAS board prototype — owner decision 2026-11-17

- Before the next visual UI-06 block, implement and validate the isolated free-software board prototype described in `docs/architecture/tas-board-prototype.md`; then resume the Meleto queue. This is an explicit owner-approved plan, not a requirement to plan every ordinary UI task.
- Only commercially usable free/open-source components with no mandatory vendor subscription, SDK key or per-user/board fee. Excalidraw and excalidraw-room are candidates; verify pinned dependencies/licences. Infrastructure and integration costs remain separate.
- Prototype only on isolated synthetic workspaces; acceptance includes 1 teacher + 20 pupils, parallel rooms, access isolation and persistence after restart. Do not deploy a new production service, switch legacy Firebase writers, or claim realtime readiness before the plan's checks pass.

## Git and continuation
- Before writing, verify the current target branch and file revision. Never overwrite concurrent edits, use force-push, or include unrelated files.
- Small complete changes: commit + push once. For a long or interrupted TAS task, resume/use `tas/<TASK_ID>` and checkpoint **after meaningful milestones or before context exhaustion**, not every 3–5 minutes.
- Keep `.ai/tas/HANDOFF.md` short: task, status, branch, last published commit, changed paths, next actionable step, and true verification status. Update it when task state changes or recovery requires it.
- `.ai/tas/TASK_BOARD.md`, `.ai/tas/TEST_RESULTS.md`, phase checklists, and `.ai/tasks/` are references or optional detailed evidence, not mandatory edits on every small change.
- Use a short task card only for a complicated, multi-stage task that benefits from checkpointing. Detailed background stays in the relevant task/architecture document, not in HANDOFF.

## Safety and public compatibility
Do not change public URLs, unrelated lessons, UI styling, Firebase, Google Apps Script, database schemas, production configs, or live student data unless the task requires it. Never commit secrets or personal student records. Preserve existing behavior. Production write acceptance is allowed only in the designated test workspace under the release-to-live rules; existing real user records remain read-only during tests. During the Meleto UI rebuild, never delete live students or boards, change passwords, rerun completed imports, or switch the production writer as an incidental UI task. Do not claim tests, browser checks, deployment, or push succeeded without verifying them.

## Interactive HTML technical contract
- For new EGA/OGA HTML interactives, reuse the canonical `shared/interactive/v1` package via `interactive-runtime.js` / `platform-data.js` / `platform-realtime.js`; never copy Firebase/GAS/auth/result code into new files. Standalone offline distributions may bundle the same versioned source, not fork it. Existing legacy pages may keep their existing adapters until a tested migration.
- New ink integrations use the opt-in live-v2 drawing contract (see architecture docs). One isolated scope per lesson, one surface per page/card, local immediate rendering, delta transmission, no ACK barrier, remote frame interpolation, own-stroke undo, monotonic erasure. Do not mix incompatible protocol versions or silently change existing Firebase namespaces. Test simultaneous three-client drawing, latency, reconnect, navigation, erase/undo and stale packets with synthetic data before adoption.
- Reuse `shared/interactive/v1/worksheet-pdf.js` for worksheet export; notes export is available to all, clean all-pages export only to teacher. Supply detached page snapshots and inline assets/styles, never change participants' navigation to capture. Browser role gating is not server authorization. Keep learning content/game rules in the page; verify teacher/student permissions, result outbox and export in browser, and disclose unavailable real-network tests.
