#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example. Review it and set NAPCAT_ACCOUNT / API keys as needed."
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

ONEBOT_TOKEN="${ONEBOT_TOKEN:-openclaw-napcat}"
NAPCAT_DATA_DIR="${NAPCAT_DATA_DIR:-./data/napcat}"

echo "[bootstrap] Ensuring services are running..."
docker compose --env-file .env up -d openclaw-gateway napcat >/dev/null

echo "[bootstrap] Writing NapCat OneBot config..."
mkdir -p "${NAPCAT_DATA_DIR}/config"
cat > "${NAPCAT_DATA_DIR}/config/onebot11.json" <<JSON
{
  "network": {
    "httpServers": [
      {
        "enable": true,
        "name": "http",
        "host": "0.0.0.0",
        "port": 3000,
        "enableCors": true,
        "enableWebsocket": false,
        "messagePostFormat": "array",
        "token": "${ONEBOT_TOKEN}",
        "debug": false
      }
    ],
    "httpSseServers": [],
    "httpClients": [],
    "websocketServers": [
      {
        "enable": true,
        "name": "ws",
        "host": "0.0.0.0",
        "port": 3001,
        "reportSelfMessage": false,
        "enableForcePushEvent": true,
        "messagePostFormat": "array",
        "token": "${ONEBOT_TOKEN}",
        "debug": false,
        "heartInterval": 30000
      }
    ],
    "websocketClients": [],
    "plugins": []
  },
  "musicSignUrl": "",
  "enableLocalFile2Url": false,
  "parseMultMsg": false
}
JSON

echo "[bootstrap] Restarting NapCat..."
docker compose --env-file .env restart napcat >/dev/null

echo "[bootstrap] Installing OpenClaw plugin (onebot) into the gateway container..."
gateway_cid="$(docker compose --env-file .env ps -q openclaw-gateway)"
if [[ -z "${gateway_cid}" ]]; then
  echo "Cannot find openclaw-gateway container id. Is the gateway running?" >&2
  exit 1
fi

docker exec -u root "${gateway_cid}" sh -lc "mkdir -p /home/node/.openclaw/extensions && chmod 755 /home/node/.openclaw/extensions && rm -rf /home/node/.openclaw/extensions/onebot" >/dev/null
docker cp "./extensions/onebot" "${gateway_cid}:/home/node/.openclaw/extensions/onebot" >/dev/null
docker exec -u root "${gateway_cid}" sh -lc "chmod -R go-w /home/node/.openclaw/extensions/onebot || true" >/dev/null

echo "[bootstrap] Seeding OpenClaw defaults (setup)..."
docker compose --env-file .env run -T --rm openclaw-cli setup >/dev/null

echo "[bootstrap] Syncing OpenClaw gateway token (.env -> openclaw.json)..."
if [[ -n "${OPENCLAW_GATEWAY_TOKEN:-}" && "${OPENCLAW_GATEWAY_TOKEN}" != "change-me" ]]; then
  docker compose --env-file .env run -T --rm openclaw-cli config set gateway.auth.mode token >/dev/null
  docker compose --env-file .env run -T --rm openclaw-cli config set gateway.auth.token "${OPENCLAW_GATEWAY_TOKEN}" >/dev/null
else
  echo "[bootstrap] WARNING: OPENCLAW_GATEWAY_TOKEN is missing or still 'change-me'. Dashboard/CLI auth may fail." >&2
fi

echo "[bootstrap] Writing OpenClaw config for OneBot channel..."
docker compose --env-file .env run -T --rm openclaw-cli config set plugins.entries.onebot.enabled true >/dev/null
docker compose --env-file .env run -T --rm openclaw-cli config set plugins.allow '["onebot"]' --strict-json >/dev/null
docker compose --env-file .env run -T --rm openclaw-cli config set channels.onebot.wsUrl "ws://napcat:3001" >/dev/null
docker compose --env-file .env run -T --rm openclaw-cli config set channels.onebot.httpUrl "http://napcat:3000" >/dev/null
docker compose --env-file .env run -T --rm openclaw-cli config set channels.onebot.token "${ONEBOT_TOKEN}" >/dev/null
docker compose --env-file .env run -T --rm openclaw-cli config set channels.onebot.enabled true >/dev/null
docker compose --env-file .env run -T --rm openclaw-cli config set channels.onebot.requireMention true >/dev/null

echo "[bootstrap] Restarting OpenClaw gateway..."
docker compose --env-file .env restart openclaw-gateway >/dev/null

echo "[bootstrap] Done. Status:"
docker compose --env-file .env ps
docker compose --env-file .env run -T --rm openclaw-cli channels status
docker compose --env-file .env run -T --rm openclaw-cli dashboard --no-open

