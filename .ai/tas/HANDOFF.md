# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-16
**ACTIVE_TASK:** UI-04 IN_PROGRESS — unified class/group/lesson homework block complete.
**ACTIVE_BRANCH:** none; [PR #77](https://github.com/Arthur200014/testing-hosting/pull/77) merged.
**MERGED_SHA:** `70a5d105fe61ca614574b8cc8b5ea79c92a17247`.
**RELEASE_STATE:** MERGED + FRONTEND_PUBLISHED. [Pages 43773632077](https://github.com/Arthur200014/testing-hosting/actions/runs/43773632077) PASS; published teacher.html, teacher-data.mjs, class-native-homework.mjs and class-program-ui.mjs fetched and byte-compared with main: PASS. Timeweb native main auto-deploy configured/owner-confirmed; API deployment/revision independently NOT_VERIFIED / UNKNOWN.
**NEXT_ACTION:** Next related UI-04 library block: program-scoped template/material search and preview → reuse/attach existing items to topics/classes/lessons without copies → cancel/save/reload and isolated tenant/browser checks. Reuse current APIs first; binary uploads/recordings need actual storage/access implementation separately.

## Standing owner instructions

- Take several consecutive related steps together. Include **individual classes, groups and lessons**, not groups alone.
- Verify persistence through isolated synthetic API/PostgreSQL/browser environments only. **Do not check Timeweb** or request production access. Independent Timeweb revision/live writes are not blockers in this owner-approved mode.
- Never use real students/lessons/scores/settings/credentials as test-write targets; never retarget reset/seed/import/calendar-real-browser.sh to production. Do not rerun imports or switch writer.

## Completed #77 block

- Shared template creation and program-compatible selection in individual class, group and lesson cards. Templates are reused across classes; creation does not auto-assign. Groups choose recipients, individual class selects its pupil. Program tab links to templates/assignments.
- Lesson assignments persist class + LessonId and appear as the **same assignment** in lesson and class history. Both class formats share statuses, filters, condition/answer detail and existing grade/comment controls.
- Additive `20261116090000_NativeHomeworkContexts`: nullable IndividualClassId/LessonId, workspace FKs/indexes and mutually exclusive class-context check; existing rows preserved. Scoped class/lesson GETs filter before limit. New context POST route prevents older APIs silently dropping context. Server checks active class, approval, actual lesson participants, program compatibility and exact idempotent replay.
- Imported pupils without a persisted class retain the old personal-assignment flow. Persisted individual history also includes legacy ungrouped personal assignments, explicitly labelled; group work stays in its group. Scoped history is latest 300, not complete pagination; legacy fallback retains the old workspace-feed limit.
- Late reads preserve unsaved lesson topic/material/homework forms only for the same context; successful writes clear drafts. Browser refresh explicitly verifies typed lesson-template content survives.
- Paths: teacher.html, teacher-data.mjs/test, class-native-homework.mjs/test, class-program-ui.mjs, calendar-real-browser.mjs; native models/service/routes, DbContext/migration/snapshot and TeacherSessionTests.cs. Full diff in #77.
- Reference 18 and generated 18_individual_lesson_homework_real.png inspected: visual fidelity PARTIAL; shared forms use existing TAS cards, not a complete Meleto reproduction.

## Evidence

- LOCAL PASS: 21 focused Node tests; inline/module/browser JS syntax and diff checks.
- FINAL CI at `0c308db23417f0bafce50cd1323eb5de0f35f7fe`: [TAS gate/backend 43773237722](https://github.com/Arthur200014/testing-hosting/actions/runs/43773237722), [PostgreSQL 43773237806](https://github.com/Arthur200014/testing-hosting/actions/runs/43773237806), [real Chromium/API/PostgreSQL 43773237496](https://github.com/Arthur200014/testing-hosting/actions/runs/43773237496): PASS.
- PostgreSQL: 101/101 tests, migration/model match, startup/ready/auth and isolated restore PASS. Context replay/foreign workspace/wrong recipient/wrong lesson/archive tested; 301 newer unrelated rows cannot hide class history.
- Real browser: individual/group template reuse and lesson assignment, cancel/no write, save/relogin/reload, draft refresh, existing group submit/grade flow, tenant boundary and 390px overflow check PASS. Screenshots retained in browser-run artifact `meleto-ui02-screenshots`.
- Earlier browser failures were fixed: obsolete history selector, then late-read form replacement/unconsumed dialog. Final run PASS.
- Production API/migration state NOT_VERIFIED; LIVE_WRITE_NOT_RUN per owner instruction. No production acceptance writes, invitations, notifications or writer changes.

Published interface: https://arthur200014.github.io/testing-hosting/platform/teacher.html.
UI-04 remains IN_PROGRESS: broader library UX, binary uploads and recordings remain. Existing grading is final/immutable; regrading was not introduced.
