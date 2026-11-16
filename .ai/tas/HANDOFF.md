# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-16
**ACTIVE_TASK:** UI-05 cross-source pupil learning history released.
**ACTIVE_BRANCH:** none.
**MERGED_SHA:** `f3ca3fd919649d33d0dd756c331be08d15f9177d`, [PR #88](https://github.com/Arthur200014/testing-hosting/pull/88).
**RELEASE_STATE:** MERGED + FRONTEND_PUBLISHED. [Pages 43953164765](https://github.com/Arthur200014/testing-hosting/actions/runs/43953164765) PASS; published teacher.html, teacher-data.mjs, student-card.mjs and pupil-history.mjs byte-match main. API extended; no schema/migration/config changes. Native Timeweb main auto-deploy is owner-configured; independent API completion/revision UNKNOWN / NOT_VERIFIED, LIVE_WRITE_NOT_RUN in approved isolated-only mode.
**NEXT_ACTION:** UI-05 pupil feedback/report draft (reference47 only): existing pupil context → generate draft from complete scoped pupil data → review/edit/cancel/save/reload → return to originating class/lesson. Inspect existing report code and preserve its actual scoring policy; never calculate report totals from paged history items or truncated workspace nativeAssignments. Reuse/add a minimal complete pupil input/aggregate as needed. No sending messages, invitations or notifications in this block. Verify isolated persistence/access and teacher reload, then CI/merge/Pages/HANDOFF. Take the connected report scenario, not a filters-only task.

## Standing owner instructions

- Latest preference: substantial connected blocks, covering individual/group contexts.
- Persistence tests use isolated synthetic API/PostgreSQL/Chromium workspaces only. **Do not check Timeweb** or ask for production credentials; independent production revision/live writes are not blockers in this approved mode.
- Real students, lessons, scores, settings and credentials are not test-write targets. Never retarget reset/seed/import/browser scripts to production, rerun imports, change writer or provision infrastructure incidentally. No invitations/notifications/payments.
- Tests/runner are committed in Git; reset/seed scripts must never run on real data.

## Completed #88

- Pupil Tasks/Results exposes seven sources: native homework, imported homework with actual submission events, live/historical tests, mock summaries/sessions/independent task events. Actual IDs distinguish repeated attempts; missing values remain missing and 0% remains valid.
- Source/list/detail/paging, imported task HTTPS/HTTP link, summary → mock tasks by exact mock ID/date → return to summary, plus original class/lesson return and teacher relogin. Historical records readonly; existing native grading/cancel/draft protection preserved.
- New GET teacher/students/{membershipId}/history validates owned active membership; every source filters workspace/membership/student/program before count/order/page20. Native homework endpoint adds exact owned class + month filters. Historical class relationships are not inferred from names or dates.
- Month semantics: homework uses assignment date; live tests use completion date; historical tests/mocks use saved date; sessions use start date. Moscow instant boundaries are converted to UTC for Npgsql. Counts/pages share the filtered query. Cache keys separate source/month/class/page/mock target; cross-workspace reset retained.
- Changed: platform/pupil-history.mjs/test, student-card.mjs, teacher-data.mjs, teacher.html; Students/PupilHistoryReader.cs, Homework/NativeHomeworkService.cs, Program.cs; TeacherSessionTests.cs, calendar-real-browser.mjs, scripts/calendar-real-browser.sh, test-fixtures/pupil-history.sql, native-homework-browser workflow.
- References45–46 screenshots inspected. Fidelity PARTIAL; shared header dynamics and feedback/report remain unfinished. Fixture SQL is guarded by disposable compose project, localhost API, synthetic database/user and owned synthetic pupil.

## Verification

- LOCAL PASS: **17** focused Node tests + module/inline/browser/shell syntax and diff checks.
- Final head `e4fb27615d41f0356d8c455cd8bb0c6e801f8c5a`: [TAS CI 43951782634](https://github.com/Arthur200014/testing-hosting/actions/runs/43951782634), [PostgreSQL 43951782534](https://github.com/Arthur200014/testing-hosting/actions/runs/43951782534), [real Chromium/API/PostgreSQL 43951782524](https://github.com/Arthur200014/testing-hosting/actions/runs/43951782524): PASS. **106 API integration tests** green.
- API coverage: all sources; repeated test IDs with distinct event IDs; same-name other-program pupil; Moscow month edges; pages; 0/null; invalid parameters/foreign denial; exact native class filters without attributing unlinked legacy work.
- Browser PASS: native group/individual filters, empty period/reset, 21 imported rows across pages, actual 0% submission details and safe source link, historical/live test and session details, mock task drill-down/back, teacher reload/login, second pupil unchanged/foreign404, 390px layout; previous profile and grade save/cancel/reload scenarios remain green.
- Inspected final artifact screenshots: 45_pupil_imported_attempts_real.png, 46_pupil_mock_breakdown_real.png, 46_pupil_history_mobile_real.png (meleto-ui02-screenshots).
- Fixed actual UTC query-parameter defect. Corrected fixture assumption: current DB enforces one membership/student/workspace, so a separate same-name person tests other-program isolation. Do not claim multiple study memberships are supported by current schema. No outstanding final failures.
- Production functional writes/Timeweb checks NOT_RUN. Frontend bytes verified independently; isolated persistence is not production functional acceptance. New history endpoint requires native API rollout; running revision remains independently unknown.

## Retained boundaries

Recordings remain external HTTPS references with existing access/participation/availability/expiry checks, not video storage. Educational file storage remains 5MiB/file, 100MiB/workspace with existing access rules. No completed imports rerun. Broader multiple-study membership changes, feedback/report drafts, invitations, board/chat and remaining visual refinement are separate unfinished scope.

Published interface: https://arthur200014.github.io/testing-hosting/platform/teacher.html.
