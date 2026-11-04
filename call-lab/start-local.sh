#!/usr/bin/env bash
set -euo pipefail
if ! command -v node >/dev/null; then
  echo "Нужен Node.js 20+ (https://nodejs.org/)"
  exit 1
fi
printf "Вставь OAuth-токен Яндекса (скрытый ввод): "
IFS= read -r -s TELEMOST_TOKEN
printf "\n"
printf "Придумай код ADMIN_PIN (минимум 8 символов, скрытый ввод): "
IFS= read -r -s ADMIN_PIN
printf "\n"
if [ "${#TELEMOST_TOKEN}" -lt 10 ] || [ "${#ADMIN_PIN}" -lt 8 ]; then
  echo "Токен пустой либо короткий; ADMIN_PIN должен быть минимум 8 символов."
  exit 1
fi
export TELEMOST_TOKEN ADMIN_PIN
export ALLOWED_ORIGINS="http://localhost:3000,https://arthur200014.github.io"
echo "Сайт: http://localhost:3000"
echo "Нажми «Создать встречу через Яндекс Телемост» и введи ADMIN_PIN."
node server.js
