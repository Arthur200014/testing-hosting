# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI-01…UI-08
**ACTIVE_TASK:** RELEASE_BLOCKED — frontend published; Timeweb API deployment and authenticated live write acceptance incomplete.
**ACTIVE_BRANCH:** main for release verification; [PR #65](https://github.com/Arthur200014/testing-hosting/pull/65) is merged. Do not resume the old task branch as unfinished code.
**LAST_IMPLEMENTATION_COMMIT:** `38ace0a70ef52b63279f599aa9d2c10c4f0ddd1c`.
**MERGED_SHA:** `1ff449cc1e36bee31973c8229bd9e5279ea25020`.
**NEXT_ACTION:** Complete the API release, not another feature. An operator with Timeweb access must inspect the existing app deployment status/logs and deploy current main with the existing database/environment. Confirm native auto-deploy from GitHub main, or configure the already documented GitHub API fallback (docs/ops/timeweb-autodeploy.md); do not enable two competing triggers or create new infrastructure. Then verify new protected routes, migration readiness, and browser save/cancel/reload in an identified dedicated live test workspace. Obtain test-account sign-in through secure browser auth; never ask for passwords/tokens in chat. Update release evidence here after acceptance. Only then resume lesson material/task attachments (25, 27–29).

## Release evidence

- **PR:** #65 merged successfully with expected-head protection; branch changes were identical to green tested code except docs.
- **FRONTEND_DEPLOY: PASS.** GitHub Pages run `43732941194` succeeded for MERGED_SHA. Published `https://arthur200014.github.io/testing-hosting/platform/teacher.html` contains count-plan, class-lesson and participant-result controls. Browser opened/reloaded the live login page.
- **MAIN_CI: PASS.** Native homework browser `43732942161`, Homework import integration `43732942142`. Earlier code-specific TAS CI and Chromium acceptance were green.
- **API_DEPLOY: BLOCKED / RUNNING_REVISION UNKNOWN.** Timeweb fallback run `43733174823` is skipped. New POST `/api/v1/teacher/schedule-rules/period-preview` returns 405 (Allow: PATCH); new participant-result POST using all-zero synthetic IDs/no auth returns 404. The new protected routes should reach authentication (401/403), so updated API availability is not established. Public ready/migrations health returns 200; this does not identify the running commit or prove new migrations deployed.
- **DEPLOY_ACCESS:** browser could not open timeweb.cloud (Site Unavailable, one reload attempted); no usable Timeweb connector or GitHub secret/variable management operation available. Cannot inspect native app deploy settings or trigger a verified API rollout from current access.
- **LIVE_ACCEPTANCE:** login page/public assets only. **LIVE_WRITE_NOT_RUN:** deployed new API is missing and no dedicated live test credentials/workspace are available. Public registration only claims an already configured ownerless workspace; it cannot safely create an arbitrary test tenant. Do not use the existing owner workspace as a test-write substitute.
- No production student/lesson/board/credential changes, import reruns or writer switches. No reset/seed runner was aimed at production.

## Implemented in merged code

Period/count preview and atomic batch saving with persistent retry ledger; class lesson detail, explicit completion and per-student attendance; separate reaction/comment endpoint and dialog; real creation/completion history. Migrations: `20261115210000_TeacherPeriodPlans`, `20261115220000_LessonCompletion`, `20261115230000_LessonFeedback` plus model snapshot. Existing records retain nullable new fields; past dates do not infer completion.

Isolated PostgreSQL/Chromium acceptance covers save/cancel/reload, repeat requests, stale/foreign/conflicting updates, group participant isolation, mobile layout and prior workflows. References 23–26/73–74 and generated screenshots were inspected. Pixel fidelity remains PARTIAL. Recordings, boards, chat and material/task attachments remain unavailable.

## Safety

Read AGENTS.md release-to-live rules. Existing real user records are read-only for acceptance; writes only to explicitly identified synthetic fixtures in a designated live test workspace. Do not retarget calendar-real-browser.sh or reset/import scripts to Timeweb. Keep secrets and personal data out of Git, screenshots and chat.
