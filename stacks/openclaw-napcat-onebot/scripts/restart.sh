#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example. Review it and set NAPCAT_ACCOUNT / API keys as needed."
fi

docker compose --env-file .env up -d --force-recreate openclaw-gateway napcat
./scripts/bootstrap.sh
docker compose --env-file .env ps

