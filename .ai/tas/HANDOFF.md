# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-16
**ACTIVE_TASK:** UI-04 IN_PROGRESS — bounded file upload/protected access/reuse block complete.
**ACTIVE_BRANCH:** none; [PR #79](https://github.com/Arthur200014/testing-hosting/pull/79) merged.
**MERGED_SHA:** `19ab684f54d9052651fd55fdd609b7e2ecf0c5cb`.
**RELEASE_STATE:** MERGED + FRONTEND_PUBLISHED. [Pages 43812116451](https://github.com/Arthur200014/testing-hosting/actions/runs/43812116451) PASS; 9 changed published teacher/student/module files byte-compared with main: PASS. API changes and additive migration committed for configured native Timeweb auto-deploy; independent API revision/migration NOT_VERIFIED / UNKNOWN.
**NEXT_ACTION:** Next related UI-04 file-management block (reference 49): rename display labels without changing bytes → detach material links without deleting shared files → guarded deletion only for unused library files/materials, with quota recovery, cancel/reload/idempotency and isolated teacher/student permission checks. Do not delete real records during acceptance. Keep recordings/large-object storage separate; do not expand this PostgreSQL slice incidentally.

## Standing owner instructions

- Take several consecutive related steps together; cover individual classes, groups and lessons.
- Persistence tests use isolated synthetic API/PostgreSQL/browser environments only. **Do not check Timeweb** or request production access. Independent Timeweb revision/live writes are not blockers in this approved mode.
- Real students, lessons, scores, settings and credentials are not test-write targets. Never retarget reset/seed/import/calendar-real-browser.sh to production, rerun imports, change writer or provision production infrastructure incidentally.

## Completed #79

- Library uploads PDF/PNG/JPEG/UTF-8 TXT with extension/signature/filename checks. Limit **5 MiB/file, 100 MiB/workspace**, two concurrent uploads/API instance; serialized quota and request replay prevent quota races/duplicates. These are small educational attachments, not recording storage.
- Existing durable PostgreSQL stores metadata in TeacherFileAssets and bytes separately in TeacherFileContents (bytea). Additive `20261116120000_TeacherFileAssets` adds tables + nullable TeacherMaterials.FileAssetId with workspace FKs/indexes; old link materials preserved. No new dependency, infrastructure, environment variable or production configuration.
- Teacher download requires active teacher authorization in the owning workspace. Student file list/download rechecks active student/program membership and current individual class, approved group/topic, or actual lesson participation. Unbound files are private; removal of approval/archive revokes access. File IDs are not public URLs; no bearer tokens in links.
- Header-authorized fetch → temporary browser Blob download; attachment/no-store/nosniff response. Library lists load metadata only. One material/file is reused in class/topic/lesson; downloads work from those teacher screens and the student cabinet.
- UI upload cancel writes nothing; invalid upload shows an error; successful upload is confirmed by API. Retry retains request identity. Upload selection is held only in session memory and reset across workspace/logout.
- Paths: TeacherFileService.cs, material projection services, Program.cs, DbContext/migration/snapshot; material-file.mjs/test, teacher/student pages, library/data + class/lesson/topic renderers; existing API/browser tests, runner and workflow. Full 24-file diff in #79.
- Reference 48 + final teacher/student screenshots inspected: visual fidelity PARTIAL. No folders, recording uploads, public sharing or virus-scanning claims. Current file deletion/unlink UI is not implemented.

## Verification

- LOCAL PASS: 32 focused Node checks, inline/module/browser syntax and diff checks.
- FINAL CI at `0daa3477fbe34d5d7db2f43a474bc882b213263c`: [TAS CI 43811679789](https://github.com/Arthur200014/testing-hosting/actions/runs/43811679789), [PostgreSQL 43811679793](https://github.com/Arthur200014/testing-hosting/actions/runs/43811679793), [real Chromium/API/PostgreSQL 43811679815](https://github.com/Arthur200014/testing-hosting/actions/runs/43811679815): PASS.
- PostgreSQL: **102/102 tests**, migration/model/startup/ready/auth and existing isolated restore checks PASS. Covers exact bytes, empty/malformed/oversize input, quota, sequential/concurrent replay, anonymous/foreign/other-pupil denial, actual lesson participants and approval/archive revocation.
- Browser: cancel/error/upload, teacher + student byte-for-byte downloads, unbound/unauthorized denial, reuse without copies, reload/login and 390px layout PASS. Screenshots 48_binary_file_library_real.png / 48_student_file_access_real.png retained in browser-run artifact.
- Earlier compile/snapshot-order/fixture failures were fixed; final run PASS. API-route/material-service changes now trigger browser workflow.
- LIVE_WRITE_NOT_RUN; production API/migration NOT_VERIFIED per owner instruction. No real student writes, invitations, notifications or writer changes.

Published interface: https://arthur200014.github.io/testing-hosting/platform/teacher.html.
UI-04 remains IN_PROGRESS: file management/folders, recordings/large-file storage and remaining reference details.
