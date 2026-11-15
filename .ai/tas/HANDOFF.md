# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-16
**ACTIVE_TASK:** UI-04 IN_PROGRESS — ready-template group assignment finished.
**ACTIVE_BRANCH:** main; PRs [#74](https://github.com/Arthur200014/testing-hosting/pull/74) and [#75](https://github.com/Arthur200014/testing-hosting/pull/75) merged.
**LAST_IMPLEMENTATION_COMMIT / MERGED_SHA:** `77daa923cae7369cc94bc12a9bc8bfc49b1cda6a`.
**RELEASE_STATE:** MERGED; all relevant CI PASS. Latest Pages publication PENDING verification after urgent owner request to commit/push now. Timeweb native main auto-deploy owner-confirmed; independent API revision UNKNOWN.
**NEXT_ACTION:** First confirm Pages for the merged SHA. Then a moderate UI-04 step: group-scoped homework read/status view (filter by group on the server before any result limit); keep submission/grade editing separate until that view is verified.

## Standing owner instructions

Timeweb automatically deploys latest main. Isolated API/PostgreSQL/Chromium testing is authorized; do not request production credentials or reopen the blocked panel. LIVE_WRITE_NOT_RUN and independent API revision UNKNOWN are limitations, not blockers.
Latest owner preference supersedes the earlier large-block request: take a **smaller bounded step**, not the entire group homework module. The final steering was urgent commit/push.

## Group assignment — scope and evidence

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
