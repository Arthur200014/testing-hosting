# UI-06-P — room boundary and durable replay contract

P1 checkpoint, NOT an integrated whiteboard. No network listener, production
endpoint, database connection, Firebase call, paid service or CDN is started.
Run with Node 22:
```sh
node --test platform/board-prototype/core.test.mjs
```
Tests create temporary synthetic journals, close/reopen them and remove only their
own temporary directories. No database/host target argument exists.

Implemented: dedicated HMAC board permits (maximum 5 minutes), exact tenant/board
binding, editor/viewer roles, expiry/revocation checked for each request; bound
room destinations; serial bounded append/replay, per-user idempotency and payload
conflict rejection. Acknowledge only after full write and fsync. Exclusive owner
lock prevents concurrent processes; corrupt/torn history fails closed.
Never automatically remove stale locks; test recovery must first establish that
the previous writer stopped. No production recovery command is provided.

Exact upstream commits and MIT licences are recorded. Native excalidraw-room
accepts arbitrary join-room IDs, forwards encrypted Socket.IO messages without
tenant authorization and does not persist scenes. Do not deploy it unchanged.

TAS already uses validated issuer/audience/signatures and active teacher-session
policy, with server-owned workspace_id/membership_id. These permits are a separate
contract, NOT yet issued by TAS. Future .NET issuance must check existing
session/membership/class/lesson access; do not share its API signing secret.

The filesystem journal is a P1 test adapter, NOT the planned transactional
PostgreSQL backend, scene reconciler, checkpoint/backup system or Excalidraw
client. Raw journal methods are trusted internals, not authorized public APIs.
Encrypted replay needs a compatible client; these tests do not establish drawing
convergence, deletion/undo semantics or browser persistence. No E2EE claim.

Next P2: real pinned editor + Socket.IO binding, reproducible npm lockfile and
transitive licence audit, .NET permits, PostgreSQL append/replay and reconstruction
in a fresh browser. Define checkpoint/compaction, files, connection quotas,
backpressure/rate limits before exposing any endpoint.
Tests with 21 identities and 10 rooms/210 messages check core concurrency only.
Real browser clients, fault/load profiles and restore remain NOT_RUN.

## P2 checkpoint: storage and permit issuance

The new postgres.mjs implements the append/replay contract using row-locked
transactions, unique per-actor request IDs, byte limits, COMMIT acknowledgements
and recovery through a new connection pool. It refuses any database other than
a loopback tas_board_test database. Schema creation is test-only; no production
migration or connection is added. Use npm ci --ignore-scripts and set
BOARD_TEST_DATABASE_URL to a dedicated local test DB, then npm test. Without
that variable the PostgreSQL test explicitly SKIPs; CI supplies PostgreSQL 17.

The API's BoardPrototype:Enabled flag defaults to false. Only Development and
IntegrationTests may register /api/v1/{teacher|student}/board-prototype/lessons/{guid}/permit.
BoardPrototype:SigningKey must be a separate base64 key with at least 32 bytes.
Existing teacher active-session policy and student membership/participation
checks precede permit issuance. Tokens expire after 120 seconds, have no-store
responses and must never be placed in URLs. This does not yet provide immediate
revocation at a real Socket.IO connection: the network adapter remains pending.

The pg dependency is pinned with package-lock.json; installed dependency metadata
uses MIT/ISC. This audit covers the current database-driver graph ONLY, not the
future editor/Socket.IO graph. No claim of completed P2 or a usable board is made.

## P2 network checkpoint: authorized Socket.IO + durable replay

`transport.mjs` exports `startTestTransport` for the isolated runner only. It
binds exclusively to 127.0.0.1, starts no production service, and is not wired to
Pages, Timeweb or application navigation. Socket.IO server/client are pinned to
4.8.1. Run `npm ci --ignore-scripts`, `npm run licenses`, then `npm test` here.
CI provides its own loopback PostgreSQL; local runs explicitly skip DB checks
when BOARD_TEST_DATABASE_URL is absent. Never point this variable at production.

The handshake auth object carries the dedicated permit plus workspace/board,
never a URL token. There is no client-controlled join/broadcast destination.
Every submit/replay and outgoing replay result rechecks signed scope, role,
expiry and the injected revocation predicate. A 250ms sweep disconnects denied
idle clients. This predicate is a test hook: connection to actual .NET membership
revocation remains pending; do not claim immediate production revocation.

One submit/replay per connection may be outstanding; 50 requests/second,
256 total and 24 per room are the current caps. Binary scenes are capped at
256KiB and database history at 32MiB/10,000 frames per room. Replay pages contain
at most 8 frames. Slow clients pull their own ordered pages rather than receiving
an unbounded broadcast queue. Clients must page/retry BUSY, deduplicate by seq
and retain messageId for retry. A submit response acknowledges the PostgreSQL
COMMIT (or filesystem test fsync), never local browser state. Storage failures
return failure. This contract is application-specific Socket.IO, not a drop-in
excalidraw-room client protocol.

Tests use real loopback WebSocket connections with distinct synthetic identities:
teacher + two pupils, retries/conflicts, read-only/forged/foreign/expired/revoked
access, bounded replay, quota, delayed write/read, injected storage outage,
transport restart and new journal/pool replay. CI also exercises ten rooms ×21
protocol clients and recovery, and prints duration/RSS for that short profile.
These are **not real browsers, a sustained benchmark, actual Excalidraw scene
convergence or P3/P4 acceptance**. Browser editor/.NET issuance wiring, files,
checkpoint/compaction, full revocation integration and fault acceptance remain.

`audit-licenses.mjs` checks all 43 currently locked pg/Socket.IO package versions,
integrities and reviewed MIT/ISC/BSD metadata and compares retained copyright/
licence/NOTICE texts in THIRD_PARTY_NOTICES.txt. Two pg packages embed MIT in
README; one legacy package declares its MIT licence via `licenses`. The future
editor dependency graph still requires its own audit. Updating dependencies
requires reviewing notices and regenerating them with `node audit-licenses.mjs --write`.

## Real editor checkpoint (P2 still incomplete)

The isolated Vite entry `editor/` uses pinned Excalidraw0.18.0/React18.3.1,
local fonts and the authenticated transport. `npm run editor:browser` launches
three distinct Chromium contexts with **synthetic issuer permits**, draws real
rectangles concurrently, deletes/undoes through the editor, restarts transport
and storage, then opens a fresh context and checks viewer/foreign isolation.
BOARD_TEST_DATABASE_URL selects the existing dedicated loopback PostgreSQL
adapter; without it the runner explicitly reports filesystem test evidence only.
No .NET session or permit endpoint is mocked: this runner does not exercise them.
The loopback-only `lessonPermit` client is provided, but actual login/issuance
integration remains to be wired into the existing isolated .NET runner.

Client updates use Excalidraw's exported element reconciliation and tombstones,
not last-full-scene-wins. Remote replay uses CaptureUpdateAction.NEVER to keep it
out of local undo. AES-GCM test-room keys are separate from permit signing keys;
this is not an E2EE production claim or a key-distribution implementation. There
is one serialized send/replay loop, retries retain the same encrypted payload
and messageId, and edits during encryption remain pending. Images/files,
compaction, long offline edits, full reconnect/convergence and21/210 browser
profiles remain unaccepted. The scene key and initial permits are supplied only
in memory by the synthetic runner. There is no public launch/navigation entry.

**Release blocker:** installing the editor introduced234 additional runtime
packages (including bundled diagram import dependencies). EDITOR_LICENSE_REVIEW.json
is a metadata inventory, **not approval**. Missing npm notices, bundled fonts,
EPL-2.0 and dual-licence choices require review and retention before merge/GO.
`npm run licenses` explicitly verifies only the prior43 transport packages via
transport-license-scope.json; `npm run licenses:full` intentionally fails closed
on unreviewed editor packages. CI has a separate hard licence-clearance gate;
passing browser tests does not bypass it. No production distribution is enabled.
