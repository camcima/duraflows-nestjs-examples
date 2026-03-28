#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"
UUID="${1:?Usage: request-refund-fail.sh <uuid>}"

curl -s -X POST "$BASE_URL/workflows/$UUID/events/request_refund" \
  -H "Content-Type: application/json" \
  -d '{
    "trigger": { "type": "user" },
    "subject": { "forceFailure": true }
  }' | jq .
