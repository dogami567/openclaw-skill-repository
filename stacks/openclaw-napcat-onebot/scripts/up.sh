#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example. Review it and set NAPCAT_ACCOUNT / API keys as needed."
fi

gen_token() {
  hexdump -n 16 -e '16/1 "%02x"' /dev/urandom
}

set_env_if_change_me() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" .env | head -n1 | cut -d= -f2- || true)"
  if [[ "${value}" == "change-me" ]]; then
    local token
    token="$(gen_token)"
    awk -v k="$key" -v v="$token" 'BEGIN{FS=OFS="="} $1==k { $0=k"="v } { print }' .env > .env.tmp
    mv .env.tmp .env
    echo "Updated placeholder token: ${key}"
  fi
}

set_env_if_change_me "OPENCLAW_GATEWAY_TOKEN"
set_env_if_change_me "CLAWDBOT_GATEWAY_TOKEN"

docker compose --env-file .env up -d openclaw-gateway napcat
./scripts/bootstrap.sh
docker compose --env-file .env ps

