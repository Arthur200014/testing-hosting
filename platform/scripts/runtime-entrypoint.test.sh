#!/usr/bin/env bash
set -euo pipefail

task_dir="$(mktemp -d)"
trap 'rm -rf "$task_dir"' EXIT
cat > "$task_dir/dotnet" <<'SH'
#!/bin/sh
printf '%s\n' "$*" >> "$ENTRYPOINT_TEST_LOG"
if [ "${ENTRYPOINT_TEST_FAIL_MIGRATE:-}" = 1 ] && [ "$*" = '/app/Platform.Api.dll --migrate' ]; then
  exit 42
fi
SH
chmod 755 "$task_dir/dotnet"
export PATH="$task_dir:$PATH" ENTRYPOINT_TEST_LOG="$task_dir/log"
entrypoint="$(dirname "$0")/runtime-entrypoint.sh"

sh "$entrypoint"
printf '/app/Platform.Api.dll --migrate\n/app/Platform.Api.dll\n' > "$task_dir/expected"
cmp "$task_dir/expected" "$ENTRYPOINT_TEST_LOG"

: > "$ENTRYPOINT_TEST_LOG"
sh "$entrypoint" --migrate
printf '/app/Platform.Api.dll --migrate\n' > "$task_dir/expected"
cmp "$task_dir/expected" "$ENTRYPOINT_TEST_LOG"

: > "$ENTRYPOINT_TEST_LOG"
sh "$entrypoint" --bootstrap-teacher
printf '/app/Platform.Api.dll --bootstrap-teacher\n' > "$task_dir/expected"
cmp "$task_dir/expected" "$ENTRYPOINT_TEST_LOG"

: > "$ENTRYPOINT_TEST_LOG"
export ENTRYPOINT_TEST_FAIL_MIGRATE=1
set +e
sh "$entrypoint"
status=$?
set -e
test "$status" -eq 42
printf '/app/Platform.Api.dll --migrate\n' > "$task_dir/expected"
cmp "$task_dir/expected" "$ENTRYPOINT_TEST_LOG"

echo 'PASS: web startup migrates first; explicit commands bypass; migration failure blocks web startup'
