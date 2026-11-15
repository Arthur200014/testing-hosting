# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI-01…UI-08
**ACTIVE_TASK:** UI-04 IN_PROGRESS — individual-class native homework templates/assignments shipped; next class materials and library links. User confirmed Timeweb deployment and explicitly asked to skip further Timeweb checks.
**ACTIVE_BRANCH:** main — [PR #67](https://github.com/Arthur200014/testing-hosting/pull/67) merged, no open implementation branch.
**LAST_IMPLEMENTATION_COMMIT:** `ace061b163110e203d34fda53686269204ac76c0` (UI-04 class native homework).
**MERGED_SHA (UI-03):** `1ff449cc1e36bee31973c8229bd9e5279ea25020`.
**RELEASE_PROBE_SHA (earlier UI-03):** `11e0a92ea4eada6db6b670a9b8e8983fb5509edc`.
**MERGED_SHA (UI-04):** `ace061b163110e203d34fda53686269204ac76c0`.
**NEXT_ACTION:** Continue UI-04 with reusable **class material HTTPS links** (screens 16, 27–28): inspect existing model and current class materials placeholder; implement one tenant-scoped save/list/reopen link flow, then focused isolated PostgreSQL/Chromium acceptance, merge and GitHub Pages publication. Do not equate homework catalog tasks with general materials without checking semantics. Do not run imports, production seeding or resets. User states Timeweb deployment is done and requests no more Timeweb panel checks; actual authenticated production write acceptance remains NOT_RUN (no designated safe live test workspace).

## UI-04 class homework milestone (2026-11-15)

- **PR #67 MERGED:** `ace061b` via squash. Changed `platform/teacher.html`, `platform/teacher-data.mjs`, `platform/class-native-homework.mjs`, its focused tests, `platform/calendar-real-browser.mjs`, `platform/scripts/calendar-real-browser.sh`, and native browser workflow (7 files; existing API/schema untouched).
- **FRONTEND DEPLOY: PASS.** GitHub Pages run [43739705805](https://github.com/Arthur200014/testing-hosting/actions/runs/43739705805) succeeded for `ace061b`. Published UI: `https://arthur200014.github.io/testing-hosting/platform/teacher.html`. Static URL not independently opened by the web tool; no authenticated production acceptance claimed.
- **TESTS: PASS.** Branch [TAS CI 43739406128](https://github.com/Arthur200014/testing-hosting/actions/runs/43739406128), [isolated PostgreSQL integration 43739406097](https://github.com/Arthur200014/testing-hosting/actions/runs/43739406097), and [real Chromium/isolated PostgreSQL 43739406127](https://github.com/Arthur200014/testing-hosting/actions/runs/43739406127) all green. Browser flow creates native task template, assigns only the class member with 48h deadline, cancels unsaved draft, reloads and confirms persisted assignment, checks another workspace cannot read it; synthetic screenshot `43_class_homework_real.png`.
- **SCOPE:** Individual classes only; group task attachment, class materials, recordings, binary uploads and per-lesson materials remain not implemented. Reuses existing protected native homework routes; no API or DB migration for this milestone.
- **TIMEWEB:** No new API code to deploy. Owner reports previous Timeweb deployment completed; no further Timeweb verification requested. Running API revision independently UNKNOWN. **LIVE_WRITE_NOT_RUN**; no real student/teacher data used for tests.

## Earlier UI-03 release evidence

- **MERGE: PASS.** PR #65 UI-03 merged as `1ff449c`; PR #66 safe API fingerprint merged as `11e0a92`. PR #66 changed only `platform/scripts/timeweb-readonly-check.py` and `platform/scripts/test_timeweb_readonly_check.py`.
- **FRONTEND_DEPLOY: PASS (GitHub Pages).** Run [43736327309](https://github.com/Arthur200014/testing-hosting/actions/runs/43736327309) succeeded on `11e0a92`; prior UI-03 Pages run [43732941194](https://github.com/Arthur200014/testing-hosting/actions/runs/43732941194) succeeded on `1ff449c`. Published `https://arthur200014.github.io/testing-hosting/platform/teacher.html` previously loaded its login page; live authenticated controls not accepted.
- **BRANCH_CI: PASS.** PR #66 [TAS task CI 43735990844](https://github.com/Arthur200014/testing-hosting/actions/runs/43735990844) and [PostgreSQL integration 43735990868](https://github.com/Arthur200014/testing-hosting/actions/runs/43735990868); main [PostgreSQL integration 43736327649](https://github.com/Arthur200014/testing-hosting/actions/runs/43736327649) passed. Scoped synthetic probe tests 4/4 PASS on main.
- **API_ROUTE_DEPLOY: PASS (behavioral); RUNNING_REVISION: UNKNOWN.** Main [Timeweb read-only health run 43736532188](https://github.com/Arthur200014/testing-hosting/actions/runs/43736532188): `/health/live`, `/health/ready`, `/health/migrations` = 200; `GET /api/v1/teacher/students` = 401; **anonymous POST `/api/v1/teacher/schedule-rules/period-preview` = 401**. The latter was 405 before the new API was seen and is now present/protected. No authenticated writes or running commit metadata were obtained. API deployment completion in Timeweb panel is NOT independently verified.
- **FALLBACK_DEPLOY: SKIPPED.** Run [43736532352](https://github.com/Arthur200014/testing-hosting/actions/runs/43736532352); do not turn on fallback if native auto-deploy is active. Existing Timeweb App Platform dashboard/auth not available to this session.
- **LIVE_ACCEPTANCE: NOT_RUN; LIVE_WRITE_NOT_RUN.** No secure browser session with a designated isolated live test workspace was available. Public route/health checks do not prove save/cancel/reload persistence. Existing real owner/student records were not used for test writes; no imports, seed/reset, credential changes, or writer switches.


## Earlier UI-03 implementation

Period/count preview and atomic batch saving with persistent retry ledger; class lesson detail, explicit completion and per-student attendance; separate reaction/comment endpoint and dialog; real creation/completion history. Migrations: `20261115210000_TeacherPeriodPlans`, `20261115220000_LessonCompletion`, `20261115230000_LessonFeedback` plus model snapshot. Existing records retain nullable new fields; past dates do not infer completion.

Isolated PostgreSQL/Chromium acceptance covers save/cancel/reload, repeat requests, stale/foreign/conflicting updates, group participant isolation, mobile layout and prior workflows. References 23–26/73–74 and generated screenshots were inspected. Pixel fidelity remains PARTIAL. Recordings, boards, chat and material/task attachments remain unavailable.

## Safety

Read AGENTS.md release-to-live rules. Existing real user records are read-only for acceptance; writes only to explicitly identified synthetic fixtures in a designated live test workspace. Do not retarget calendar-real-browser.sh or reset/import scripts to Timeweb. Keep secrets and personal data out of Git, screenshots and chat.
