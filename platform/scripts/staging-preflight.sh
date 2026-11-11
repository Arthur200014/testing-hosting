#!/usr/bin/env bash
# Validates staging config, including secrets, without dumping environment values.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"
env_file="${1:-.env.staging}"
flag="${2:-}"
if [[ "$flag" != "" && "$flag" != "--example" ]]; then
  echo "Usage: bash platform/scripts/staging-preflight.sh [env-file] [--example]" >&2
  exit 2
fi
if [[ ! -f "$env_file" ]]; then
  echo "Staging environment file is missing (copy .env.staging.example privately)." >&2
  exit 1
fi
if [[ "$flag" != "--example" ]]; then
  # Fail closed if unprotected on Unix; keep passwords out of terminal output.
  mode="$(stat -c '%a' "$env_file")"
  if [[ "$mode" != "600" && "$mode" != "400" ]]; then
    echo "Staging environment file must have chmod 600 or 400." >&2
    exit 1
  fi
fi
if [[ "$flag" == "--example" ]]; then
  docker compose --env-file "$env_file" -f compose.yaml -f compose.staging.yaml --profile tools config --format json |
    python3 platform/scripts/check-staging-config.py --example
else
  docker compose --env-file "$env_file" -f compose.yaml -f compose.staging.yaml --profile tools config --format json |
    python3 platform/scripts/check-staging-config.py
fi
