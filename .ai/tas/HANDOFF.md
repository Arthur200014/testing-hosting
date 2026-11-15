# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI-01…UI-08
**ACTIVE_TASK:** RELEASE_BLOCKED — frontend published; new protected Timeweb API route responds correctly, but running API revision and authenticated live write acceptance remain unverified.
**ACTIVE_BRANCH:** main for release verification; [PR #65](https://github.com/Arthur200014/testing-hosting/pull/65) and [PR #66](https://github.com/Arthur200014/testing-hosting/pull/66) are merged. No active code branch.
**LAST_IMPLEMENTATION_COMMIT:** `38ace0a70ef52b63279f599aa9d2c10c4f0ddd1c`.
**MERGED_SHA (UI-03):** `1ff449cc1e36bee31973c8229bd9e5279ea25020`.
**RELEASE_PROBE_SHA:** `11e0a92ea4eada6db6b670a9b8e8983fb5509edc` (PR #66, two Python probe/test files only).
**NEXT_ACTION:** Finish authenticated live acceptance **before UI-04**. In Timeweb App Platform inspect the existing application's latest deployment and running revision (native auto-deploy or configured alternative; do not enable both); current protected UI-03 route responds 401 and migrations health 200, but API revision is UNKNOWN. Obtain access to an explicitly designated *synthetic live test teacher/workspace* via secure browser sign-in (not credentials in chat, not an existing real owner). Through the published Pages UI and its real Timeweb API, test UI-03 create/preview/save, cancel, reload/re-enter persistence, and a related prior flow. Do not run production seeding/cleanup scripts. Record screenshots/requests without credentials or student data. If safe auth/test workspace is unavailable, keep LIVE_WRITE_NOT_RUN and RELEASE_BLOCKED. Only after acceptance resume UI-04 lesson material/task attachments (25, 27–29).

## Release evidence

- **MERGE: PASS.** PR #65 UI-03 merged as `1ff449c`; PR #66 safe API fingerprint merged as `11e0a92`. PR #66 changed only `platform/scripts/timeweb-readonly-check.py` and `platform/scripts/test_timeweb_readonly_check.py`.
- **FRONTEND_DEPLOY: PASS (GitHub Pages).** Run [43736327309](https://github.com/Arthur200014/testing-hosting/actions/runs/43736327309) succeeded on `11e0a92`; prior UI-03 Pages run [43732941194](https://github.com/Arthur200014/testing-hosting/actions/runs/43732941194) succeeded on `1ff449c`. Published `https://arthur200014.github.io/testing-hosting/platform/teacher.html` previously loaded its login page; live authenticated controls not accepted.
- **BRANCH_CI: PASS.** PR #66 [TAS task CI 43735990844](https://github.com/Arthur200014/testing-hosting/actions/runs/43735990844) and [PostgreSQL integration 43735990868](https://github.com/Arthur200014/testing-hosting/actions/runs/43735990868); main [PostgreSQL integration 43736327649](https://github.com/Arthur200014/testing-hosting/actions/runs/43736327649) passed. Scoped synthetic probe tests 4/4 PASS on main.
- **API_ROUTE_DEPLOY: PASS (behavioral); RUNNING_REVISION: UNKNOWN.** Main [Timeweb read-only health run 43736532188](https://github.com/Arthur200014/testing-hosting/actions/runs/43736532188): `/health/live`, `/health/ready`, `/health/migrations` = 200; `GET /api/v1/teacher/students` = 401; **anonymous POST `/api/v1/teacher/schedule-rules/period-preview` = 401**. The latter was 405 before the new API was seen and is now present/protected. No authenticated writes or running commit metadata were obtained. API deployment completion in Timeweb panel is NOT independently verified.
- **FALLBACK_DEPLOY: SKIPPED.** Run [43736532352](https://github.com/Arthur200014/testing-hosting/actions/runs/43736532352); do not turn on fallback if native auto-deploy is active. Existing Timeweb App Platform dashboard/auth not available to this session.
- **LIVE_ACCEPTANCE: NOT_RUN; LIVE_WRITE_NOT_RUN.** No secure browser session with a designated isolated live test workspace was available. Public route/health checks do not prove save/cancel/reload persistence. Existing real owner/student records were not used for test writes; no imports, seed/reset, credential changes, or writer switches.


## Implemented in merged code

Period/count preview and atomic batch saving with persistent retry ledger; class lesson detail, explicit completion and per-student attendance; separate reaction/comment endpoint and dialog; real creation/completion history. Migrations: `20261115210000_TeacherPeriodPlans`, `20261115220000_LessonCompletion`, `20261115230000_LessonFeedback` plus model snapshot. Existing records retain nullable new fields; past dates do not infer completion.

Isolated PostgreSQL/Chromium acceptance covers save/cancel/reload, repeat requests, stale/foreign/conflicting updates, group participant isolation, mobile layout and prior workflows. References 23–26/73–74 and generated screenshots were inspected. Pixel fidelity remains PARTIAL. Recordings, boards, chat and material/task attachments remain unavailable.

## Safety

Read AGENTS.md release-to-live rules. Existing real user records are read-only for acceptance; writes only to explicitly identified synthetic fixtures in a designated live test workspace. Do not retarget calendar-real-browser.sh or reset/import scripts to Timeweb. Keep secrets and personal data out of Git, screenshots and chat.
