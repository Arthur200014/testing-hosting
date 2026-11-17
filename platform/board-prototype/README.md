# UI-06-P — isolated free-software board prototype

Branch-only experiment. No production service, Pages navigation, Timeweb call,
Firebase writer change, paid SDK, vendor account or vendor key is introduced.
P2 remains partial: actual .NET-session browser wiring, membership revocation,
files/compaction and full21/210-browser fault/convergence acceptance are pending.

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
scope/role/expiry and an injected revocation predicate. The predicate is still
a test hook, not a connection to actual .NET membership revocation. Viewer
writes fail on the server. No client-controlled join/broadcast destination.

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
does not yet exercise actual .NET login/permit issuance. The loopback lessonPermit
helper exists, but needs wiring into the existing isolated .NET browser runner.

Transport tests also exercise a short10-room ×21-protocol-client save/restore
profile, quotas, retries, delayed operations and injected storage failures.
Protocol counts are not P3/P4 browser or sustained-load acceptance. Membership
revocation bridge, files, key distribution, compaction, prolonged reconnect and
full concurrency/fault acceptance remain before GO and any application merge.
