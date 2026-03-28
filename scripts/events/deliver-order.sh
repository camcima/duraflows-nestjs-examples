#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"
UUID="${1:?Usage: deliver-order.sh <uuid>}"

curl -s -X POST "$BASE_URL/workflows/$UUID/events/deliver" \
  -H "Content-Type: application/json" \
  -d '{ "trigger": { "type": "system" } }' | jq .
