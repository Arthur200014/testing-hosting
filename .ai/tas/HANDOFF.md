# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-16
**ACTIVE_TASK:** UI-05 pupil native homework/review/results released (scoped medium block).
**ACTIVE_BRANCH:** none.
**MERGED_SHA:** `08b4f9cdfaceed1768e7fdcea1e9d21c398981ca`, [PR #87](https://github.com/Arthur200014/testing-hosting/pull/87).
**RELEASE_STATE:** MERGED + FRONTEND_PUBLISHED. [Pages 43935680969](https://github.com/Arthur200014/testing-hosting/actions/runs/43935680969) PASS; published teacher.html, teacher-data.mjs and student-card.mjs byte-match main. API adds one pupil-scoped read endpoint; schema/migrations/config unchanged. Timeweb native main auto-deploy is owner-configured; independent API completion/revision UNKNOWN / NOT_VERIFIED, LIVE_WRITE_NOT_RUN under approved isolated-only mode.
**NEXT_ACTION:** Finish UI-05 native-work context filtering as another medium block: pupil Tasks/Results month + owned class filters, server filtering/count/pagination together, preserve work/detail/class return and drafts. Use references45–46 only. Existing scope intentionally shows selected membership/program over all dates; do not infer month/class totals from current pages or global truncated feeds. Isolated boundary/date/access/save/reload checks → CI/merge/Pages/HANDOFF. Imported assignments/tests/mocks and feedback remain later scope; no invitations/real-pupil writes.

## Standing owner instructions

- Take connected scenarios for individual/group contexts; current preference is medium-sized blocks.
- Persistence tests use isolated synthetic API/PostgreSQL/Chromium workspaces only. **Do not check Timeweb** or ask for production credentials; independent production revision/live writes are not blockers in this approved mode.
- Real students, lessons, scores, settings and credentials are not test-write targets. Never retarget reset/seed/import/browser scripts to production, rerun imports, change writer or provision infrastructure incidentally. No invitations/notifications/payments.
- Tests/runner are committed in Git; reset/seed scripts must never run on real data.

## Completed #87

- Pupil Tasks/Results tabs: paged native assignments → condition/actual answer → existing grading form → saved result/list/return. Source class/lesson context retained for individual and group navigation.
- GET teacher/students/{membershipId}/homework?page=N&results=BOOL checks owned active membership and filters exact workspace/membership/StudentId/ProgramId before count/order/page20. Results includes actual graded rows, including 0%. Global workspace Take(300) is not used.
- Existing idempotent grading write/API unchanged. Cancel/reset does not write; refresh retains draft, declined navigation keeps it, related caches invalidate after assignment/grade. Exact owned work ID checked before grading.
- UI clearly labels native work and all dates. Imported work/tests/mocks stay in their existing sections; no fabricated aggregates. References45–46 fidelity PARTIAL (month/class filters and other result types pending).
- Changed: platform/teacher.html, student-card.mjs/test, teacher-data.mjs/test, calendar-real-browser.mjs; API Program.cs and Homework/NativeHomeworkService.cs + NativeHomeworkModels.cs; existing TeacherSessionTests.cs extended. No schema/config changes.

## Verification

- LOCAL PASS: **17** focused Node checks + changed inline/module/browser syntax/diff.
- Final head `129598177fbf264b98d762ae3ab0323ed6335353`: [TAS CI 43934353464](https://github.com/Arthur200014/testing-hosting/actions/runs/43934353464), [PostgreSQL 43934353419](https://github.com/Arthur200014/testing-hosting/actions/runs/43934353419), [real Chromium/API/PostgreSQL 43934353428](https://github.com/Arthur200014/testing-hosting/actions/runs/43934353428): PASS. Existing **105 API integration tests** green; expanded context test verifies 301 records across all pages, bounded page handling, 0% result and foreign-workspace404.
- Browser PASS: paged pupil list; exact answer; cancel/reset no write; refresh draft retention; declined navigation; grade0; teacher reload/login; student API readback; second participant unchanged; group lesson return; 390px overflow assertion. Previous class/profile/recording scenarios also pass in existing runner.
- Inspected screenshots45_student_work_list_real.png, 46_student_work_result_real.png, 46_student_work_mobile_real.png in final run artifact meleto-ui02-screenshots.
- Initial failures were test setup (missing required submission/grade IDs) and assertion (first grade is201, replay200); corrected without changing application constraints. No outstanding final failures.
- Production functional writes/Timeweb checks NOT_RUN. Frontend bytes verified independently; isolated persistence is not production functional acceptance. New endpoint requires native API rollout; running revision is not independently established.

## Retained boundaries

Pupil profile/attendance/class context from #86 remains published. Recordings (#84–85) remain external HTTPS references, not video uploads/playback storage, with existing access/participation/availability/expiry checks. Provider permissions govern copied URLs. Educational file storage remains5MiB/file,100MiB/workspace with existing access rules. Board/chat, remaining UI-05 feedback/invitations and wider visual refinement are unfinished scope.

Published interface: https://arthur200014.github.io/testing-hosting/platform/teacher.html.
