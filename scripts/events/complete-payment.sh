#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"
UUID="${1:?Usage: complete-payment.sh <uuid>}"

curl -s -X POST "$BASE_URL/workflows/$UUID/events/payment_success" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
