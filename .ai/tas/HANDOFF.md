# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-16
**ACTIVE_TASK:** UI-04 IN_PROGRESS — workspace library folders released.
**ACTIVE_BRANCH:** none.
**MERGED_SHA:** `d31125cb1f1f59f54b802f983bf2403a49351807`, [PR #81](https://github.com/Arthur200014/testing-hosting/pull/81).
**RELEASE_STATE:** MERGED + FRONTEND_PUBLISHED. [Pages 43847840704](https://github.com/Arthur200014/testing-hosting/actions/runs/43847840704) PASS; published teacher.html, teacher-library.mjs and teacher-data.mjs byte-match main. API code + additive migration are on main for configured native Timeweb auto-deploy. Independent API deployment/revision/migration NOT_VERIFIED / UNKNOWN; LIVE_WRITE_NOT_RUN per owner instruction.
**NEXT_ACTION:** UI-04 recordings (reference50): inspect that screen and existing material/lesson contracts, then implement the separate recordings list and lesson association/opening scenario with isolated persistence/access/reload acceptance. Do not present educational 5MiB attachments as recording storage, invent playback or provision production infrastructure. Real large-file storage, if needed, requires a concrete separate decision. Complete PR/merge/Pages/HANDOFF for the scoped scenario.

## Standing owner instructions

- Take several consecutive related steps together; cover individual classes, groups and lessons.
- Persistence checks use isolated synthetic API/PostgreSQL/Chromium workspaces only. **Do not check Timeweb** or request production credentials. Independent Timeweb revision/live writes are not blockers in this approved mode.
- No real students, lessons, scores, settings or credentials as test-write targets. Never retarget reset/seed/import/calendar-real-browser.sh to production, rerun imports, change writer, send invitations/notifications/payments or provision infrastructure incidentally.
- Tests and real-browser runner are committed in Git. These use synthetic fixtures; do not run their reset/seed scripts against real data.

## Completed #81

- Workspace folders: create/rename/cancel, folder counts, all-library/unfiled/folder navigation. Files AND link materials can move into a folder or back to unfiled; task templates stay outside folder containers.
- Move changes only material metadata. Stored bytes, quota and existing individual/group/topic/lesson bindings and student access are preserved. Upload completion reveals the new unfiled file in the common list.
- Selected folder survives reload/login in the same tab through sessionStorage scoped to authenticated WorkspaceId + TeacherId; only folder ID is stored. Other workspace starts separately; missing folder falls back safely.
- Expected revisions prevent stale rename/move. Dirty folder/move drafts retain fields and original revision across refresh. Shared workspace lock serializes writes; receipts make create/rename/move retries idempotent and prevent old retries restoring previous state.
- Additive `20261116160000_LibraryFolders`: folder and receipt tables + nullable material FolderId, workspace-composite FK. Existing materials stay unfiled; no data conversion/configuration/infrastructure changes.
- Paths: Classes/TeacherLibraryFolderService.cs, TeacherMaterialManagement.cs, TeacherMaterialService.cs, Program.cs, DbContext/migration/snapshot; teacher-library.mjs/test, teacher-data.mjs, teacher.html; existing TeacherSessionTests.cs, calendar-real-browser.mjs and browser workflow.
- Single-level folders implemented; nested folders/delete-folders and remaining visual detail are not implemented. Reference48–49 fidelity remains PARTIAL.

## Verification

- LOCAL PASS: **15** focused Node checks; changed module/inline/browser syntax and diff checks.
- FINAL head `79aa24b6d64babdf499fe39427ec09242f9670e7`: [TAS CI 43847056752](https://github.com/Arthur200014/testing-hosting/actions/runs/43847056752), [PostgreSQL 43847056784](https://github.com/Arthur200014/testing-hosting/actions/runs/43847056784), [real Chromium/API/PostgreSQL 43847056743](https://github.com/Arthur200014/testing-hosting/actions/runs/43847056743): PASS.
- PostgreSQL **104/104**, migration/model/startup/ready/auth/isolated restore PASS. New regression covers trimmed/invalid names, concurrent create and stale moves, replay after later changes, foreign/student denial, unchanged bytes/grants and one stored content row.
- Browser PASS: folder create/rename/cancel/empty state; file + link move/cancel/refresh; unchanged quota, exact bytes and class grants; reload/login selection; move back to unfiled; foreign workspace isolation; 390px overflow. Screenshot `49_library_folders_real.png` inspected against reference49; retained in `meleto-ui02-screenshots` artifact of final browser run.
- Initial migration overload compile error fixed using named arguments; final checks green. No outstanding failed implementation checks. Production API/migration not independently verified; no production writes.

## Existing material storage safeguards (#79–80)

PostgreSQL metadata + separate bytea contents; **5 MiB/file, 100 MiB/workspace**, PDF/PNG/JPEG/UTF-8 TXT, two uploads/API instance. Authenticated workspace-scoped teacher/student downloads, no public file URLs. Reuse through individual/group/topic/lesson links. Display rename preserves original filename/bytes; exact unlink revokes only selected grant. Guarded unused-file deletion frees quota, tombstones/receipts block replay resurrection. Folder moves preserve these rules. Recordings/large files remain separate.

Published interface: https://arthur200014.github.io/testing-hosting/platform/teacher.html.
