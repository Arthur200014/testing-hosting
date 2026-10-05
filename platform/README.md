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
