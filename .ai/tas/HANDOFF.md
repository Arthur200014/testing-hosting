# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-16
**ACTIVE_TASK:** UI-04 IN_PROGRESS — group homework history, submissions and grading.
**ACTIVE_BRANCH:** `tas/ui04-group-homework-review`; [PR #76](https://github.com/Arthur200014/testing-hosting/pull/76), implementation `5e1ac2166dba55d2adff4e4dfe7eca33dfba6248`, CI pending.
**LAST_IMPLEMENTATION_COMMIT / MERGED_SHA:** `77daa923cae7369cc94bc12a9bc8bfc49b1cda6a`.
**RELEASE_STATE:** Previous group assignment published: [Pages 43769328267](https://github.com/Arthur200014/testing-hosting/actions/runs/43769328267) PASS at `98b06a7` (contains #74/#75). Current #76 NOT_MERGED; isolated CI pending. Timeweb native main auto-deploy configured; independent revision UNKNOWN.
**NEXT_ACTION:** Finish #76 isolated PostgreSQL/real Chromium checks, fix actual failures, merge after green, confirm Pages, then record outcome. No Timeweb checks or live writes per latest owner instruction.

## Standing owner instructions

Timeweb automatically deploys latest main. Isolated API/PostgreSQL/Chromium testing is authorized; do not request production credentials or reopen the blocked panel. LIVE_WRITE_NOT_RUN and independent API revision UNKNOWN are limitations, not blockers.
Latest owner instruction: take several consecutive related tasks together. Current block: server-scoped group history → submission/status/detail UI → existing grade/comment flow → save/cancel/reload. Verify everything in isolated environments; do not check Timeweb or request production access.

## Current #76 block

- Added group-owned read route with filter before limit, independent per-group cache, status filtering, condition/answer detail and existing grading controls with cancel.
- LOCAL PASS: 15 focused Node tests, module/inline JS syntax, diff check. Backend and real browser CI pending (local host lacks Docker/.NET).
- Regression: 301 newer unrelated rows cannot hide group history; foreign workspace gets 404; archived history remains readable; grade 0 and feedback persist. Browser extends existing isolated assignment flow with student submit, cancel grade, save 85/comment and reload.
- Paths: `platform/{teacher.html,teacher-data*,class-native-homework*,calendar-real-browser.mjs}`, native service/routes, `TeacherSessionTests.cs`. No schema change.

## Previous group assignment — scope and evidence

- Group → Homework now assigns an existing template to chosen approved members with 24/48/72h deadline; cancel and reload verified. Recent group rows use explicit GroupClassId, not inferred student membership. Templates are not copied.
- Additive migration `20261116070000_NativeGroupAssignments` adds nullable GroupClassId + workspace/group FK; existing assignments stay null. Service validates active group, approval, student/program activity and task compatibility, checks group during replay, and locks the group with FOR SHARE during new assignment.
- **Important compatibility fix (#75):** UI writes to new teacher-only POST /api/v1/teacher/homework/native/group-assignments requiring GroupClassId. An older API cannot silently treat this as an ordinary unscoped assignment. Existing global route remains compatible.
- Changed native models/service, persistence model/migration/snapshot, teacher.html/data, class-native-homework module/tests, API/browser tests and browser workflow paths. Full diff in PRs #74/#75.
- **LOCAL PASS:** 10 focused Node tests, JS syntax and diff checks.
- **FINAL CI PASS (#75, `3951a6e52114cad06b965205fdacb78cb922891c`):** [TAS CI 43768776480](https://github.com/Arthur200014/testing-hosting/actions/runs/43768776480), [PostgreSQL 43768776088](https://github.com/Arthur200014/testing-hosting/actions/runs/43768776088), [real Chromium/API/PostgreSQL 43768776325](https://github.com/Arthur200014/testing-hosting/actions/runs/43768776325). Earlier full feature runs #74 also passed.
- Browser verifies cancel/no write, choose one of two, 72h deadline, save/reload and tenant boundary. API verifies replay/context conflict, missing group, outsider/unapproved member, foreign workspace and archive. Repeated synthetic browser login respects 429 with a bounded wait; application auth limit is unchanged.
- Reference 18 and generated 18_group_assignment_real.png inspected; visual match PARTIAL. Group submissions/grades/new templates are deliberately not added in this slice.
- Current recent list uses existing teacher feed (latest 300 across workspace), filtered by explicit group; do not describe it as complete group history. Next read endpoint must filter before limiting.

Published UI: https://arthur200014.github.io/testing-hosting/platform/teacher.html. Previous program/lesson flow #73 remains intact. UI-04 is not DONE: scoped group submission/status/grade UI, binary uploads/recordings and broader library work remain. Production records, credentials, configuration, invitations and notifications were not changed by acceptance. Never retarget reset/seed/import/calendar-real-browser.sh to production; use synthetic isolated data only.
