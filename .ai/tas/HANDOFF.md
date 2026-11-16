# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-16
**ACTIVE_TASK:** UI-04 IN_PROGRESS — library folders implemented, isolated acceptance pending.
**ACTIVE_BRANCH:** `tas/ui04-library-folders`, PR #81, head `8bc775f314c6de0f5565740ff8e62e6d74eaf36b`.
**MERGED_SHA:** `af413af9a3e4d839dc728257532275faff6bc672`, [PR #80](https://github.com/Arthur200014/testing-hosting/pull/80).
**RELEASE_STATE:** MERGED + FRONTEND_PUBLISHED. [Pages 43821874800](https://github.com/Arthur200014/testing-hosting/actions/runs/43821874800) PASS; published teacher.html, student.html and teacher-library.mjs byte-match main. API code + additive migration are on main for configured native Timeweb auto-deploy. Independent API deployment/revision/migration NOT_VERIFIED / UNKNOWN; LIVE_WRITE_NOT_RUN per owner instruction.
**NEXT_ACTION:** Finish PR #81 isolated PostgreSQL/browser checks, fix failures, merge and publish Pages, compare published bytes and update HANDOFF. Recordings/large-file storage remain separate.

## Standing owner instructions

- Take several consecutive related steps together; cover individual classes, groups and lessons.
- All persistence acceptance uses isolated synthetic API/PostgreSQL/Chromium workspaces. **Do not check Timeweb** or request production credentials. Independent Timeweb revision/live writes are not blockers in this approved mode.
- Never use real students, lessons, scores, settings or credentials as test-write targets. Never retarget reset/seed/import/calendar-real-browser.sh to production, rerun imports, change writer, send invitations/notifications/payments or provision production infrastructure incidentally.
- Tests and browser runner are committed in Git for repeatable checks; they use synthetic fixtures, not production data.

## Completed #80

- Library display-title rename + cancel; original filename/bytes remain intact. Expected revision rejects a stale window with HTTP409; refresh preserves draft text AND original revision, cancel restores loaded title.
- Exact class/topic/lesson bindings are shown for individual/group contexts. Unlink removes only the chosen binding; other bindings retain access. Student list refresh updates labels/access; final unlink revokes current-token download while teacher keeps the file.
- Explicit guarded deletion of unused file/link only; server rechecks all bindings transactionally. Active file bytes are removed and workspace quota recovered. Metadata tombstones/receipts prevent old upload/attachment retries resurrecting bytes or access; replay is idempotent. Shared workspace advisory lock covers upload/attach/manage races.
- Additive `20261116140000_MaterialManagement`: title revisions, deletion timestamps, immutable original upload label and operation receipts. Preserves old materials and legacy upload replay. No new production configuration.
- Paths: Classes/TeacherMaterialManagement.cs, material/file/lesson/topic services, Program.cs, DbContext/migration/snapshot; teacher-library.mjs/test, teacher/student pages; existing TeacherSessionTests.cs, calendar-real-browser.mjs and browser workflow.
- Existing #79 storage stays PostgreSQL metadata + separate bytea content; **5 MiB/file, 100 MiB/workspace**, PDF/PNG/JPEG/UTF-8 TXT, two uploads/API instance. Teacher/student downloads are authenticated and workspace-scoped; bindings reuse bytes. No public sharing, folders or recording uploads yet.

## Verification

- LOCAL PASS: 17 focused Node checks; changed inline/module/browser syntax and diff checks.
- FINAL head `f7745b76652a87e7f18b870dd9fb87e5ebe4687b`: [TAS CI 43821214273](https://github.com/Arthur200014/testing-hosting/actions/runs/43821214273), [PostgreSQL 43821214270](https://github.com/Arthur200014/testing-hosting/actions/runs/43821214270), [real Chromium/API/PostgreSQL 43821214380](https://github.com/Arthur200014/testing-hosting/actions/runs/43821214380): PASS.
- PostgreSQL **103/103** tests; migration/model/startup/ready/auth/isolated restore PASS. Management regression covers foreign/student denial, replay, stale edits, individual/group/topic/lesson grants, unlink revocation, attach/delete race, actual byte deletion and a full-quota upload after recovery.
- Browser PASS: cancel/save/conflict/student refresh/unlink/delete/quota reuse/reload/login; exact download bytes preserved; foreign workspace empty. Screenshot `49_file_management_real.png` inspected against reference49, 390px overflow PASS. Artifact `meleto-ui02-screenshots` retained in final browser run. Visual fidelity remains PARTIAL; folders and remaining reference details are future work.
- Earlier browser failure was an incorrect expected error-message string; fixed to assert real HTTP409 plus the existing common UI notice, final run PASS.
- No outstanding implementation/check failures. Production API/migration not independently verified; no live writes, per owner mode.

Published interface: https://arthur200014.github.io/testing-hosting/platform/teacher.html.
