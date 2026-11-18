# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-18
**ACTIVE_TASK:** UI-06 lesson-board catalog complete and published behind the isolated gate. Search, class/group filter, date/title sorting, class shortcuts and lesson/editor links use existing lesson scenes.
**ACTIVE_BRANCH:** none. [PR #92](https://github.com/Arthur200014/testing-hosting/pull/92) merged, tested head `0cd646fe8a37e24b1d2d86492d88f9162c9b6412`.
**MERGED_SHA:** `793b50ed2577f38be660487b4836b7264d22ee81`.
**RELEASE_STATE:** MERGED + FRONTEND_PUBLISHED. [Pages 44289106323](https://github.com/Arthur200014/testing-hosting/actions/runs/44289106323) PASS. Published `teacher.html`, `teacher-data.mjs`, `board-catalog-ui.mjs` and `lesson-board-ui.mjs` byte-match the verified release. UI enabled on isolated stand only.
**API_DEPLOYMENT:** Owner-configured native Timeweb main auto-deploy; do not check Timeweb. Independent running revision/migrations UNKNOWN / NOT_VERIFIED; production board writes NOT_RUN in approved isolated-only mode. No production schema/config/writer switch in this prototype.
**NEXT_ACTION:** Continue UI-06 with independent board records and explicit class/lesson associations, preserving existing lesson board identities and keeping the board gate off on production. Catalog is already implemented for existing lesson boards (reference 64).

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
- Preserve the completed UI and follow RELEASE_PLAN; old Mxx/Pxx queues are historical. Next visual block is UI-06 frames51–52, not the separate chat64–69 scenario.
- Do not check Timeweb or request production credentials. Never write to real pupils, lessons, scores, settings or credentials; no invitations/notifications/payments, imports, production reset scripts, new service/infrastructure or Firebase writer switch incidentally.
- Durable adapter is PostgreSQL; filesystem is test-only. Fresh API session/membership checks apply before work and returned results. An append admitted before concurrent revocation may finish; this is not a transactional cross-service fence.
- API-issued scene keys survive fresh-process recovery only while scene-root/context v1 stays stable. Root rotation/migration is not implemented. PNG/JPEG/PDF files are plaintext in the trusted scoped test store; preserve access/quota/hash checks.
- Permit renewal/reconnect, teacher-only checkpoints/compaction and separate-DB backup recovery PASS. Compaction replaces covered edit history and is not an archive. Board backups also require retained API metadata and stable scene-root. Existing10000 lifetime frame limit remains. No production backup automation/offline-tab persistence claim.
- Prior UI-05 pupil feedback release PR#89 /283e8e9 remains intact: editable persisted draft with source snapshot, revision conflict protection and separate participant input. Previous Pages/publication evidence is in Git history; no real messages were sent.
