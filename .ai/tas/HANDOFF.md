# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-16
**ACTIVE_TASK:** UI-04 IN_PROGRESS — unified templates/assignments for individual classes, groups and lesson cards.
**ACTIVE_BRANCH:** `tas/ui04-context-homework`; [PR #77](https://github.com/Arthur200014/testing-hosting/pull/77), implementation `793d9d6cc728a0954576485d355bb775b2372d23`, isolated CI pending.
**MERGED_SHA:** `21701f100606af632386ae5dfd5033166bb71127`.
**RELEASE_STATE:** MERGED + FRONTEND_PUBLISHED. [Pages 43770756849](https://github.com/Arthur200014/testing-hosting/actions/runs/43770756849) PASS. Published teacher.html, teacher-data.mjs and class-native-homework.mjs fetched and byte-compared with main: PASS. Timeweb native main auto-deploy is owner-confirmed; API deployment/revision independently NOT_VERIFIED / UNKNOWN.
**NEXT_ACTION:** Finish #77 isolated API/PostgreSQL/real Chromium acceptance, fix actual failures, merge after green and confirm Pages. Related block includes template creation/reuse, compatible recipients, lesson context, individual submission/status/grading and reload. Do not check Timeweb.

## Standing owner instructions

- Take several consecutive related tasks together, not a tiny standalone step (latest instruction supersedes the earlier smaller-step preference).
- Verify API/PostgreSQL/browser persistence in isolated synthetic environments only. **Do not check Timeweb** or request production access. Native auto-deploy from main remains configured; independent Timeweb revision and live writes are not blockers in this owner-approved mode.
- Production students, lessons, scores, credentials and settings are not test-write targets. Never retarget reset/seed/import/calendar-real-browser.sh to production; do not rerun completed imports or switch writer.

## Current #77 block

- Shared template creation/selection and assignment in individual classes, groups and lesson cards; common status/answer/grading UI and program-tab navigation. Legacy imported pupil flow retained.
- Additive `20261116090000_NativeHomeworkContexts` stores nullable IndividualClassId/LessonId with workspace FKs; class and lesson reads filter before limiting; context route validates active class, lesson participants and replay identity.
- LOCAL PASS: 21 focused Node tests, JS syntax/diff. Isolated backend/migration/browser CI pending. No production writes or Timeweb checks.
- Changed shared homework UI/data, teacher page, program link; native models/service/routes, persistence model/migration/snapshot; focused API/browser tests. Full paths in PR #77.

## Completed block #76

- Group-owned GET /api/v1/teacher/groups/{groupId}/homework validates workspace ownership and filters GroupClassId before the 300-row limit. Archived history remains readable. Workspace feed is no longer the source for group history.
- Per-group cache keys reuse existing generation/version guards, reject stale responses and clear after assignment/grade writes and workspace changes.
- Group → Homework: statuses and counts; awaiting/overdue/needs-review/graded filter with empty state; expandable condition and student answer; existing grade/comment API with cancel, save and persisted reload. Zero is a valid grade. Existing assignment flow preserved.
- Paths: platform/teacher.html, teacher-data.mjs/test, class-native-homework.mjs/test, calendar-real-browser.mjs; NativeHomeworkService.cs, Program.cs, TeacherSessionTests.cs. No new migration or schema change.
- Reference 18 and generated 18_group_review_real.png inspected: visual fidelity PARTIAL; current group assignment form remains the existing design. Browser screenshots in [artifact run 43770227269](https://github.com/Arthur200014/testing-hosting/actions/runs/43770227269).
- History is explicitly labelled latest 300 **within this group**, not complete/paginated history.

## Verification and publication

- LOCAL PASS: 15 focused Node tests, inline/module JS syntax, diff check.
- [TAS CI 43770455315](https://github.com/Arthur200014/testing-hosting/actions/runs/43770455315): backend + gate PASS at `dde2777`.
- [PostgreSQL 43770455289](https://github.com/Arthur200014/testing-hosting/actions/runs/43770455289): 100/100 tests PASS, migration/ready/auth and isolated restore checks PASS. Group regression covers 301 newer unrelated rows, ownership/404, archived history and persisted zero grade/feedback.
- [Real Chromium/API/PostgreSQL 43770227269](https://github.com/Arthur200014/testing-hosting/actions/runs/43770227269): PASS at `5e1ac21`; subsequent commit only corrects test expectation 200→201 for initial grade, with application/browser sources unchanged. Browser verifies group assignment cancel/save, student submission, grade cancel/no write, save 85/comment, reload/login and status filtering; foreign workspace rejected.
- Previous #74/#75 publication also confirmed: Pages 43769328267 PASS at `98b06a7`.
- API production deployment/revision: NOT_VERIFIED / UNKNOWN. LIVE_WRITE_NOT_RUN per explicit isolated-only owner instruction. No production records were changed by acceptance.

Published interface: https://arthur200014.github.io/testing-hosting/platform/teacher.html.
UI-04 is not DONE: contextual template creation/reuse, broader library work, binary uploads and recordings remain. Existing task grading is final/immutable by API design; this block does not introduce regrading.
