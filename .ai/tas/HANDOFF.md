# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-16
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — UI-04.
**ACTIVE_TASK:** UI-04 IN_PROGRESS — full class-program-to-lesson workflow finished (refs 17/25).
**ACTIVE_BRANCH:** main; [PR #73](https://github.com/Arthur200014/testing-hosting/pull/73) merged; no open implementation branch.
**LAST_IMPLEMENTATION_COMMIT / MERGED_SHA:** `369ac3854bfff511ac690f4c6e8297240a5baf78`.
**RELEASE_STATE:** MERGED; FRONTEND_DEPLOY PASS; isolated API/PostgreSQL/Chromium acceptance PASS. Timeweb native main auto-deploy owner-confirmed; independent running revision UNKNOWN.
**NEXT_ACTION:** Complete a cohesive UI-04 **group homework** workflow (refs 18/27–29 as needed): class-scoped assignment of an existing template to selected approved group members, deadlines, persisted assignment/submission/grade views and save/cancel/reload. Inspect NativeHomeworkService/Models, group membership and teacher.html classNativeTasksTab/groupClassDetail before choosing schema/API changes. Preserve template vs assignment and member program compatibility; teacher-wide assignment lists alone do not establish class ownership. Reuse existing student submit/teacher grade paths where valid. Keep isolated synthetic verification, then required CI, merge, Pages and HANDOFF.

## Standing owner instructions

Owner confirms Timeweb deploys latest main automatically; isolated testing is authorized when its panel is inaccessible. AGENTS.md records this mode. No need for production credentials/a live workspace to continue. Timeweb revision UNKNOWN and LIVE_WRITE_NOT_RUN are limitations, not blockers. **Owner now requests larger complete user workflows, not tiny successive UI milestones**; use one cohesive scenario with its API, storage, UI, validation and publication.

## Program-to-lesson workflow — PR #73

- **Implemented end to end:** add/remove topic links in class program, open the linked lesson, edit/save/cancel the entire selected topic set in its card; up to 50 topics. Works for individual/group classes. Program cards list their linked lessons; lesson cards display selected topic plans, materials and task templates directly from the program without copies.
- **Storage/API:** additive `20261116060000_TeacherLessonTopics` creates TeacherLessonTopicLinks (composite workspace/lesson and workspace/topic FKs) and independent Lessons.TopicRevision=0. Teacher-only GET/POST /api/v1/teacher/lesson-topics uses exact workspace/class ownership, atomic serializable set replacement, expected revision, immediate replay and 409 for stale/concurrent writes (including wrapped PostgreSQL serialization errors). Archive writes and unlinked legacy lessons are rejected; existing lesson/topic records are not converted.
- **Preserved semantics:** topic completion, lesson completion, attendance/results, direct lesson material links and student assignments stay separate. Selecting a topic does not issue homework or complete a topic/lesson. Existing synthetic history/assignment/material/template counts were checked unchanged.
- **Draft/UI behavior:** guards prevent navigation or adjacent form saves from silently discarding program/material drafts; cancel resets only its form. Checkbox alignment verified visually. Modified teacher.html, teacher-data.mjs, class-program-ui.mjs + tests, new lesson-topics-ui.mjs + tests, meleto-fidelity.css; new Lessons/TeacherLessonTopicService.cs, Lesson.cs, Program.cs and persistence model/migration/snapshot; existing API and real-browser tests/workflow/copy script extended. Full paths/diff are in PR #73.
- **LOCAL PASS:** 16 focused Node tests, JS syntax, diff check; lesson UI tests rechecked after cosmetic adjustment.
- **FINAL CI PASS on `ebc3768cc096f27b7f0479f82479d217b60c60c4`:** [TAS CI 43765273908](https://github.com/Arthur200014/testing-hosting/actions/runs/43765273908), [PostgreSQL 43765273949](https://github.com/Arthur200014/testing-hosting/actions/runs/43765273949), [Chromium + actual isolated API/PostgreSQL 43765274008](https://github.com/Arthur200014/testing-hosting/actions/runs/43765274008). Covers both class formats, add/edit/remove/cancel/reload, inherited content without copies, draft protection, replay/stale/concurrent writes, other class/workspace, archive, legacy and anonymous rejection.
- **FRONTEND_DEPLOY PASS:** merged-code [Pages 43765623105](https://github.com/Arthur200014/testing-hosting/actions/runs/43765623105); published [teacher UI](https://arthur200014.github.io/testing-hosting/platform/teacher.html).
- **VISUAL PARTIAL:** refs 17/25 and generated individual/group program screenshots inspected; final group screenshot confirms checkbox alignment. Functional workflow is complete; no claim of full pixel match or whole UI-04.
- **TIMEWEB:** existing native main auto-deploy owner-confirmed; latest completion/revision NOT_VERIFIED / UNKNOWN. **LIVE_WRITE_NOT_RUN** under approved isolated mode. No production business records, settings, passwords, notifications or invitations changed.

## Retained scope and safety

Earlier UI-04 template links #72 `577c02e`, completion #71 `e79203d`, topics #70 `ca673747`, lesson/class materials #69/#68 and individual homework #67 remain. Detailed older evidence is in Git history.

Group homework, binary uploads/recordings, broader library management, billing and chat remain incomplete; UI-04 is not DONE. Existing real owner/student records remain read-only during acceptance. Never point reset/seed/import/calendar-real-browser.sh at production, repeat historical imports, change credentials/configuration or switch writers incidentally. Use synthetic isolated workspaces; keep personal data and secrets out of Git, artifacts and chat.
