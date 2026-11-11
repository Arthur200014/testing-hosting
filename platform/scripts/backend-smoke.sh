#!/usr/bin/env bash
# Isolated, disposable baseline: do not use production data or credentials.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

for tool in docker openssl curl; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing required tool: $tool" >&2
    exit 1
  fi
done

project="tas-p00-02-smoke-${GITHUB_RUN_ID:-local}"
export POSTGRES_DB=platform_smoke
export POSTGRES_USER=platform_smoke
export POSTGRES_PASSWORD
POSTGRES_PASSWORD="$(openssl rand -hex 24)"
export JWT_SIGNING_KEY
JWT_SIGNING_KEY="$(openssl rand -base64 48)"
export STUDENT_CODE_PEPPER
STUDENT_CODE_PEPPER="$(openssl rand -base64 48)"
export API_PORT="${TAS_SMOKE_PORT:-18080}"

compose=(docker compose --env-file .env.example -p "$project")
cleanup() {
  local exit_code=$?
  if (( exit_code != 0 )); then
    "${compose[@]}" ps || true
    "${compose[@]}" logs --tail=80 db migrate api || true
  fi
  "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${compose[@]}" config --quiet
"${compose[@]}" up --build -d db migrate api

base_url="http://127.0.0.1:${API_PORT}"
ready=false
for attempt in {1..45}; do
  if curl --silent --show-error --fail --max-time 3 "${base_url}/health/ready" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 2
done

if [[ "$ready" != true ]]; then
  echo "API readiness failed after migration/startup" >&2
  exit 1
fi
curl --silent --show-error --fail "${base_url}/health/live" >/dev/null

response_file="$(mktemp)"
trap 'rm -f "$response_file"; cleanup' EXIT

status="$(curl --silent --show-error --max-time 10 -o "$response_file" -w '%{http_code}' \
  -X POST "${base_url}/api/v1/student-sessions" \
  -H 'Content-Type: application/json' \
  --data '{"workspace":"synthetic-no-such-workspace","code":"synthetic-no-such-code"}')"
if [[ "$status" != "401" ]] || ! grep -Fq 'Invalid student credentials.' "$response_file"; then
  echo "Expected generic 401 for fabricated student code; received HTTP $status" >&2
  exit 1
fi

status="$(curl --silent --show-error --max-time 10 -o "$response_file" -w '%{http_code}' \
  -X POST "${base_url}/api/v1/test-attempts" \
  -H 'Content-Type: application/json' --data '{}')"
if [[ "$status" != "401" ]]; then
  echo "Expected unauthenticated test-attempt rejection; received HTTP $status" >&2
  exit 1
fi

echo "PASS: PostgreSQL migrations, API live/ready, synthetic credential 401 and unauthenticated write 401"
