# Platform backend

The platform is an ASP.NET Core 10 modular monolith backed by PostgreSQL 17. It contains Identity/Access workspace and teacher-membership boundaries plus Students, workspace-scoped student membership/import identity, student code exchange, and a separate local XLSX student-directory importer.

Student codes are normalized and used only as request-body input. PostgreSQL stores a workspace-scoped HMAC-SHA256 digest; the pepper and JWT key are independent base64 environment secrets. Invalid workspace, code, inactive workspace, membership, or student all return the same 401 response. Successful tokens expire within 15 minutes and carry `sub`, `workspace_id`, `membership_id`, and `role=student` claims.

## Commands

Validate Compose without using real secrets:

```sh
docker compose --env-file .env.example config --quiet
```

Run the integration suite against its isolated real PostgreSQL 17 instance:

```sh
docker compose --env-file .env.example --profile test build tests
docker compose --env-file .env.example --profile test run --rm tests
docker compose --env-file .env.example --profile test down
```

If a development network terminates TLS with a private trusted CA, pass that CA to BuildKit without adding it to the repository:

```sh
docker build --secret id=build_ca,src=/path/to/trusted-ca.crt --target test-runner -t testing-hosting-platform-tests platform
```

For local API use, copy `.env.example` to ignored `.env`, replace every `REPLACE_*` value, and generate the JWT key and code pepper independently (for example, `openssl rand -base64 48`). Then:

```sh
docker compose up --build -d db migrate api
curl --fail http://localhost:8080/health/live
curl --fail http://localhost:8080/health/ready
curl -i -X POST http://localhost:8080/api/v1/student-sessions \
  -H 'Content-Type: application/json' \
  --data '{"workspace":"fake-workspace","code":"fake-code"}'
```

The final request is a safe smoke test and should return the generic 401 because this foundation has no production or development seed path. Start pgAdmin only when needed with `docker compose --profile tools up -d pgadmin`; connect it to host `db` on port `5432`.

PostgreSQL is intentionally not published to the host or LAN. For local SQL diagnostics use `docker compose exec db psql -U platform -d platform`. API and pgAdmin host ports bind to `127.0.0.1` only.

Migrations are committed under `src/Platform.Api/Persistence/Migrations`. Compose runs them through the one-shot `migrate` service before starting the API. The application never auto-seeds data.

## Test-attempt write API

`POST /api/v1/test-attempts` accepts a student session as `Authorization: Bearer <token>`. The JWT supplies `sub` (student UUID), `workspace_id`, and `membership_id`; it does **not** carry `program_id`. The server rechecks that these IDs still identify an active membership, workspace, student, and program, then derives the program from that membership. Identity fields, student names, and program IDs are not accepted in the request body.

Request JSON:

```json
{
  "eventId": "synthetic-event-001",
  "testId": "synthetic-test",
  "topic": "synthetic topic",
  "taskNumber": 1,
  "correct": 2,
  "total": 3,
  "percent": 66,
  "startedAt": "2026-01-15T10:00:00Z",
  "completedAt": "2026-01-15T10:00:30Z",
  "durationSeconds": 30,
  "schemaVersion": "1"
}
```

All fields are required. `eventId` and `testId` are at most 128 characters, `topic` 200, and `schemaVersion` 64. `taskNumber` is 1–1000, `correct` 0–10000, `total` 1–10000, `percent` 0–100, and `correct` cannot exceed `total`. Percent is the integer floor of `correct * 100 / total`. Timestamps must be present, completed must not precede started, elapsed time must be no more than one day, and completion may be no more than five minutes in the future. `durationSeconds` must be 0–86400 and equal the elapsed timestamp difference rounded to the nearest second (midpoints away from zero).

The API responds `201 Created` for a new attempt, `200 OK` with `duplicate: true` for an equivalent replay of the same `(workspace, eventId)`, and `409 Conflict` if that key is reused with different attempt data. Invalid input returns `400`; missing, invalid, expired, or no-longer-valid student identity returns `401`; an authenticated caller without the student role is rejected by authorization with `403`.

The response contains `attemptId`, `eventId`, `duplicate`, `createdAt`, and `monthlyBest` (`attemptId`, `percent`, `durationSeconds`, `completedAt`). Monthly grouping uses the completion timestamp's `Europe/Moscow` calendar month. Monthly best is scoped to workspace, current membership, test, and month, ordered by percent descending, duration ascending, completion timestamp ascending, then attempt UUID ascending.

For a local smoke request, use only fabricated values like the JSON above and an authorized local student token. This foundation has no seed path, so the example cannot create a real student or use production data. With a locally obtained test token, save the JSON as `/tmp/test-attempt.json`, then run:

```sh
curl -i http://localhost:8080/api/v1/test-attempts \
  -H "Authorization: Bearer $LOCAL_TEST_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/test-attempt.json
```

Without a valid local student session, verify the safe rejection with the same synthetic payload and no bearer token; the result should be `401`. The endpoint and integration tests are implemented, but the browser provider and production traffic remain on the legacy path; this is not a production cutover. The API suite has 27 passing tests, including 20 `TestAttemptTests`; the combined API and importer runner has 40 passing tests (2026-10-06).

## Safe student-directory import

The importer reads only the exact `Ученики` sheet from a local XLSX file. It does not call Google APIs. Keep the workbook and program map outside the repository; the Docker build context also excludes `*.xlsx` and `program-map*.json` inputs. The program map has this synthetic shape:

```json
{
  "programs": [
    { "sourceId": "source-program-id", "code": "EGE_MATH", "displayName": "ЕГЭ математика" }
  ]
}
```

Start PostgreSQL and apply committed migrations first:

```sh
docker compose up --build -d db migrate
```

Run the default read-only dry-run by mounting an absolute directory outside the checkout. The command reports only aggregate counts and row number/field/category diagnostics:

```sh
IMPORT_INPUT_DIR=/absolute/path/to/private-import-inputs
docker compose --profile import run --rm \
  --volume "$IMPORT_INPUT_DIR:/imports:ro" \
  student-import \
  --xlsx /imports/students.xlsx \
  --program-map /imports/program-map.json \
  --workspace school-slug
```

Review the dry-run first. To write, repeat the same command with explicit `--apply` at the end. Apply validates the complete workbook before writes and commits workspace, programs, students, memberships, and the safe import journal in one transaction. Repeating the identical successful input is idempotent; existing divergence is a blocking conflict and missing snapshot rows are not deactivated.
