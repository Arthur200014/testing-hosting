# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-16
**ACTIVE_TASK:** UI-04 IN_PROGRESS — real file attachments.
**ACTIVE_BRANCH:** `tas/ui04-file-attachments`, backend checkpoint `afc6fd1b4bd2ff8cd2fb5e8fbca5851635c87298`; UI/browser integration in progress, not releasable yet.
**MERGED_SHA:** `3774a94857dacd33b4342314a739ba2c08b748dc`.
**RELEASE_STATE:** MERGED + FRONTEND_PUBLISHED. [Pages 43777340175](https://github.com/Arthur200014/testing-hosting/actions/runs/43777340175) PASS; published teacher.html, teacher-data.mjs and teacher-library.mjs fetched and byte-compared with main: PASS. API/schema unchanged in this block. Timeweb native main auto-deploy owner-confirmed; independent API revision UNKNOWN.
**NEXT_ACTION:** Finish file upload/download UI and isolated browser acceptance on active branch; inspect backend CI, fix failures, then PR/merge/Pages. Existing PostgreSQL is durable storage for this bounded slice (5 MiB/file, 100 MiB/workspace), metadata/content separated. No new production infrastructure or Timeweb checks. Recordings remain separate.

## Standing owner instructions

- Take several consecutive related steps together; cover individual classes, groups and lessons.
- Verify persistence only in isolated synthetic API/PostgreSQL/browser environments. **Do not check Timeweb** or request production access. Independent Timeweb revision/live writes are not blockers in this approved mode.
- Real students/lessons/scores/settings/credentials are not test-write targets. Never retarget reset/seed/import/calendar-real-browser.sh to production, rerun imports or switch writer.

## Completed #78

- Library nav opens templates and link materials: title/condition/URL search, type/program filters, sorting, preview and usage counts. Link programs derive from existing class/topic associations and actual lesson participants; not new material ownership metadata.
- Materials reuse existing IDs in active classes/topics/lessons; templates attach to compatible topics. Assignment jump opens the existing class/lesson homework form with the selected template and writes nothing until explicit save there. Lesson picker includes date/time.
- Existing/archived/incompatible targets are excluded. Draft attachment selection survives refresh; cancel writes nothing; changing workspace clears library search/filters/selection. No source-object copies.
- Fixed narrow-screen wrapping and library header margins; preview does not inherit sidebar behavior.
- Paths: platform/teacher-library.mjs/test, teacher.html, teacher-data.mjs, calendar-real-browser.mjs, scripts/calendar-real-browser.sh; .github/workflows/native-homework-browser.yml. Existing backend/schema/storage configs unchanged.
- Reference 48 and final desktop/mobile 48_library_reuse_real*.png inspected: visual fidelity PARTIAL; implemented template/link catalog, not binary files, folders or recordings. No fake storage quota/upload state.

## Verification

- LOCAL PASS: 13 focused Node tests; inline/module/browser syntax and diff checks.
- FINAL CI at `00e9aa887d1fa00dc7bed3390a4f5cf6f6dcc15a`: [TAS CI 43776922984](https://github.com/Arthur200014/testing-hosting/actions/runs/43776922984), [PostgreSQL 43776922982](https://github.com/Arthur200014/testing-hosting/actions/runs/43776922982), [real Chromium/API/PostgreSQL 43776923008](https://github.com/Arthur200014/testing-hosting/actions/runs/43776923008): PASS.
- PostgreSQL: 101/101 tests. Browser: search/preview, class/topic/lesson reuse, cancel/no write, no copies, task assignment jump/save, relogin/reload, draft refresh, foreign workspace empty/filter reset and 390px overflow PASS.
- Screenshot artifact `meleto-ui02-screenshots` retained in browser run; workflow now uploads diagnostic screenshots on failures too. Earlier mobile overflow failures were fixed; final run PASS.
- LIVE_WRITE_NOT_RUN; API production deployment NOT_VERIFIED per isolated-only instruction. No production data, invitations, notifications or writer changes.
- Previous unified individual/group/lesson homework release #77 remains intact. Existing latest-300 histories and immutable grading remain; no regrading introduced.

Published interface: https://arthur200014.github.io/testing-hosting/platform/teacher.html.
UI-04 remains IN_PROGRESS: binary files/access, recordings and remaining library/reference details.
