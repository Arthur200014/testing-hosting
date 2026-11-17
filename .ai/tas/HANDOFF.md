# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-17
**ACTIVE_TASK:** UI-06-P free collaborative board prototype planned; implementation NOT_STARTED. UI-05 released; next visual block paused until prototype decision.
**ACTIVE_BRANCH:** none.
**MERGED_SHA:** `283e8e9a309329e8aab9ca74bc114d034cef7a88`, [PR #89](https://github.com/Arthur200014/testing-hosting/pull/89).
**RELEASE_STATE:** MERGED + FRONTEND_PUBLISHED. [Pages 43964949913](https://github.com/Arthur200014/testing-hosting/actions/runs/43964949913) PASS; workflow-only verification fix `5d34f9828cc47e0a3c511e947687d06a17cd8d29` also published via [Pages 43965381081](https://github.com/Arthur200014/testing-hosting/actions/runs/43965381081). [Publication check 43965468835](https://github.com/Arthur200014/testing-hosting/actions/runs/43965468835), job publication, PASS: actual teacher.html, teacher-data.mjs, student-card.mjs, pupil-history.mjs, pupil-feedback.mjs and teacher-report.mjs byte-match application release283e8e9; verification fix changes no frontend bytes.
**API_DEPLOYMENT:** Native Timeweb main auto-deploy is owner-configured. New additive migration `20261117010000_PupilFeedbackDrafts` passes isolated deployment/startup/restore checks. Independent running API revision/migration application UNKNOWN / NOT_VERIFIED; LIVE_WRITE_NOT_RUN in owner-approved isolated-only mode.
**NEXT_ACTION:** Create `tas/ui06-board-prototype` from current main and implement P1→P2 of [board prototype architecture/instructions](../../docs/architecture/tas-board-prototype.md): pin MIT Excalidraw/collaboration versions, inspect only related auth/board/storage code, define one durable save/recovery path, then isolated synthetic class/lesson → board → edit/save → reload/restart. Continue P3/P4: 1 teacher +20 pupils and 10×21 parallel clients, ownership/read-only/foreign/reconnect/conflict checks. No production deployment/new service or legacy Firebase writer change in this prototype. After GO resume UI-06 refs51–52 and RELEASE_PLAN; chat remains separate.

**PLAN_UPDATE:** 2026-11-17 documentation-only update; architecture, RELEASE_PLAN, PHASE_CHECKLISTS and AGENTS aligned. App/deploy unchanged. Documentation content/link/scope checks PASS; prototype functional/access/persistence/load checks NOT_RUN. Current AGENTS/HANDOFF and source inspected through GitHub; executor unavailable.

## Standing owner instructions

- Only free commercial-use board components: no paid SDK/subscription/key or per-user/board vendor fees. Hosting/development costs remain. Prototype before further visual work; retain completed UI and return to UI-06 after GO.
- Take substantial connected blocks for individual/group contexts; follow RELEASE_PLAN, not old Mxx/Pxx boards.
- Persistence tests use isolated synthetic API/PostgreSQL/Chromium workspaces only. **Do not check Timeweb** or request production credentials; independent production revision/live writes are not blockers in this approved mode.
- Never use real students, lessons, scores, settings or credentials as write targets; never retarget seed/reset/import/browser scripts to production, rerun completed imports, change writer or provision infrastructure incidentally. No invitations/notifications/payments sent.
- Tests and runner are committed in Git. Current local execution environment was unavailable; use existing CI for checks, do not claim local runs or manual screenshot review.

## Completed #89

- Pupil Feedback tab: factual generation using the existing last8-lesson / best-test /80% homework+20% tests policy; editing, preview, cancel, save, refresh and declined-navigation draft retention, original class/lesson return, persisted teacher relogin.
- Complete pupil-scoped report input (including more than300 native assignments), with separate participant data for pairs. No report totals derived from paged history or workspace Take(300).
- One current PostgreSQL draft per membership, separately stored from profile notes/scores. Server-owned source snapshot remains fixed when editing saved text; regeneration reads fresh data. Revision/advisory lock prevents stale overwrite; latest request replay is idempotent. No message sending.
- Additive migration-managed SQL table with composite ownership FK; parameterized read/write deliberately leaves EF domain model/snapshot unchanged.
- Changed: pupil-feedback.mjs/test, student-card.mjs, teacher.html, teacher-data.mjs; Students/PupilFeedbackService.cs, Lessons/TeacherHistoryReader.cs, Program.cs; migration20261117010000; TeacherSessionTests.cs, calendar-real-browser.mjs and its shell runner; native-homework-browser workflow.
- Pages built-in workflow did not launch the expected completion hook. Readonly byte verification now follows successful main Homework import integration in the same existing browser workflow. Commit5d34f98 corrects only that trigger.

## Verification / limits

- Final application head `e8eaf6b629135e86ad105ba09ccb61c1111ebf80`: [TAS CI 43963743686](https://github.com/Arthur200014/testing-hosting/actions/runs/43963743686), [PostgreSQL 43963743408](https://github.com/Arthur200014/testing-hosting/actions/runs/43963743408), [Chromium/API/PostgreSQL 43963743449](https://github.com/Arthur200014/testing-hosting/actions/runs/43963743449): PASS. **107 API integration tests**, Node tests and changed syntax checks PASS in CI. Pure-JS syntax/policy checks also PASS; LOCAL_NODE/DB/Chromium NOT_RUN.
- API coverage: complete301-item source, own participant only, persisted snapshot, retry, concurrent saves/stale409, invalid/empty/no-lesson/foreign denial.
- Browser PASS: generate/cancel no write; edit/refresh/declined navigation; preview/save; conflict retains local text without overwriting; fresh edit/save; teacher reload/login; second pupil unchanged; foreign GET/POST404; 390px overflow; existing related scenarios remain green.
- Screenshots47_pupil_feedback_saved_real.png and47_pupil_feedback_mobile_real.png retained in artifact14274609371 (meleto-ui02-screenshots). **Manual visual comparison NOT_RUN** because execution environment unavailable; reference47 fidelity PARTIAL. No outstanding targeted CI failures.
- Frontend publication independently byte-verified; isolated persistence is not production functional acceptance. Timeweb/live writes NOT_RUN. No actual emails, invitations or notifications sent.
- Feedback is an editable draft, not automated AI assessment/delivery or a report-history archive. Saved snapshot DTOs must remain backward-compatible. Existing imported history/recordings/file access boundaries from #88 remain intact. Current schema still enforces one membership/student/workspace.
