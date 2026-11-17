#!/usr/bin/env bash
# Disposable REAL API/PostgreSQL accounts; never point this runner at Timeweb.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
for tool in docker openssl python3 node curl; do command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 1; }; done
task_dir="$(mktemp -d)"
project="tas-calendar-browser-${GITHUB_RUN_ID:-local}-$(openssl rand -hex 4)"
export POSTGRES_DB=calendar_browser_test POSTGRES_USER=calendar_browser_test
export POSTGRES_PASSWORD JWT_SIGNING_KEY STUDENT_CODE_PEPPER TAS_REAL_TEST_PASSWORD
POSTGRES_PASSWORD="$(openssl rand -hex 24)"
JWT_SIGNING_KEY="$(openssl rand -base64 48)"
STUDENT_CODE_PEPPER="$(openssl rand -base64 48)"
TAS_REAL_TEST_PASSWORD="$(openssl rand -hex 24)"
export API_PORT=18081 CORS_ALLOWED_ORIGIN=http://127.0.0.1:8767
export TAS_REAL_COMPOSE_PROJECT="$project"
export TAS_REAL_API=http://127.0.0.1:18081 TAS_REAL_SITE=http://127.0.0.1:8767
compose=(docker compose --env-file .env.example -p "$project")
if [[ "${TAS_BOARD_TEST_ONLY:-0}" == 1 ]]; then
  export POSTGRES_DB=tas_board_test_api
  export TAS_BOARD_PERMIT_LIFETIME_SECONDS=12
  if [[ "${TAS_BOARD_GROUP_TEST_ONLY:-0}" == 1 ]]; then export TAS_BOARD_PERMIT_LIFETIME_SECONDS=120; fi
  export TAS_BOARD_SIGNING_KEY="$(openssl rand -base64 32)"
  export TAS_BOARD_SCENE_ROOT_KEY="$(openssl rand -base64 32)"
  export BOARD_TEST_DATABASE_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@127.0.0.1:15439/$POSTGRES_DB"
  cat > "$task_dir/board.yaml" <<'YAML'
services:
  db:
    ports: ["127.0.0.1:15439:5432"]
  api:
    environment:
      ASPNETCORE_ENVIRONMENT: IntegrationTests
      BoardPrototype__Enabled: "true"
      BoardPrototype__PermitLifetimeSeconds: "${TAS_BOARD_PERMIT_LIFETIME_SECONDS}"
      BoardPrototype__SigningKey: ${TAS_BOARD_SIGNING_KEY}
      BoardPrototype__SceneRootKey: ${TAS_BOARD_SCENE_ROOT_KEY}
      Cors__AllowedOrigins__1: http://127.0.0.1:8768
YAML
  compose+=(-f compose.yaml -f "$task_dir/board.yaml")
fi
site_pid=''
cleanup() {
  local code=$?
  [[ -z "$site_pid" ]] || kill "$site_pid" 2>/dev/null || true
  if (( code != 0 )); then "${compose[@]}" logs --tail=25 api migrate || true; fi
  "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$task_dir"
}
trap cleanup EXIT
"${compose[@]}" up --build -d db migrate api
ready=false
for attempt in {1..45}; do
  if curl --silent --fail --max-time 3 "$TAS_REAL_API/health/ready" >/dev/null; then ready=true; break; fi
  sleep 2
done
[[ "$ready" == true ]] || { echo 'Isolated API readiness failed' >&2; exit 1; }
# Existing privileged bootstrap creates only new accounts in these fresh workspaces.
for side in north south; do
  export TEACHER_BOOTSTRAP_WORKSPACE="tas-calendar-$side"
  export TEACHER_BOOTSTRAP_EMAIL="calendar-$side@example.invalid"
  export TEACHER_BOOTSTRAP_PASSWORD="$TAS_REAL_TEST_PASSWORD"
  "${compose[@]}" --profile admin run --rm teacher-bootstrap
done
# Programs have no create UI yet; all students/classes/rules/lessons below use HTTP APIs.
"${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
INSERT INTO platform."Programs" ("Id","WorkspaceId","Code","DisplayName","IsActive","CreatedAt")
SELECT gen_random_uuid(),"Id",'TEST-MATH','Учебная математика',true,NOW()
FROM platform."Workspaces" WHERE "Slug" IN ('tas-calendar-north','tas-calendar-south');
SQL
if [[ "${TAS_BOARD_TEST_ONLY:-0}" == 1 ]]; then
  env -u JWT_SIGNING_KEY -u STUDENT_CODE_PEPPER -u TAS_BOARD_SCENE_ROOT_KEY node platform/calendar-real-browser.mjs
  exit 0
fi
mkdir -p "$task_dir/site/platform"
for file in student.html material-file.mjs lesson-recordings.mjs student-card.mjs pupil-history.mjs pupil-feedback.mjs teacher.html teacher-report.mjs teacher-data.mjs teacher-library.mjs teacher-mutation.mjs teacher-calendar.mjs homework-deadline.mjs class-native-homework.mjs class-materials-ui.mjs lesson-materials-ui.mjs lesson-topics-ui.mjs class-program-ui.mjs meleto-fidelity.css; do
  cp "platform/$file" "$task_dir/site/platform/$file"
done
# Rewrite ONLY the disposable copy. Published source and production settings stay untouched.
python3 - "$task_dir/site/platform/teacher.html" <<'PY'
import sys
p=sys.argv[1]
s=open(p).read()
old="const API = 'https://arthur200014-testing-hosting-8c4e.twc1.net';"
assert s.count(old)==1
open(p,'w').write(s.replace(old,"const API = 'http://127.0.0.1:18081';"))
PY
python3 - "$task_dir/site/platform/student.html" <<'PYLOCAL'
import sys
p=sys.argv[1];s=open(p).read();old="https://arthur200014-testing-hosting-8c4e.twc1.net/api/v1/"
assert s.count(old)==1
open(p,'w').write(s.replace(old,'http://127.0.0.1:18081/api/v1/'))
PYLOCAL
python3 -m http.server 8767 --bind 127.0.0.1 --directory "$task_dir/site" > "$task_dir/site.log" 2>&1 &
site_pid=$!
for attempt in {1..15}; do
  if curl --silent --fail "$TAS_REAL_SITE/platform/teacher.html" >/dev/null; then break; fi
  sleep 1
done
node platform/calendar-real-browser.mjs
