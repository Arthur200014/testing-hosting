#!/usr/bin/env bash
set -euo pipefail
printf 'Вставь OAuth-токен (ввод скрыт): '
IFS= read -r -s TOKEN
printf '\n'
if [ -z "$TOKEN" ]; then echo 'Пустой токен'; exit 1; fi
RESPONSE=$(curl -sS -w '\nHTTP_CODE:%{http_code}' -X POST \
  'https://cloud-api.yandex.net/v1/telemost-api/conferences' \
  -H "Authorization: OAuth $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"waiting_room_level":"PUBLIC"}')
unset TOKEN
printf '%s\n' "$RESPONSE"
