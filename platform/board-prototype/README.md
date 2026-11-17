# UI-06-P — isolated free-software board prototype

Branch-only experiment. No production service, Pages navigation, Timeweb call,
Firebase writer change, paid SDK, vendor account or vendor key is introduced.
P2 now includes a real .NET-session/revocation browser runner; files/compaction,
key delivery and full21/210-browser fault/convergence acceptance remain pending.

## Dependencies and licence gate

Excalidraw0.18.1 (security patch for the upstream Mermaid XSS issue), React18.3.1,
pg8.16.3, Socket.IO4.8.1 and Fontsource Arimo5.3.0 are exact-pinned. The
package-lock contains304 runtime entries, including optional Darwin fsevents.
`licence-review-lock.json` binds each entry's version/integrity/declared licence
and retained-notice hash. No automatic approval of future releases is implied.

`npm run licenses:full` checks all runtime packages, source supplements and nine
font families. THIRD_PARTY_NOTICES.txt retains actual package copyright/licences,
including missing npm notices supplemented from attributed publisher sources.
DOMPurify's Apache-2.0 branch is selected; Pako's MIT AND Zlib text is retained.
Fuzzy/Khroma's MIT declarations come from their shipped licence files. The exact
optional fsevents tarball notice is retained even on Linux. Development-only
build/test tools are excluded from this runtime-distribution gate.

The patched graph no longer includes the prior elkjs/EPL-2.0 dependency. Missing
Radix notices use the publisher's MIT notice; available npm gitHead variants have
identical licence blobs. Legacy packages without gitHead remain identified by
exact npm integrity and publisher licence provenance in licence-overrides.json.

Fonts are reviewed separately; FONT_NOTICES.txt retains copyright/OFL/MIT texts.
The old LiberationSans1.05 export fallback is **not distributed**: Vite resolves
its asset imports to an unchanged Fontsource Arimo Latin400 font, and replaces
its public asset path. The font's internal family/name tables are unchanged.
Export remains unsupported in this prototype. A built-artifact audit rejects
legacy-font bytes, unknown font bytes or missing notices. Both notice files are
copied into the editor's static output. The original font remains in the npm
build input only. No source-font modifications or separate font sales occur.

Run from this directory:
```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run licenses:full
node --test licence-audit.test.mjs
npm run editor:build
npm run licenses:built
npm test
npx playwright install chromium
npm run editor:browser
```
`--write` on an audit regenerates retained reports only after reviewing changes;
it does not update the reviewed version/integrity/notice/font hashes. Tests use
temporary directories and prove unknown graph/licence, changed notice/font hash
and legacy font leakage fail closed. CI keeps licence and browser jobs separate.

## Authorization and durable transport

The API BoardPrototype:Enabled flag defaults to false. Only Development and
IntegrationTests can register /api/v1/{teacher|student}/board-prototype/lessons/{guid}/permit.
BoardPrototype:SigningKey must be separate from the API JWT key, base64 and at
least32 bytes. Existing active teacher-session and student membership/lesson/
class checks precede two-minute, no-store permits. No URL tokens.

transport.mjs exports startTestTransport only, with loopback listeners and no
production entry point. Every submit/replay and outgoing read rechecks signed
scope/role/expiry. The real API runner supplies apiAccess: signed permits are
rechecked against current .NET teacher sessions, memberships and lesson/class
access before each operation, before returning results, and during a250ms idle
sweep. API timeout/denial/outage fails closed. The relay receives neither user
API JWTs nor the API signing key. Viewer writes fail on the server. No client-controlled join/broadcast destination.

One request per connection,50 requests/second,256 connections total,24 per room,
256KiB scene frames and8-frame replay pages bound work. PostgreSQL row locks
serialize monotonic revisions; per-user message IDs are idempotent and conflicting
payloads rejected. Acknowledge after COMMIT only, not browser autosave. Room
history is capped at32MiB/10,000 frames. Slow clients pull ordered pages. The
filesystem journal is only a synthetic test adapter (fsync, ownership fence,
corrupt-tail rejection); it is not production storage or crash recovery.

BOARD_TEST_DATABASE_URL accepts only loopback tas_board_test[_suffix] databases.
No production DSN, seed/reset/import target or schema migration is added. CI
uses dedicated PostgreSQL17; absent local DB configuration explicitly skips DB
checks. Never point the runner at real students/workspaces.

## Real editor evidence and remaining work

editor/ uses Excalidraw's exported reconciliation, element versions/tombstones
and CaptureUpdateAction.NEVER for remote updates. Redundant own echoes do not
reset local undo capture. One send/replay loop retains exact encrypted bytes/
messageId on retry and preserves edits made during encryption. AES-GCM test-room
keys are separate from signing keys; this is not production E2EE or key delivery.
Images/files are unsupported and remain explicitly unsaved.

browser-editor.mjs uses three actual separate Chromium contexts with synthetic
issuer permits, real drawing/delete/undo, transport/storage-pool restart and
fresh-browser replay, viewer write rejection and foreign-workspace isolation.
It uses PostgreSQL when configured, otherwise explicitly reports filesystem-only
evidence. External browser requests are blocked: fonts/modules are local. It
does not exercise actual .NET login/permit issuance. That stronger check uses
api-browser.mjs and the existing isolated .NET runner, described below.

Transport tests also exercise a short10-room ×21-protocol-client save/restore
profile, quotas, retries, delayed operations and injected storage failures.
Protocol counts are not P3/P4 browser or sustained-load acceptance. Files, key distribution, compaction, prolonged reconnect and full concurrency/
fault acceptance remain before GO and any application merge.

## Actual .NET session bridge

`TAS_BOARD_TEST_ONLY=1 bash platform/scripts/calendar-real-browser.sh` (from the
repository root, using the workflow's installed browser dependencies) reuses the
existing disposable API/PostgreSQL bootstrap and HTTP fixtures. The mode sets a
fresh dedicated room key, isolated IntegrationTests-only API endpoints, a
loopback PostgreSQL port and the dedicated tas_board_test_api DB. No production
compose/configuration file is changed; its override exists only in a temporary
directory. Cleanup retains the existing per-project disposal rules.

After ordinary teacher/student session exchange, three browser contexts request
permits through the real .NET HTTP endpoints. Node validates those signed permits
online without receiving API JWTs. Permit TTL is capped by the authenticating
JWT expiry. Introspection reconstructs only signed identity/session claims and
reuses the current active-teacher authorization policy plus the same lesson/
class/student access checks as issuance. Both routes remain disabled by default
and fail startup outside Development/IntegrationTests if explicitly enabled.

The runner checks teacher+two pupils drawing/persistence, foreign teacher and
nonparticipant rejection, an already-connected pupil after membership archive,
a connected teacher after logout, refusal to issue replacement permits, then
API/room/database-pool restart and fresh-browser recovery for the remaining
pupil. Archive/logout use ordinary HTTP actions on freshly generated synthetic
fixtures only. The API restart targets a container discovered by the exact
fresh test-project label, never a production name.

An operation admitted before a concurrent revocation may finish its durable
append; returning data/acknowledgement still requires a successful subsequent
check. This is not a transactional cross-service revocation fence. Failure of
API validation disconnects clients; automatic session/permit renewal and large
reconnect/fault profiles remain pending. The250ms sweep is a polling interval,
not a measured revocation latency guarantee under load. The original synthetic
browser runner remains useful for isolated editor checks but is not real-login
acceptance by itself.
