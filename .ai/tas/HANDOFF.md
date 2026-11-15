# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — UI-04.
**ACTIVE_TASK:** Finish publication of the merged UI-04 class program topics scenario before implementing progress/completion.
**ACTIVE_BRANCH:** main; PR #70 merged; no new implementation branch.
**LAST_IMPLEMENTATION_COMMIT / MERGED_SHA:** `ca67374713dd85ff13af9528ac23b9fb9caa5ba4`.
**RELEASE_STATE:** RELEASE_BLOCKED — frontend published; latest API endpoints present/protected; running API revision and deployment completion UNKNOWN; authenticated live persistence NOT_RUN.
**NEXT_ACTION:** Obtain a secure authenticated session for an explicitly designated synthetic live teacher/workspace (never the real owner workspace), then check class program topic create/cancel/order/material link, reload and re-enter against the published site and actual API. Confirm Timeweb app deployment/revision through existing access if available; avoid duplicate deployment triggers. Only after release acceptance resume topic progress/completion and unassigned/completed filters (Meleto ref 17), then lesson-topic relationships.

## Current publication evidence

- **MERGE PASS:** [PR #70](https://github.com/Arthur200014/testing-hosting/pull/70), `ca67374713dd85ff13af9528ac23b9fb9caa5ba4`. Documentation-only main head when resuming: `9e990705f341738f958f1434a56350060d85c288`.
- **FRONTEND_DEPLOY PASS:** [Pages 43752261280](https://github.com/Arthur200014/testing-hosting/actions/runs/43752261280) succeeded on that main head; [implementation Pages 43752078529](https://github.com/Arthur200014/testing-hosting/actions/runs/43752078529) succeeded. Actual published [teacher UI](https://arthur200014.github.io/testing-hosting/platform/teacher.html) opened in Cloud Chrome and renders login. Signed-in UI acceptance is still pending.
- **API READINESS PASS (limited):** live GET /health/ready and /health/migrations returned 200 Healthy on resumption. Anonymous GET /api/v1/teacher/class-topics and /api/v1/teacher/lesson-materials returned 401. Latest topics route is present/protected; this does not prove authenticated DB operations or exact running commit.
- **EXISTING HEALTH CI PASS:** [43752325629](https://github.com/Arthur200014/testing-hosting/actions/runs/43752325629): health/live, ready, migrations 200; teacher/students and UI-03 period-preview anonymous POST 401; synthetic probe tests 4/4.
- **API DEPLOY COMPLETION / REVISION UNKNOWN:** [fallback 43752325530](https://github.com/Arthur200014/testing-hosting/actions/runs/43752325530) skipped. Do not infer native auto-deploy completion from this. Timeweb panel https://timeweb.cloud/my/apps rendered “Site Unavailable” in this browser; no panel access/configuration confirmed or changed and no duplicate deploy triggered.
- **LIVE_WRITE_NOT_RUN:** no signed-in test teacher/workspace in the browser. Published registration is owner-claim for an already imported workspace (defaults to tas-main), not a general test-workspace creation flow. Do not claim/register the real owner workspace to create fixtures. Secure test login is the immediate dependency. No production records, settings, credentials, invitations or notifications changed.
- The user's current instruction explicitly requests API/deploy checks and live synthetic acceptance; it supersedes the earlier handoff's “no Timeweb checks” pause.

## Implemented scope and retained verification

UI-04 topics: separate workspace-bound TeacherClassTopics and TeacherTopicMaterialLinks; ordered title/plan and reusable material links for individual/group classes; additive migration `20261116030000_TeacherClassProgramTopics`. Auth/tenant isolation, request idempotency, conflict handling, archived read-only. Relevant files are in [PR #70](https://github.com/Arthur200014/testing-hosting/pull/70); do not scan the whole repository.

Pre-merge PASS: [TAS CI 43751717400](https://github.com/Arthur200014/testing-hosting/actions/runs/43751717400), [PostgreSQL 43751717802](https://github.com/Arthur200014/testing-hosting/actions/runs/43751717802), [isolated Chromium/API/PostgreSQL 43751717398](https://github.com/Arthur200014/testing-hosting/actions/runs/43751717398). Covers create/replay/cancel/order/move, reusable material linking, reload, group ownership and foreign workspace isolation. Screenshot 17_class_program_real.png. These are isolated pre-release checks, not live acceptance.

Earlier merged prerequisites: UI-04 class homework PR #67 `ace061b` (existing API); class materials PR #68 `2418bdc` with migration `20261116010000_TeacherClassMaterials`; lesson materials PR #69 `980bb5a` with migration `20261116020000_TeacherLessonMaterials`. Their Pages and isolated tests passed; authenticated live acceptance remains unverified. Earlier UI-03 PR #65 `1ff449c` and read-only probe PR #66 `11e0a92`. Detailed historical evidence remains in Git history.

## Remaining scope and safety

Visual match PARTIAL. Topic progress/completion, filters, lesson-topic/assignment relationships, binary uploads, recordings, real billing and chat are not complete. Do not start another feature while this release is blocked.

Follow AGENTS.md. Real owner/student records are read-only for acceptance. Writes only to a designated live synthetic workspace through ordinary permitted flows. Never retarget calendar-real-browser.sh, reset/seed/import scripts to production. No historical imports, credential/configuration changes, writer switch or destructive migrations. Keep secrets and personal data out of Git, screenshots and chat.
