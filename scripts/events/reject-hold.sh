#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"
UUID="${1:?Usage: reject-hold.sh <uuid>}"

# `ecommerce-order-v2` only (docs/side-by-side-versions.md) — a human
# reviewer rejects a `fraud_hold` instance, cancelling the order (reuses the
# `cancel-order` command shared with `ecommerce-order`).
curl -s -X POST "$BASE_URL/workflows/$UUID/events/reject_hold" \
  -H "Content-Type: application/json" \
  -d '{ "triggerMetadata": { "actor": "fraud-review@company.com", "reason": "confirmed fraud" } }' | jq .
