#!/usr/bin/env bash
# Disposable synthetic PostgreSQL restore smoke. No user database or private snapshot.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."
for tool in docker openssl mktemp; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing required tool: $tool" >&2; exit 1; }
done

project="tas-restore-${GITHUB_RUN_ID:-local}-$$"
export POSTGRES_DB=platform_restore_source
export POSTGRES_USER=platform_restore_test
export POSTGRES_PASSWORD="$(openssl rand -hex 24)"
export JWT_SIGNING_KEY="$(openssl rand -base64 48)"
export STUDENT_CODE_PEPPER="$(openssl rand -base64 48)"
compose=(docker compose --env-file .env.example -p "$project")
dump="$(mktemp /tmp/tas-restore-synthetic.XXXXXX)"
chmod 600 "$dump"

cleanup() {
  local exit_code=$?
  if (( exit_code != 0 )); then
    "${compose[@]}" ps || true
    "${compose[@]}" logs --tail=60 db migrate || true
  fi
  rm -f "$dump"
  "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${compose[@]}" config --quiet
"${compose[@]}" up -d db
"${compose[@]}" run --rm migrate

"${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null <<'SQL'
INSERT INTO platform."Workspaces" ("Id", "Slug", "IsActive", "CreatedAt")
VALUES ('00000000-0000-0000-0000-000000000001', 'restore-probe', true, now());
INSERT INTO platform."Programs" ("Id", "WorkspaceId", "Code", "DisplayName", "IsActive", "CreatedAt")
VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
        'SYNTHETIC', 'Synthetic restore probe', true, now());
SQL

"${compose[@]}" exec -T db pg_dump -Fc --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$dump"
test -s "$dump"
"${compose[@]}" exec -T db createdb -U "$POSTGRES_USER" platform_restore_target
"${compose[@]}" exec -T db pg_restore --exit-on-error --no-owner --no-acl \
  -U "$POSTGRES_USER" -d platform_restore_target < "$dump"

# The restored database must be consumable by the application with no pending migrations.
"${compose[@]}" run --rm \
  -e "Database__ConnectionString=Host=db;Port=5432;Database=platform_restore_target;Username=$POSTGRES_USER;Password=$POSTGRES_PASSWORD" \
  migrate

query() {
  local database="$1" sql="$2"
  "${compose[@]}" exec -T db psql -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$database" -c "$sql"
}
history_sql='SELECT string_agg("MigrationId", chr(10) ORDER BY "MigrationId") FROM public."__EFMigrationsHistory"'
source_history="$(query "$POSTGRES_DB" "$history_sql")"
restored_history="$(query platform_restore_target "$history_sql")"
test -n "$source_history" && test "$source_history" = "$restored_history"

counts_sql='SELECT (SELECT count(*) FROM platform."Workspaces" WHERE "Slug" = '\''restore-probe'\'')::text || '\'':'\'' || (SELECT count(*) FROM platform."Programs" WHERE "Code" = '\''SYNTHETIC'\'' AND "WorkspaceId" = '\''00000000-0000-0000-0000-000000000001'\'')::text'
test "$(query "$POSTGRES_DB" "$counts_sql")" = '1:1'
test "$(query platform_restore_target "$counts_sql")" = '1:1'

schema_sql="SELECT count(*) FROM information_schema.tables WHERE table_schema = 'platform'"
source_tables="$(query "$POSTGRES_DB" "$schema_sql")"
test "$source_tables" -gt 0
test "$source_tables" = "$(query platform_restore_target "$schema_sql")"

# A rollback on the restored copy must leave its application rows intact.
"${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d platform_restore_target >/dev/null <<'SQL'
BEGIN;
INSERT INTO platform."Workspaces" ("Id", "Slug", "IsActive", "CreatedAt")
VALUES ('00000000-0000-0000-0000-000000000003', 'rollback-probe', true, now());
ROLLBACK;
SQL
test "$(query platform_restore_target "SELECT count(*) FROM platform.\"Workspaces\" WHERE \"Slug\" = 'rollback-probe'")" = 0
test "$(query platform_restore_target "$counts_sql")" = '1:1'

echo 'PASS: isolated synthetic pg_dump/pg_restore, migrations, application rows and rollback'
