# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-16
**ACTIVE_TASK:** UI-05 pupil homework/results implemented; isolated CI acceptance pending.
**ACTIVE_BRANCH:** `tas/ui05-student-homework`, [PR #87](https://github.com/Arthur200014/testing-hosting/pull/87), head `9a544bd4d3d429b3ddfaf8a2aae0cf7b70268e91`.
**MERGED_SHA:** `5f6f5a9db5b2927efa8ec5a01933b5d6e9b0075c`, [PR #86](https://github.com/Arthur200014/testing-hosting/pull/86).
**RELEASE_STATE:** MERGED + FRONTEND_PUBLISHED. [Pages 43923614370](https://github.com/Arthur200014/testing-hosting/actions/runs/43923614370) PASS; published teacher.html, teacher-data.mjs and student-card.mjs byte-match main. Backend/API/schema/configuration unchanged; existing profile API reused. Native Timeweb auto-deploy is owner-configured; independent API revision/migrations UNKNOWN / NOT_VERIFIED. LIVE_WRITE_NOT_RUN under the owner-approved isolated-only mode.
**NEXT_ACTION:** Finish PR #87 CI/PostgreSQL/browser, inspect screenshots45–46, merge/Pages/byte-check/HANDOFF. Implementation: pupil-scoped paginated native homework endpoint (workspace/membership/person/program), list/detail/answer/existing grading/results and guarded cancel/refresh/return. LOCAL17 PASS; existing integration test expanded to 301 rows/zero grade/foreign denial; existing real-browser runner covers pages/cancel/draft/save/relogin/second pupil. Schema unchanged. No Timeweb checks or live writes.

## Standing owner instructions

- Take a substantial connected scenario, covering individual and group contexts.
- Persistence tests use isolated synthetic API/PostgreSQL/Chromium workspaces only. **Do not check Timeweb** or ask for production credentials; independent production revision/live writes are not blockers in this approved mode.
- Real students, lessons, scores, settings and credentials are not test-write targets. Never retarget reset/seed/import/browser scripts to production, rerun imports, change writer or provision infrastructure incidentally. No invitations/notifications/payments.
- Tests/runner are committed in Git; reset/seed scripts must never run on real data.

## Completed #86

- Exact pupil card from student list, individual/group class and lesson; validated return to originating class/lesson, including archive/legacy contexts.
- Real attendance by month/class with independent pair-participant status; class relationships across the same person's owned study memberships. Profile and goals stay scoped to selected learning membership. Unknown attendance is shown separately.
- Existing profile edit: cancel/save/reload, draft retained on refresh and declined navigation, stale-snapshot HTTP409 protection, unrelated fields preserved, renamed pupil refreshed in class rosters. Info dialog uses actual data with keyboard/focus handling; no invented phone/email/online state.
- Changed paths: platform/teacher.html, new student-card.mjs/test, teacher-data.mjs/test, calendar-real-browser.mjs, scripts/calendar-real-browser.sh, .github/workflows/native-homework-browser.yml.
- References43–44 desktop and 390px screenshots inspected; fidelity PARTIAL. Mobile card overflow fixed. Last student-login acceptance explicitly checks HTTP status and respects rate-limit retry. No outstanding final-check failures.

## Verification

- LOCAL PASS: **15** focused Node tests, changed syntax/shell/diff checks.
- Final head `c7002f098f7d6735e5d4058815e50104fa7d4099`: [TAS CI 43921995427](https://github.com/Arthur200014/testing-hosting/actions/runs/43921995427), [PostgreSQL 43921995331](https://github.com/Arthur200014/testing-hosting/actions/runs/43921995331), [real Chromium/API/PostgreSQL 43921995317](https://github.com/Arthur200014/testing-hosting/actions/runs/43921995317): PASS. Existing **105 API integration tests** remain green.
- Browser PASS: individual/group entry and return; cancel/draft/409/save; profile persisted after teacher/student reload/login; class roster refresh; separate pair attendance; related navigation; foreign-workspace denial; no duplicate pupil creation; mobile layout.
- Final browser artifact retains 43_student_attendance_real.png, 44_student_info_real.png, 43_student_card_mobile_real.png.
- Production functional writes/Timeweb checks NOT_RUN. Published frontend bytes verified independently; isolated persistence is not production functional acceptance.

## Retained boundaries

Recordings (#84–85) remain external HTTPS references, not video uploads/playback storage. Existing service rechecks access/participation/availability/expiry; provider permissions govern copied URLs. Educational file storage remains 5MiB/file, 100MiB/workspace, preserving folder/rename/unlink/deletion access rules. Board/chat and remaining UI-05 tabs are unfinished scope, not completed by this release.

Published interface: https://arthur200014.github.io/testing-hosting/platform/teacher.html.
