#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"
UUID="${1:?Usage: retry-refund.sh <uuid>}"

curl -s -X POST "$BASE_URL/workflows/$UUID/events/retry_refund" \
  -H "Content-Type: application/json" \
  -d '{ "trigger": { "type": "admin" } }' | jq .
