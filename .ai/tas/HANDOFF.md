# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-19
**ACTIVE_TASK:** UI-08 isolated shared-board keyboard entry, exit and focus restoration.
**ACTIVE_BRANCH:** none. [PR #105](https://github.com/Arthur200014/testing-hosting/pull/105) merged.
**MERGED_SHA:** `dd87df3f6659e5f9bb1128c6b950ca13a18b4914`.
**RELEASE_STATE:** MERGED + FRONTEND_PUBLISHED. [Pages](https://github.com/Arthur200014/testing-hosting/actions/runs/44467656779) PASS. Published `platform/lesson-board-ui.mjs` byte-matches the release. The public teacher cabinet loaded it in Chromium. Board launch remains loopback-only by design.
**API_DEPLOYMENT:** API-independent change. Public readiness and migration endpoints returned HTTP 200; running API SHA UNKNOWN.
**LIVE_WRITE_NOT_RUN:** The board is intentionally disabled in public cabinets. Board editing, save and reopen were verified against the real isolated API and PostgreSQL. Live settings/password writes still require confirmed dedicated test access.
**NEXT_ACTION:** Continue UI-08 keyboard acceptance with the board access/role dialog. Verify focus entry, Escape, and return for teacher and pupil paths on the isolated runner. Public board rollout remains a separate owner decision. Keep load-40 manual.

## UI-08 board keyboard verification

- Enter opens the board and focuses its return button. Tab enters the editor. Alt+Shift+↑ reaches the same close handler from the editor and toolbar. Canceling an unsaved-changes warning keeps editing available. Closing restores focus to the original or rerendered board entry, with a cabinet fallback.
- Local Chromium PASS for the keyboard path, unsaved confirmation cancel, rerendered opener and fallback. [Actual editor/API/PostgreSQL](https://github.com/Arthur200014/testing-hosting/actions/runs/44466943068/job/135367024232) PASS for both roles and saved scene reopen. Board room-core, group and licence jobs passed. The unrelated 21-editor soak was still running.
- [TAS gate](https://github.com/Arthur200014/testing-hosting/actions/runs/44466937507) and [pre-merge PostgreSQL](https://github.com/Arthur200014/testing-hosting/actions/runs/44466937485) PASS. [Post-merge PostgreSQL](https://github.com/Arthur200014/testing-hosting/actions/runs/44467657262) PASS.
- Paths: `platform/lesson-board-ui.mjs` and `platform/board-prototype/api-browser.mjs`.

## UI-08 public entry verification

- [PR #104](https://github.com/Arthur200014/testing-hosting/pull/104) / `c9124bf`, public entry and mobile cabinet navigation. [Pages](https://github.com/Arthur200014/testing-hosting/actions/runs/44401862816) and [main browser rerun](https://github.com/Arthur200014/testing-hosting/actions/runs/44401864027) PASS.

- [Public landing](https://arthur200014.github.io/testing-hosting/platform/) shows actual capabilities and links to the teacher and pupil cabinets. Existing direct sign-in URLs remain valid. The mobile teacher section switcher supports keyboard activation, Escape, focus return and current section announcement. Both sign-in forms handle error and entry focus, and logout returns focus to sign-in. The retired chat placeholder was removed.
- Focused local Chromium tests at 320/390/1348px, JavaScript syntax and diff PASS. Isolated real API/PostgreSQL 17 PASS for navigation and both actual sign-in/out paths with synthetic accounts, and mobile calendar dialog keyboard opening, focus and Escape without creating a lesson. [TAS task gate](https://github.com/Arthur200014/testing-hosting/actions/runs/44401325732), [PostgreSQL before merge](https://github.com/Arthur200014/testing-hosting/actions/runs/44401325602) and [PostgreSQL after merge](https://github.com/Arthur200014/testing-hosting/actions/runs/44401864064) PASS. [Full branch browser regression](https://github.com/Arthur200014/testing-hosting/actions/runs/44401325576) PASS on the exact released application tree. [Redundant main browser rerun](https://github.com/Arthur200014/testing-hosting/actions/runs/44401864027) PASS.
- Scope for final acceptance: screen-reader manual testing and cabinet-wide review of unrelated actions were not covered in this delivery. Paths: `platform/index.html`, `platform/teacher.html`, `platform/student.html`, and two existing browser regressions.

## UI-07 profile settings verification

- [Application PR #102](https://github.com/Arthur200014/testing-hosting/pull/102) / `14b9017` and [fixture PR #103](https://github.com/Arthur200014/testing-hosting/pull/103) / `15b98d4` merged. Pages byte match and live settings route 401 verified. The [main browser rerun](https://github.com/Arthur200014/testing-hosting/actions/runs/44396532085) passed. Live authenticated settings and password writes remain unverified.

- Isolated Chromium/API/PostgreSQL 17 PASS for profile anchors, save/clear/cancel, copy, relogin, membership isolation across workspaces for the same account, calendar and overdue invoice reminders, and mobile overflow at 390px. Settings migration is additive.
- [TAS gate](https://github.com/Arthur200014/testing-hosting/actions/runs/44394743654), [PostgreSQL pre-merge](https://github.com/Arthur200014/testing-hosting/actions/runs/44394743990) and [PostgreSQL post-merge](https://github.com/Arthur200014/testing-hosting/actions/runs/44395364408) PASS. JS syntax, diff and teacher-data 9/9 PASS.
- The initial browser run rejected the new GET in legacy fixtures. PR #103 updated only the three strict fixtures. [Full corrected Chromium/API/PostgreSQL run](https://github.com/Arthur200014/testing-hosting/actions/runs/44395956948) PASS on the final tree, including the older synthetic browser checks. [Post-fixture main PostgreSQL](https://github.com/Arthur200014/testing-hosting/actions/runs/44396532281) PASS. [Redundant main browser run](https://github.com/Arthur200014/testing-hosting/actions/runs/44396532085) PASS.
- Paths: `platform/teacher.html`, `platform/teacher-data.mjs`, profile settings endpoints under `IdentityAccess/`, additive migration `20261118210000_TeacherWorkspaceSettings.cs` and existing browser scripts. External notification channels and online payment processing remain pending.

## UI-07 password change verification

- [PR #101](https://github.com/Arthur200014/testing-hosting/pull/101) / `16da7641b438f68929ece0821e6df43d415059f8`. [Pages](https://github.com/Arthur200014/testing-hosting/actions/runs/44390018731) and [public file comparison](https://github.com/Arthur200014/testing-hosting/actions/runs/44390520564) PASS. Live password route 401 without auth, ready and migrations 200, running API SHA UNKNOWN. LIVE_WRITE_NOT_RUN for lack of designated test access.

- Isolated Chromium/actual API/PostgreSQL 17 PASS for cancel, mismatched confirmation, wrong current password, successful change, revocation across two workspaces, unaffected unrelated accounts, reload and password persistence. Independent concurrent change probe PASS. One of two requests commits.
- [TAS CI gate](https://github.com/Arthur200014/testing-hosting/actions/runs/44388723357), [.NET/PostgreSQL before merge](https://github.com/Arthur200014/testing-hosting/actions/runs/44388723343), and [PostgreSQL after merge](https://github.com/Arthur200014/testing-hosting/actions/runs/44390019917) PASS. .NET build, teacher-data 9/9, JS syntax and diff PASS. [Full isolated browser before merge](https://github.com/Arthur200014/testing-hosting/actions/runs/44388723281) and [after merge](https://github.com/Arthur200014/testing-hosting/actions/runs/44390019816) PASS.
- Changes: `platform/teacher.html`, `TeacherAuthentication.cs`, `TeacherProfileEndpoints.cs`, `Program.cs`, and the existing `platform/calendar-real-browser.mjs` scenario.

## UI-07 workspace access verification

- [PR #100](https://github.com/Arthur200014/testing-hosting/pull/100) / `6e2f3c98144db3a627bc809d3b0936c34e42d4bb`. [Pages](https://github.com/Arthur200014/testing-hosting/actions/runs/44382095436), [published files](https://github.com/Arthur200014/testing-hosting/actions/runs/44382500784), and [read-only API health](https://github.com/Arthur200014/testing-hosting/actions/runs/44382500486) PASS. The live workspace access endpoint rejects anonymous calls. Running API SHA UNKNOWN, LIVE_WRITE_NOT_RUN for lack of a designated workspace.

- [Isolated Chromium/API/PostgreSQL](https://github.com/Arthur200014/testing-hosting/actions/runs/44379734839) PASS. Verified issuance and acceptance, email binding, reuse/cancel rejection, teacher entry and ordinary data access, owner-only management and cross-workspace denial, confirmation cancel, access revocation and regrant without reviving the old session. Inspected the synthetic roster capture at 1348 × 926.
- [Post-merge PostgreSQL](https://github.com/Arthur200014/testing-hosting/actions/runs/44382096052) PASS, including migration/startup. [Redundant post-merge browser rerun](https://github.com/Arthur200014/testing-hosting/actions/runs/44382096101) PASS. JS syntax, teacher-data 9/9 and diff PASS. No manual 40-editor run.
- Codes expire after 48 hours and are stored as hashes. The owner passes a code privately to the intended recipient. Renewed access requires a fresh invitation. Ownership transfer and new account types are outside this delivery.


## UI-07 tuition ledger verification

- [Isolated Chromium/API/PostgreSQL](https://github.com/Arthur200014/testing-hosting/actions/runs/44372751468) PASS on the final application tree. Checked invoice creation, manual partial payment and reset, balance and receipts after relogin, exact retry, tenant isolation, concurrent overpayment protection and cancellation. Inspected the synthetic ledger capture at 1348 × 926.
- [Post-merge PostgreSQL](https://github.com/Arthur200014/testing-hosting/actions/runs/44375148691) PASS, including additive ledger migration and startup. The [redundant post-merge browser run](https://github.com/Arthur200014/testing-hosting/actions/runs/44375148632) was still running at handoff. JS syntax, teacher-data 9/9 and diff PASS. No manual 40-editor test.
- Student invoices are separate from package settings and platform subscription. Receipts are teacher-recorded. The ledger does not initiate charges or send invoices. Unpaid cancellation is audited by timestamp, and a paid or partially paid invoice cannot be cancelled.


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
