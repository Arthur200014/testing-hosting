# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-16
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — UI-04, Meleto ref 17.
**ACTIVE_TASK:** UI-04 IN_PROGRESS — topic task templates and “Без задания” milestone finished.
**ACTIVE_BRANCH:** main; [PR #72](https://github.com/Arthur200014/testing-hosting/pull/72) merged; no open implementation branch.
**LAST_IMPLEMENTATION_COMMIT / MERGED_SHA:** `577c02e88c2a6e66f39f60e4531db6f6c459220f`.
**RELEASE_STATE:** MERGED; FRONTEND_DEPLOY PASS; isolated API/PostgreSQL/Chromium acceptance PASS. Timeweb native auto-deploy from main confirmed by owner; independent running revision UNKNOWN.
**NEXT_ACTION:** Continue UI-04 ref 17: inspect current Lesson/class ownership and add explicit links from topics to particular existing lessons for individual/group classes. Preserve Topic versus Lesson versus legacy LearningProgram semantics, archived read-only and workspace/class boundaries. Verify save/cancel/reload with isolated synthetic API/PostgreSQL/Chromium. Do not reopen Timeweb access as a blocker.

## Owner-approved release mode

Owner confirms Timeweb deploys latest main automatically and authorizes isolated testing + continued roadmap work when its panel is inaccessible. AGENTS.md records this. No need for production credentials/a live test workspace to continue. Independent Timeweb revision stays UNKNOWN and LIVE_WRITE_NOT_RUN is a limitation, not a blocker. Keep all production safety rules.

## UI-04 topic tasks — PR #72

- **Implemented:** explicit TeacherTopicTaskLinks; teacher-only GET/POST /api/v1/teacher/topic-tasks; composite workspace/topic and workspace/task/program FKs. ProgramId comes from the task, not the client. Repeat request returns the existing link; duplicates/conflicting request IDs return 409; invalid IDs 400; foreign or archived class writes 404.
- **Semantics:** attaches a reusable NativeHomeworkTask template, not a NativeHomeworkAssignment. Templates can be reused in individual/group topics of the same workspace without duplication. No assignments/deadlines/answers are created or changed. “Без задания” means no explicit template link; unrelated student assignments do not affect that filter.
- **UI:** task title/prompt in topic card; attach form with cancel and dirty-form guards; “Без задания” alongside all/completed filters. Task content is escaped; material links/order/completion remain intact.
- **Changed paths:** platform/class-program-ui.mjs + tests, teacher.html, teacher-data.mjs; Classes/TeacherClassTopicService.cs, Program.cs; PlatformDbContext + snapshot + additive `20261116050000_TeacherTopicTaskLinks`; TeacherSessionTests.cs and calendar-real-browser.mjs. Existing native-homework-browser.mjs correction selector now uses history, independent of calendar date.
- **LOCAL PASS:** 12 Node tests (program UI + cached teacher data), JS syntax, diff check.
- **CI PASS on `f08d9eee733663798eaaf8abf7dc191f6d1a2b9f`:** [TAS CI 43762519464](https://github.com/Arthur200014/testing-hosting/actions/runs/43762519464), [PostgreSQL integration 43762519457](https://github.com/Arthur200014/testing-hosting/actions/runs/43762519457), [Chromium + real isolated API/PostgreSQL 43762519506](https://github.com/Arthur200014/testing-hosting/actions/runs/43762519506). Covers save/cancel/reload, filter before/after linking, request replay/conflict, group reuse, foreign workspace/template, archive, anonymous rejection, unchanged template/assignment counts. Final snapshot/model and response query issues found by CI were fixed before merge.
- **FRONTEND_DEPLOY PASS:** merged-code [Pages 43762839567](https://github.com/Arthur200014/testing-hosting/actions/runs/43762839567); published [teacher UI](https://arthur200014.github.io/testing-hosting/platform/teacher.html).
- **VISUAL PARTIAL:** reference 17 and generated 17_topic_tasks_real.png inspected (browser artifact). Task attachment functional; forms/layout not pixel-matched.
- **TIMEWEB:** owner-confirmed native main auto-deploy; latest completion/revision NOT_VERIFIED / UNKNOWN. **LIVE_WRITE_NOT_RUN** in approved isolated mode. No production business data, credentials, invitations, notifications or settings changed.

## Retained scope / safety

Earlier UI-04 topic completion #71 `e79203d`, topics #70 `ca673747`, lesson materials #69 `980bb5a`, class materials #68 `2418bdc`, class homework #67 `ace061b`; detailed evidence remains in Git history.

Lesson-topic links, binary uploads, recordings, billing and chat remain incomplete; UI-04 is not DONE. Template linkage does not claim topic-specific student assignments. Real owner/student records remain read-only during acceptance. Never point reset/seed/import/calendar-real-browser.sh at production, repeat historical imports, change credentials/configuration or switch writers incidentally. Test only synthetic isolated workspaces; keep personal data/secrets out of Git, artifacts and chat.
