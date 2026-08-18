#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"
UUID="${1:?Usage: complete-payment-fraud-flag.sh <uuid>}"

# `ecommerce-order-v2` only (docs/side-by-side-versions.md) — same
# `payment_success` event as complete-payment.sh, but forces the new
# `screen-fraud` command (fraud_review's onEnter) down its flagged branch via
# `subject.forceFraudFlag`, landing the instance in `fraud_hold` instead of
# `ready_to_ship`. `createInstance` has no `subject` field, so this is the
# only way to reach `fraud_hold` — it cannot be forced at order creation.
curl -s -X POST "$BASE_URL/workflows/$UUID/events/payment_success" \
  -H "Content-Type: application/json" \
  -d '{ "subject": { "forceFraudFlag": true } }' | jq .
