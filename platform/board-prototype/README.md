# UI-06-P — isolated free-software board prototype

Branch-only experiment. No production service, Pages navigation, Timeweb call,
Firebase writer change, paid SDK, vendor account or vendor key is introduced.
P2 includes actual .NET sessions, reconnect and encrypted checkpoint/backup recovery.
Full21/40-browser fault/convergence acceptance is required before GO.

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
BoardPrototype:SigningKey and BoardPrototype:SceneRootKey must each contain at
least32 bytes, base64 encoded, distinct from each other and the API JWT key.
Comparison uses decoded bytes, including whitespace-equivalent encodings. Existing active teacher-session and student membership/lesson/
class checks precede two-minute, no-store permits. No URL tokens.

transport.mjs exports startTestTransport only, with loopback listeners and no
production entry point. Every submit/replay and outgoing read rechecks signed
scope/role/expiry. The real API runner supplies apiAccess: signed permits are
rechecked against current .NET teacher sessions, memberships and lesson/class
access before each operation, before returning results, and during a250ms idle
sweep. API timeout/denial/outage fails closed. The relay receives neither user
API JWTs nor the API signing key. Viewer writes fail on the server. No client-controlled join/broadcast destination.

Idle editors request a bounded one-second waiting replay. A durable commit wakes
only that room's waiters; local edits cancel only their own pending wait. Signals
carry no scene data. Each reply still performs fresh post-read authorization;
the timeout discovers commits from other writers. Initial catch-up stays immediate.
The periodic sweep skips connections with an active operation: that operation
already checks access before work and before its reply. This avoids concurrent
idle probes during the bounded wait; sockets without an operation are still
checked every250ms. Revocation during a wait prevents the reply from exposing data.

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
messageId on retry and preserves edits made during encryption. AES-GCM scene keys come from authorized API permit replies; the real-session
runner never supplies a scene key. This is not a production E2EE claim.
Supported image/PDF storage is described below; rejected or unavailable files remain explicitly unsaved.

browser-editor.mjs uses three actual separate Chromium contexts with synthetic
issuer permits, real drawing/delete/undo, transport/storage-pool restart and
fresh-browser replay, viewer write rejection and foreign-workspace isolation.
It uses PostgreSQL when configured, otherwise explicitly reports filesystem-only
evidence. External browser requests are blocked: fonts/modules are local. It
does not exercise actual .NET login/permit issuance. That stronger check uses
api-browser.mjs and the existing isolated .NET runner, described below.

Transport tests also exercise a short10-room ×21-protocol-client save/restore
profile, quotas, retries, delayed operations and injected storage failures.
Protocol counts are not P3/P4 browser or sustained-load acceptance. Files, compaction, prolonged reconnect and full concurrency/
fault acceptance remain before GO and any application merge.

## Actual .NET session bridge

`TAS_BOARD_TEST_ONLY=1 bash platform/scripts/calendar-real-browser.sh` (from the
repository root, using the workflow's installed browser dependencies) reuses the
existing disposable API/PostgreSQL bootstrap and HTTP fixtures. The mode sets a
fresh dedicated room signing key and API-only scene-root secret, isolated
IntegrationTests-only API endpoints, a
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
API validation disconnects clients. Session-backed editors now obtain replacement
permits on disconnect and before expiry, with bounded exponential retry (0.5–10s).
Renewal must preserve workspace, board, v1 key and key version; mismatch or access
revocation stops reconnection. Existing bearer-session expiry still requires login;
there is no automatic API-login refresh. Pending local files and encrypted frames
remain in memory with exact retry IDs/bytes, not durable offline browser storage.
Closing/reloading an unsaved tab can still lose pending work. Large reconnect/fault
profiles remain pending. The250ms sweep is a polling interval,
not a measured revocation latency guarantee under load. The original synthetic
browser runner remains useful for isolated editor checks but is not real-login
acceptance by itself.

## Authorized stable scene keys (v1)

After ordinary session, workspace/class/lesson/membership checks, permit issuance
returns the32-byte sceneKey and keyVersion1 over the authorized no-store response.
The key is HMAC-SHA256 of a domain-separated version/workspace/board context under
the separate API-only SceneRootKey. All participants of the same board receive
the same key; different boards/scopes get different keys. It depends on neither
user/session/permit IDs nor process-local random state. No scene writer or schema
change is added. This is server-trusted encryption, not E2EE or an external SDK.

The master is a persistence dependency: retain it with the server's protected
configuration/backups. Missing or shared root keys fail startup when the isolated
feature is enabled. Replacing the root is **not a rotation procedure** and prevents
decryption of prior ciphertext; rotation/migration is not implemented. The
feature remains off in production and no production secrets/settings are changed.

The root never enters a permit, browser response, relay handshake, Node harness
environment or recovery fixture. Only a derived per-board key goes to authorized
API callers. The browser explicitly selects token/workspace/board for the room
handshake; the relay rejects additional auth fields. API JWT signing material is
also stripped from the board harness environment. The synthetic editor-only
runner retains its explicit random test key, but cannot establish API key delivery.

The real API scenario now closes the first browser, Vite/room and DB pool, restarts
the actual API, and starts api-browser-recovery.mjs in a new Node process. A private
0600 temporary fixture contains only synthetic login code/context and expected
scene metadata, no old bearer token or encryption key; it is removed in finally.
The new process signs in again and the new browser fetches its own key from .NET,
then decrypts/replays the existing PostgreSQL scene. Revoked-pupil login and room
handshake field checks remain active. Tests also check the exact derivation
vector, shared teacher/pupil key, different lesson/workspace keys, key absence
from the signed permit and invalid/missing/shared master rejection.

## Isolated image/PDF checkpoint

PNG (8-bit, non-interlaced) and JPEG images can be added through the file input;
PDFs are download-only attachments. SVG/HTML/other formats are rejected. This
prototype stores attachments as plaintext bytes in the trusted PostgreSQL test
store; encrypted scene frames contain references only. This is not E2EE or an
antivirus/content-safety claim. Image headers/dimensions and PNG CRC/inflate/filter
bounds are checked; the receiving browser also decodes images. PDF checks are
header/end-marker checks, not full document validation. No public file URLs exist.

Limits:2MiB per file,64 immutable files/16MiB/16M decoded pixels per room,
2048x2048 per image. File retries are idempotent, conflicts cannot overwrite bytes.
file:put requires editor access; file:get requires current bound room read access.
Both recheck online access before operations/results. Downloads revalidate even
when bytes are cached. Generic filenames are metadata, never filesystem paths.

PostgreSQL files and frames use the same room-head transaction lock. Frame append
checks all declared file references in that scope before COMMIT acknowledgement.
Clients upload first, then submit encrypted references, and validate reference
agreement/hash/decoding during replay. Deleted image bytes remain for undo and
old revisions. No eager deletion/GC or PDF-removal UI is provided yet; orphan
uploads count toward quotas. The filesystem test adapter rejects file references.
Schema extension is performed only by the existing dedicated loopback test adapter;
no production migration/configuration is changed.

The real API browser scenario adds PNG/PDF through controls, downloads exact PDF
bytes, injects a file-store failure and checks no false save/revision advance,
retries, deletes/undoes an image, then verifies image hashes/PDF bytes in the fresh
recovery process after restart. Focused tests cover MIME/CRC/size/name/id policy,
foreign/viewer denial, missing references, retries, count/byte/pixel quotas and
pool restart. The dedicated API runner issues 12-second permits (isolated option
bounded5–120s; default120s), verifies renewal/old-token expiry, drops a durable
submit acknowledgement and checks exact retry/no duplicate, then stops the actual
API while a PNG/scene remains pending and recovers without reloading the editor.
Full21/40-browser acceptance remains before GO; production enablement is separate.


## Ordered encrypted checkpoints and isolated backup

The teacher-only checkpoint control materializes the ordered durable replay using
Excalidraw reconciliation with no transient editor state. It includes every element
and deletion tombstone, all known attachment references and deleted-image references;
unsent local edits are never part of the checkpoint. AES-GCM authenticates v1 scope
and base revision as additional data. Checkpoints are bounded at2MiB.

The relay cannot decrypt or prove snapshot completeness: the authorized teacher
client is a trusted checkpoint publisher, not an untrusted student or viewer.
This is not a cryptographic proof of honest teacher replay. Students/viewers cannot
publish checkpoints. File bytes remain plaintext in trusted test PostgreSQL.

One room-head transaction requires the exact current revision, checks durable file
references, writes the snapshot and SHA-256 retry receipts, removes covered frame
ciphertexts and commits together. A stale base changes nothing; clients catch up
before generating a new ID. Repeating an acknowledged or unacknowledged checkpoint
is idempotent, including after newer writes/checkpoints. Receipts preserve exact
frame retry identity after compaction; changed bytes/IV/references are rejected.
A repeatable-read response contains one consistent snapshot plus ordered tail.
No files/tombstones are garbage-collected. Compaction replaces edit history, not
an audit/history archive. The existing10,000 lifetime frame limit remains; receipt
metadata is bounded by that limit and at most one checkpoint per revision.

The actual API browser runner interleaves a pupil append with a stale teacher base,
loses a successful checkpoint acknowledgement, then appends a post-checkpoint tail.
It uses pg_dump for all public.board_* tables and pg_restore into a separately
created tas_board_test_restore_* database. A deliberately truncated restore fails;
the disposable target is recreated for full restore. A new process/browser obtains
fresh actual API access and checks the snapshot, tail, deletion tombstone and exact
image/PDF hashes; a compacted-frame retry verifies restored receipts too. Backup
files are temporary0600 synthetic data and removed by the runner. API metadata and
scene-root configuration are separate recovery prerequisites, not contained in this
board-only dump. Production backup/restore automation and offline tab durability
are not implemented. No production schema, service or configuration is changed.


## P3 actual group runner

`TAS_BOARD_TEST_ONLY=1 TAS_BOARD_GROUP_TEST_ONLY=1 bash platform/scripts/calendar-real-browser.sh`
creates one synthetic20-member group through existing API operations and obtains
20 distinct actual pupil sessions, respecting unchanged per-IP login limits/429s.
It uses21 separate Chromium contexts/editors connected simultaneously and the
normal120s board permit lifetime; the smaller expiry/fault runner keeps12s.

The group scenario compares every serialized element field, order, versions,
nonces, tombstones, image SHA-256 and PDF attachment presence across all clients.
It exercises21 simultaneous drawings, a same-element conflict, simultaneous
removals/undo, two offline writers with lost acknowledgement/exact retry, late
join, PNG/PDF, stale checkpoint interleaving, room/storage-pool restart with a
pending teacher edit and all21 editor reloads. Foreign/nonparticipant access and
connected membership revocation use actual API checks. A test-only transport
controller closes selected sockets after their browser context goes offline;
there is no additional network/production endpoint.

`test-results/board-group-result.json` records PASS/FAIL, phase durations, actual
principal counts and convergence hashes; no login codes, tokens or keys. CI retains
this synthetic artifact. P3 results do not establish P4 two-room/40-browser
capacity or production acceptance. All existing safety/isolated-database guards
and the P2 backup/expiry runner remain in place.


Group convergence requires a deterministic index repair path. Excalidraw0.18.1's
native reconcileElements repairs duplicate fractional indices by mutateElement,
which generates fresh versions/nonces/timestamps per replica. The protocol now
uses the same version/lowest-nonce/editing conflict rules with immutable,
deterministic index repair via the already-reviewed fractional-indexing3.2.0.
It never synthesizes logical versions for index repair. Once pending edits are
acknowledged, the editor adopts its full ordered durable projection; all fields,
not only versions/shape count, must agree. Pure collision/edit/delete/undo tests
and the existing small real-editor runner guard this before the21-editor scenario.


## P4 actual parallel-room capacity profile

`TAS_BOARD_TEST_ONLY=1 TAS_BOARD_PARALLEL_TEST_ONLY=1 bash platform/scripts/calendar-real-browser.sh`
uses2 lesson rooms across2 isolated workspaces. Each room has20 independent real
editor contexts (1 teacher +19 pupils). All40 editors have distinct authenticated
identities:2 teachers +38 pupils, with no identity reused between editors.
This owner-approved40-editor profile replaces the210-editor acceptance target. API login limits remain unchanged, so setup takes several
minutes. Every editor obtains its own board-scoped permit through the actual API.

The runner uses the normal production-built frontend on loopback, not development
React overhead or simulated Socket.IO load. All40 editors stay open together.
The profile covers parallel drawing, same-element conflicts, deletion/undo,
offline writers/lost ack, PNG/PDF, checkpoints, shared relay/pool restart with
pending teacher edits, two cold reloads/PDF downloads, a tab closing during commit, actual isolated DB
pause/unpause with pending writes, and a minimum15min mixed text/image/delete/undo/checkpoint workload.
Full element/order/tombstone/file hashes must agree within each room; two room
hashes must stay distinct. Cross-workspace access is rejected by the actual API.

`board-parallel-result.json` records achieved and target counts, phase durations,
server operation latency/nacks, full-state settling time, browser RSS/CPU, relay
CPU, isolated API/database CPU/memory and cgroup/host bounds. CPU100% means one
core; summed process RSS includes shared mappings and is not unique physical RAM.
Plan acceptance requires p95 live durable-frame delivery<=500ms and server-submit
acknowledgement<=2s, not a production SLA. Delivery is measured from COMMIT completion
to ordered application in each browser, on the same host clock, during steady live
load; cold recovery/intentional offline delays are excluded and tested separately.
The looser full-state settling watchdog is a diagnostic timeout, not the latency gate. Replay
latencies are capped samples with total operation counts explicitly retained.

A measured<1GiB host/cgroup memory headroom stops with BLOCKED rather than risking
an unreported OOM or claiming PASS with fewer editors. Runner evidence is retained
on failure too. No new infrastructure, production service, writer switch or real
student data is involved. P4 must run before GO; adding this runner is not proof
of40-editor capacity;210-editor capacity remains unverified.


`TAS_BOARD_TEST_ONLY=1 TAS_BOARD_SOAK_GROUP_ONLY=1 bash platform/scripts/calendar-real-browser.sh`
runs the same resource/latency instrumentation with one room/21 unique principals
and a minimum15min mixed workload, writing board-group-soak-result.json. The P3
functional runner is separate evidence and does not substitute for this duration.
Metrics include p50/p95, fixed action seed, pinned component/browser versions,
connection/disconnection counts, negative acknowledgements and peak in-flight
operations. All40-editor and21-editor prolonged criteria must pass before GO.


The prolonged harness respects the normal10min API JWT lifetime. It uses ordinary
teacher/student re-login (owned synthetic credentials/invite codes) before expiry,
with unchanged per-IP rate limits, and records successful renewals/429s. A scoped
Playwright binding supplies each page only its own current API token before the
normal permit request, including after reload. No API key reaches the relay, no
JWT/permit expiry is weakened, and no production login-refresh implementation is
claimed. Authentication expiry while respecting the limiter fails acceptance.


The first210-editor run reached91 ready editors/94 contexts but failed startup:
replay p95~2057ms,998 negative replies and813 disconnects, on4 cores. Browser
summed RSS is shared-mapping-inclusive and did not establish an OOM; API/database
CPU saturation was observed. Access predicates now use one fresh correlated SQL
snapshot instead of up to six sequential student round trips. Per-operation
before/after revalidation remains mandatory. The periodic sweep skips only a
redundant check when a live validation completed within250ms; every idle socket
still revalidates, and no cached positive result authorizes reads/writes.
Class/archive/enrollment/participant/workspace denial and idle revocation have
focused regressions. A later210-editor run opened all210 contexts but timed out on a Chromium tool
click before steady load (run44170721900). On18 November the owner reduced P4
acceptance to40 editors. The15min duration,500ms delivery/2s acknowledgement
budgets, isolation and recovery gates remain unchanged;210 is not a GO gate.
