#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"
UUID="${1:?Usage: approve-hold.sh <uuid>}"

# `ecommerce-order-v2` only (docs/side-by-side-versions.md) — a human
# reviewer clears a `fraud_hold` instance, continuing on to `ready_to_ship`.
curl -s -X POST "$BASE_URL/workflows/$UUID/events/approve_hold" \
  -H "Content-Type: application/json" \
  -d '{ "triggerMetadata": { "actor": "fraud-review@company.com" } }' | jq .
