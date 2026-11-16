# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-16
**ACTIVE_TASK:** UI-05 IN_PROGRESS — pupil cards/class context implemented, isolated acceptance pending.
**ACTIVE_BRANCH:** `tas/ui05-student-cards`, PR #86, head `7e3c9c20087c1f5d81adabd4591bb9b53e7ca581`.
**MERGED_SHA:** `181d586d01e53ebac1fede8c7650a1c0a42aec6d`, [PR #85](https://github.com/Arthur200014/testing-hosting/pull/85).
**RELEASE_STATE:** MERGED + FRONTEND_PUBLISHED. [Pages 43907587097](https://github.com/Arthur200014/testing-hosting/actions/runs/43907587097) PASS; published teacher.html and lesson-recordings.mjs byte-match main. Backend/API/schema unchanged by #85; existing API from #84 reused. Native Timeweb auto-deploy is owner-configured; independent API revision/migration NOT_VERIFIED / UNKNOWN, LIVE_WRITE_NOT_RUN.
**NEXT_ACTION:** Finish PR #86 isolated CI/browser checks, fix failures, inspect reference43–44 screenshots, merge/Pages/byte comparison and update HANDOFF. Existing student/profile API reused; no backend/schema changes. No Timeweb checks, production writes or invitations.

## Standing owner instructions

- Take a substantial connected scenario, covering individual and group contexts.
- Persistence tests use isolated synthetic API/PostgreSQL/Chromium workspaces only. **Do not check Timeweb** or ask for production credentials; independent production revision/live writes are not blockers in this approved mode.
- Real students, lessons, scores, settings and credentials are not test-write targets. Never retarget reset/seed/import/browser scripts to production, rerun imports, change writer or provision infrastructure incidentally. No invitations/notifications/payments.
- Tests/runner are committed in Git; reset/seed scripts must never run on real data.

## Completed #85

- Replaced lesson-card recording placeholder with that lesson's real references, counts and availability/expiry state, source retrieval and library actions.
- From either class format: open lesson-filtered library, create/edit with the lesson locked, cancel/save back to the exact lesson; restore previous library preferences and originating class tab. Refresh retains draft fields/revision; dirty navigation requires discard confirmation. IDs/ownership/lesson consistency and session generation checked.
- Fixed archive transition: selected lesson stays visible when its class becomes archived, and uses the proper active/archive context on return. Recording create/edit controls disappear; teacher can inspect references, student issuance is revoked by existing API. Restore re-enables the card.
- Recording metadata is fetched when a lesson opens. No backend/schema/configuration changes. Changed paths: teacher.html, lesson-recordings.mjs/test, calendar-real-browser.mjs.
- References24/50; individual/group screenshots inspected. Overall fidelity PARTIAL; board/chat placeholders unchanged.

## Verification

- LOCAL PASS: **18** focused Node checks + changed inline/module/browser syntax and diff; relevant recording checks rerun after archive fix.
- FINAL head `bb04ba7302884238ffcb4027298e0e3d0a7ddf90`: [TAS CI 43906439366](https://github.com/Arthur200014/testing-hosting/actions/runs/43906439366), [PostgreSQL 43906439678](https://github.com/Arthur200014/testing-hosting/actions/runs/43906439678), [real Chromium/API/PostgreSQL 43906439717](https://github.com/Arthur200014/testing-hosting/actions/runs/43906439717): PASS. Existing **105 API integration tests**, startup/migrations/ready/restore remain green.
- Browser PASS: create/edit/cancel/list/source/return; locked lesson; refresh and declined navigation preserve draft; both formats and actual pair participants; dedicated outsider denial; student revocation; archive/restore; teacher/student reload/login; unchanged lesson records; 390px layouts.
- Screenshots `24_individual_lesson_recordings_real.png`, `24_group_lesson_recordings_real.png` retained in final run's `meleto-ui02-screenshots` artifact.
- Initial false assumption that pupil2 was a nonparticipant corrected with a dedicated synthetic outsider. Actual archive-navigation defect fixed. Final checks have no outstanding failures.
- No live writes/Timeweb checks; external provider playback NOT_RUN (synthetic links).

## Retained boundaries

Recordings are external HTTPS references, not video uploads/recording/playback storage. Existing service rechecks student/program, current class membership, actual participation, availability and expiry before issuing URL. Copied URLs/video viewing remain subject to provider permissions. No public platform file URLs or new infrastructure. Educational file storage remains 5MiB/file, 100MiB/workspace; folders/rename/unlink/guarded deletion from #79–81 preserve bytes/access rules. Large video storage and remaining visual refinement are separate backlog.

Published interface: https://arthur200014.github.io/testing-hosting/platform/teacher.html.
