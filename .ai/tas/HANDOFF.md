# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-18
**ACTIVE_TASK:** UI-07 partial. Teacher profile and student package pricing merged. Teacher display name is persisted, workspace role is read from actual membership, and package amount is calculated from price per lesson and package size.
**ACTIVE_BRANCH:** none. [PR #98](https://github.com/Arthur200014/testing-hosting/pull/98) merged.
**MERGED_SHA:** `ff53bcb38ec52456eed0ffaaba65376c6f7ce80c`.
**RELEASE_STATE:** MERGED + FRONTEND_PUBLISHED. [Pages 44361177791](https://github.com/Arthur200014/testing-hosting/actions/runs/44361177791) PASS. [Published byte comparison 44361723045](https://github.com/Arthur200014/testing-hosting/actions/runs/44361723045) PASS, including teacher.html and teacher-data.mjs.
**API_DEPLOYMENT:** Native Timeweb auto-deploy configured by owner. [Automated read-only health 44361722255](https://github.com/Arthur200014/testing-hosting/actions/runs/44361722255) PASS. Running API revision NOT_VERIFIED. Authenticated live profile/package writes NOT_RUN: no confirmed synthetic live workspace with authorized credentials. Production data untouched by tests.
**NEXT_ACTION:** Continue UI-07 with a tenant-scoped student invoice and payment ledger. Add the platform plan when real tariff data is defined. Keep extending roles only with actual workspace grants. Board editor menu/settings/presets (66–68) are deferred. Keep load-40 manual.

## UI-07 first delivery verification

- [Real isolated Chromium/API/PostgreSQL 44360110622](https://github.com/Arthur200014/testing-hosting/actions/runs/44360110622) PASS. Profile save/cancel/re-entry, server-derived role, anonymous rejection, separate workspaces; package save/cancel/re-entry, computed price, edit fields and search/filter.
- [Post-merge PostgreSQL 44361179718](https://github.com/Arthur200014/testing-hosting/actions/runs/44361179718) PASS, including additive profile migration/startup. [Post-merge browser 44361179917](https://github.com/Arthur200014/testing-hosting/actions/runs/44361179917) PASS. Local JS syntax, teacher data 9/9 and diff checks PASS.
- Inspected synthetic Chromium captures at 1348 × 926 against references 55 and 53. TAS uses its own profile and package forms. The tariff section is separate and shows unavailable data. Invoice/payment recording, online charges and role editing are outside this delivery. No manual 40-editor run was started.


## Authenticated board link verification

- [Board CI 44354734973](https://github.com/Arthur200014/testing-hosting/actions/runs/44354734973): Chromium/API/PostgreSQL PASS for real clipboard copy, no requests/opening before sign-in, automatic editor opening with retained drawing, role change followed through the same link, and revoked link denied after reload and sign-in. Core, recovery and licenses PASS. Functional group success; sustained 21 in_progress at report. Manual 40 skipped.
- Post-merge [PostgreSQL 44355460385](https://github.com/Arthur200014/testing-hosting/actions/runs/44355460385) and [browser 44355460480](https://github.com/Arthur200014/testing-hosting/actions/runs/44355460480) PASS. Local URL round-trip/invalid input, syntax and diff PASS.

## Read-only grants verification

- [Board CI 44349354183](https://github.com/Arthur200014/testing-hosting/actions/runs/44349354183): Chromium/API/PostgreSQL PASS for edit → view → edit, saved scene, file-input disabled, and invalidation of both old editor and old viewer permits. Core authorization tests cover viewer scene/file-write denial. Functional group, editor build/licenses and ordinary restart/recovery PASS. Sustained 21 at report: in_progress. The manual-only 40-editor job was skipped.
- [PostgreSQL 44351618627](https://github.com/Arthur200014/testing-hosting/actions/runs/44351618627) and [browser 44351618707](https://github.com/Arthur200014/testing-hosting/actions/runs/44351618707) post-merge PASS. Local syntax, diff and CI selector 13/13 PASS.
- Previous PR #95 40-editor retry [134876838795](https://github.com/Arthur200014/testing-hosting/actions/runs/44320358897/job/134876838795) PASS. No new 40-editor test was dispatched.

## Explicit student board access verification

- [Board CI 44320358897](https://github.com/Arthur200014/testing-hosting/actions/runs/44320358897): Chromium with real isolated API/PostgreSQL PASS for teacher grant from catalog, student cabinet open/edit, teacher reopen with the saved edit, ungranted/foreign denial, revoke and regrant rejecting the old permit. Core, group, sustained 21, restart/restore and licenses PASS. JavaScript syntax, diff and selector 13/13 PASS.
- Supplemental sustained 40 first attempt: 40 editors across 2 rooms, 15 minutes, delivery p95 503ms above 500ms, durable ack p95 848ms within target. Failed job retry later PASS; no threshold change. Previous PR #94 repeat [job 134841239720](https://github.com/Arthur200014/testing-hosting/actions/runs/44312063271/job/134841239720) PASS, delivery p95 334ms and durable ack p95 649ms.
- Post-merge [PostgreSQL 44322270439](https://github.com/Arthur200014/testing-hosting/actions/runs/44322270439) and [browser 44322270368](https://github.com/Arthur200014/testing-hosting/actions/runs/44322270368) PASS. Changed isolated board API/permit, additive migration, teacher/student cabinets, editor launcher and existing browser scenario. Granting access sends no notification.

## Board organization verification

- [Board CI 44312063271](https://github.com/Arthur200014/testing-hosting/actions/runs/44312063271): real isolated Chromium/API/PostgreSQL confirmed folder create/rename, move/unfile, mark/unmark favorite, filtering, reload, foreign mutation/folder denial, same saved drawing and lesson links. Core, functional group, restart/restore, licenses and sustained 21 PASS. First 40-editor attempt reached 40 then expired under login limiter; repeat PASS (334ms delivery p95, 649ms durable ack p95). Prior PR #93 40-editor evidence remains PASS.
- Post-merge [PostgreSQL 44314384656](https://github.com/Arthur200014/testing-hosting/actions/runs/44314384656) and [browser 44314385016](https://github.com/Arthur200014/testing-hosting/actions/runs/44314385016) PASS. Local catalog projection, JS syntax/diff and CI selector 13/13 PASS. Changes: isolated board API and additive migration, teacher/catalog UI and existing browser scenario.

## Independent board verification

- [Board CI 44295251946](https://github.com/Arthur200014/testing-hosting/actions/runs/44295251946): all jobs PASS, including 21/40 sustained profiles. Chromium with real isolated API/PostgreSQL verified create → draw → link → reopen with the exact scene, foreign list/permit/update denial, mismatched lesson and class rejection, distinct legacy keys, and restart/backup recovery. Local JS syntax/diff and CI selector 13/13 PASS.
- Post-merge [PostgreSQL 44296857690](https://github.com/Arthur200014/testing-hosting/actions/runs/44296857690) and [browser 44296857630](https://github.com/Arthur200014/testing-hosting/actions/runs/44296857630) PASS. Files: teacher/catalog/board launcher, isolated board API/permit, additive migration, and existing browser scenario. Linking does not grant student access.

## UI-06 catalog verification

- [Board CI 44287671190](https://github.com/Arthur200014/testing-hosting/actions/runs/44287671190): catalog and prior lesson-editor browser flows PASS with real isolated API/PostgreSQL, including same saved scene from both entry points, class/group filter, search, links and focus. Core/access/recovery, group and licenses PASS. Supplementary capacity status at close: dotnet-board-group-soak IN_PROGRESS, dotnet-board-parallel IN_PROGRESS. No changes to relay or persistence. Prior release rechecks at 21 and 40 both PASS.
- [PostgreSQL 44289109635](https://github.com/Arthur200014/testing-hosting/actions/runs/44289109635) and [browser 44289109792](https://github.com/Arthur200014/testing-hosting/actions/runs/44289109792) PASS. Local search/sort/projection smoke, JS/shell syntax, diff and CI scope 13/13 PASS. Manual visual fidelity comparison and live board writes NOT_RUN. Timeweb automated readonly health PASS; active API revision still NOT_VERIFIED.

## UI-06 lesson board verification

- [Board CI 44283225083](https://github.com/Arthur200014/testing-hosting/actions/runs/44283225083): new teacher-cabinet navigation, draw/undo, reopen and distinct lesson scenes PASS in Chromium with real isolated API/PostgreSQL. Initial focus regression reproduced and fixed. Core, access/restart/backup, functional group and licenses PASS. Repeated 21/40 capacity jobs were streaming at release close; original 21/40 evidence below remains PASS. Transport and persistence logic did not change.
- Post-merge [PostgreSQL 44284851968](https://github.com/Arthur200014/testing-hosting/actions/runs/44284851968) and [browser 44284852041](https://github.com/Arthur200014/testing-hosting/actions/runs/44284852041) PASS. Local syntax/diff and selector 13/13 PASS. Changed `teacher.html`, `lesson-board-ui.mjs`, prototype editor bootstrap, and existing browser runners. Manual reference comparison NOT_RUN; this slice uses the existing Excalidraw editor.

## Prior prototype acceptance evidence

- Post-merge main regressions: [PostgreSQL44190121162](https://github.com/Arthur200014/testing-hosting/actions/runs/44190121162) **PASS**, including isolated backup/restore/rollback; [browser44190121273](https://github.com/Arthur200014/testing-hosting/actions/runs/44190121273) **PASS**, including two persisted synthetic teachers, actual isolated API/PostgreSQL save/reload, idempotency and tenant boundaries. Node browser policy74/74 PASS. No pending targeted checks.

- [CI44185432190](https://github.com/Arthur200014/testing-hosting/actions/runs/44185432190) at271a691: **all7 jobs PASS**. Runtime unchanged by the final40-editor adjustment. Core/PostgreSQL/transport/files/checkpoints/backup,4 scoped .NET authorization tests, actual API browser/revocation/restart, functional21 with repeated dual-delete/undo cycles,21 and40 sustained profiles, licences/fonts PASS. Local changed JS syntax/diff and CI scope13/13 PASS.
- 21-editor sustained profile: **909945ms**, delivery p95 **145ms**, durable ack p95 **413ms**. Artifact14375313348; functional21 artifact14374651895.
- 40-editor sustained profile: **2 rooms ×20**,40 distinct authenticated users (2 teachers+38 pupils),2 workspaces, **909954ms**; delivery p50 **100ms**, p95 **290ms**; durable ack p95 **453ms**. **8560 delivery samples, all40 receivers,0 dropped metrics,0 unexpected JS/crash errors**. Artifact14376645377 JSON independently read/asserted. 38 pupil logins,77 ordinary session renewals; unchanged JWT/permit expiry and IP limiter. Expected fault-injection negative acknowledgements are retained in metrics.
- Both sustained profiles pass >=15min mixed text/image/delete/undo/checkpoint actions, exact full-field/order/tombstone/file convergence, offline retry/lost ack, PNG/PDF, relay/pool restart, cold reload/PDF retrieval, tab close during pending commit, actual isolated DB pause/recovery and cross-workspace denial. Gates remain delivery p95<=500ms and durable ack<=2s. Results establish these test profiles only.
- Previous210 run44170721900 opened all210 contexts but hit a Chromium Rectangle click timeout before steady load. The owner explicitly replaced that acceptance gate with40 on18 November. No claim of210 capacity or demonstrated OOM.
- Final adjustment paths: platform/board-prototype/parallel-browser.mjs, its README, .github/workflows/board-prototype.yml and docs/architecture/tas-board-prototype.md. Reproduction, evidence and GO scope are in the architecture document and prototype README. Production live board acceptance NOT_RUN; acceptance above uses actual isolated API/PostgreSQL/Chromium.

## Standing owner instructions / limits

- Only commercially usable free/open-source board components; no mandatory SDK key, subscription or per-user/board fee. Both notice files and reviewed font licences must remain. Hosting/development costs are separate.
- Preserve the completed UI and follow RELEASE_PLAN; old Mxx/Pxx queues are historical. Owner removed in-app chat (references 51–52) from the implementation plan on 2026-11-18.
- Do not check Timeweb or request production credentials. Never write to real pupils, lessons, scores, settings or credentials; no invitations/notifications/payments, imports, production reset scripts, new service/infrastructure or Firebase writer switch incidentally.
- Durable adapter is PostgreSQL; filesystem is test-only. Fresh API session/membership checks apply before work and returned results. An append admitted before concurrent revocation may finish; this is not a transactional cross-service fence.
- API-issued scene keys survive fresh-process recovery only while scene-root/context v1 stays stable. Root rotation/migration is not implemented. PNG/JPEG/PDF files are plaintext in the trusted scoped test store; preserve access/quota/hash checks.
- Permit renewal/reconnect, teacher-only checkpoints/compaction and separate-DB backup recovery PASS. Compaction replaces covered edit history and is not an archive. Board backups also require retained API metadata and stable scene-root. Existing10000 lifetime frame limit remains. No production backup automation/offline-tab persistence claim.
- Prior UI-05 pupil feedback release PR#89 /283e8e9 remains intact: editable persisted draft with source snapshot, revision conflict protection and separate participant input. Previous Pages/publication evidence is in Git history; no real messages were sent.
