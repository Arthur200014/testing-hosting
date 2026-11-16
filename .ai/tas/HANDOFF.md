# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-16
**ACTIVE_TASK:** UI-04 IN_PROGRESS — external lesson recording links released.
**ACTIVE_BRANCH:** none.
**MERGED_SHA:** `c6f2aba810c56f190cc384a8a1abe889d68356e8`, [PR #84](https://github.com/Arthur200014/testing-hosting/pull/84).
**RELEASE_STATE:** MERGED + FRONTEND_PUBLISHED. [Pages 43892298459](https://github.com/Arthur200014/testing-hosting/actions/runs/43892298459) PASS; teacher.html, student.html, teacher-data.mjs, teacher-library.mjs and lesson-recordings.mjs byte-match main. API code + additive migration on main for configured native Timeweb auto-deploy. Independent API deployment/revision/migration NOT_VERIFIED / UNKNOWN; LIVE_WRITE_NOT_RUN per owner mode.
**NEXT_ACTION:** UI-04 contextual recordings in individual/group lesson cards: show that lesson's references, open source through existing authenticated endpoint, jump to library/create with lesson preselected, and return safely. Reuse the new service/module; verify cancel/save/reopen/student access in isolated API/PostgreSQL/browser, then PR/merge/Pages/HANDOFF. Do not add video storage or provision infrastructure incidentally.

## Standing owner instructions

- Take several consecutive related steps together; cover individual classes, groups and lessons.
- Persistence acceptance uses isolated synthetic API/PostgreSQL/Chromium workspaces only. **Do not check Timeweb** or request production credentials. Independent Timeweb revision/live writes are not blockers in this approved mode.
- No real students, lessons, scores, settings or credentials as test-write targets. Never retarget reset/seed/import/calendar-real-browser.sh to production, rerun imports, change writer, send invitations/notifications/payments or provision infrastructure incidentally.
- Tests/runner are saved in Git. Their reset/seed commands must never run against real data.

## Completed #84

- Separate library tab “Записи занятий”: class grouping/sidebar, search, add/edit/cancel, association with an individual/group lesson, optional explicit Moscow expiry and availability toggle. Teacher retains control of expired/disabled references.
- These are **external HTTPS links**, not video bytes or a recorder/player. Volume is unknown and not counted toward file quota. No automatic provider requests or embedded playback. Teacher supplies an existing source.
- Student list returns metadata without source URL. “Получить ссылку” fetches the authenticated endpoint, then renders an escaped external link with noopener/noreferrer. Every source read rechecks active student/program, current nonarchived individual or approved group membership, actual lesson participation, availability and expiry. Foreign workspace/nonparticipants denied; current-token requests denied immediately after revoke/expiry.
- Platform policy controls **issuance of the link**. Already-issued URLs and actual video viewing remain subject to source-provider permissions; UI explicitly explains this. Do not claim platform revokes copied external links or verifies provider playback.
- Additive `20261116190000_LessonRecordings`: recording metadata + operation receipts, workspace/lesson FKs. Revisions and existing workspace advisory lock protect concurrent/stale edits; late replay cannot revert newer metadata. Existing lessons/materials preserved; no production configuration/infrastructure changes.
- Paths: Lessons/LessonRecordingService.cs, Program.cs, DbContext/migration/snapshot; lesson-recordings.mjs/test, teacher-library/data + teacher/student pages; existing TeacherSessionTests.cs, calendar-real-browser.mjs/script, synthetic browser fixtures and workflow.
- Reference50 + final screenshot inspected; visual fidelity PARTIAL. Video uploads/large-file storage/provider integration remain separate decisions.

## Verification

- LOCAL PASS: **17** focused Node tests; changed inline/module/browser syntax, shell syntax and diff.
- FINAL head `523e6a20e5a9d9c37cde2421075ea2762da126e9`: [TAS CI 43891301565](https://github.com/Arthur200014/testing-hosting/actions/runs/43891301565), [PostgreSQL 43891301540](https://github.com/Arthur200014/testing-hosting/actions/runs/43891301540), [real Chromium/API/PostgreSQL 43891303040](https://github.com/Arthur200014/testing-hosting/actions/runs/43891303040): PASS.
- PostgreSQL **105/105**, migration/model/startup/ready/auth/isolated restore PASS. Recording regression covers URL/name validation, concurrent creation/replay/stale edits, reassignment, foreign/student/anonymous denial, metadata without URL, expiry, disabled issuance, actual participants, approval/archive revocation and no-store responses.
- Browser PASS: both class formats, create/edit/cancel/search/filter, preserved draft revision across refresh and HTTP409 conflict, authenticated exact source-link target, revoke/expiry, teacher/student reload/login, workspace isolation, 390px layout. `50_lesson_recordings_real.png` retained in final run's `meleto-ui02-screenshots` artifact.
- Fixed test harness blockers: empty recording feed in two old synthetic student fixtures; new module copied to isolated site; module initialization checked before login. Runner is executable.
- Fixed old calendar test clock dependence: count-plan create/skip expectations derive from real future-slot preview; today's passed slot is not assumed future. Production calendar code unchanged.
- External provider playback NOT_RUN (synthetic example.org links); source issuance/link attributes verified. No production writes or Timeweb verification. No outstanding failed checks at final head.

## Existing storage/library safeguards (#79–81)

PostgreSQL metadata + separate bytea file contents; **5 MiB/file, 100 MiB/workspace**, PDF/PNG/JPEG/UTF-8 TXT, two uploads/API instance. Authenticated scoped downloads, no public file URLs. Material links reuse bytes across individual/group/topic/lesson contexts. Display rename preserves original filename/bytes; exact unlink revokes selected grant; unused-file deletion frees quota with replay protection. Single-level folders organize files/links without changing bytes/access; selection persists per teacher/workspace in the same tab. These attachment limits do not support recordings.

Published interface: https://arthur200014.github.io/testing-hosting/platform/teacher.html.
