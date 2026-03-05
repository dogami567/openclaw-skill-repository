#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

mkdir -p \
  ./data/openclaw/config \
  ./data/openclaw/workspace \
  ./data/workdir \
  ./data/napcat/qq \
  ./data/napcat/config \
  ./data/napcat/plugins \
  ./data/clawdbot/config \
  ./data/clawdbot/workspace

echo "Setting OpenClaw/Clawdbot data ownership to uid=1000 gid=1000 (requires sudo)..."
sudo chown -R 1000:1000 ./data/openclaw ./data/clawdbot || true

echo "Done."

