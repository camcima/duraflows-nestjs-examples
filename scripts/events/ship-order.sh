#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"
UUID="${1:?Usage: ship-order.sh <uuid>}"

curl -s -X POST "$BASE_URL/workflows/$UUID/events/ship" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
