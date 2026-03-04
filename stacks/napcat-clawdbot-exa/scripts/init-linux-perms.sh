#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

mkdir -p \
  ./data/clawdbot/config \
  ./data/clawdbot/workspace \
  ./data/napcat/qq \
  ./data/napcat/config \
  ./data/napcat/plugins

echo "Setting Clawdbot data ownership to uid=1000 gid=1000 (requires sudo)..."
sudo chown -R 1000:1000 ./data/clawdbot

echo "Done."

