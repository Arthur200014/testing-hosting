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
