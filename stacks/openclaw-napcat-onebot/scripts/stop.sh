#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

docker compose --env-file .env stop openclaw-gateway napcat
docker compose --env-file .env ps

