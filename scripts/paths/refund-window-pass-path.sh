#!/usr/bin/env bash
#
# v1.1.0: end-to-end demo of the refund-window guard PASSING.
#
# Mirror of `refund-window-rejected-path.sh`: same workflow, same guard, but
# the order is refunded right after delivery so `deliveredAt` is well within
# the 30-day window. The guard returns `true`, commands run, and the order
# transitions to `refunded`.
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "=== 1. Creating order ==="
RESPONSE=$(curl -s -X POST "$BASE_URL/workflows" \
  -H "Content-Type: application/json" \
  -d '{
    "workflowName": "ecommerce-order",
    "context": {
      "orderId": "ORD-GUARD-PASS",
      "customerEmail": "fresh@example.com",
      "items": [
        { "sku": "WIDGET-001", "name": "Blue Widget", "qty": 1, "price": 29.99 }
      ],
      "totalAmount": 29.99
    }
  }')
echo "$RESPONSE" | jq .
UUID=$(echo "$RESPONSE" | jq -r '.uuid')
echo "Order UUID: $UUID"
echo

echo "=== 2. Pay, ship, deliver ==="
curl -s -X POST "$BASE_URL/workflows/$UUID/events/process_payment" -H "Content-Type: application/json" -d '{}' >/dev/null
curl -s -X POST "$BASE_URL/workflows/$UUID/events/payment_success" -H "Content-Type: application/json" -d '{}' >/dev/null
curl -s -X POST "$BASE_URL/workflows/$UUID/events/ship" -H "Content-Type: application/json" -d '{}' >/dev/null
curl -s -X POST "$BASE_URL/workflows/$UUID/events/deliver" -H "Content-Type: application/json" -d '{}' >/dev/null
curl -s "$BASE_URL/workflows/$UUID" | jq '{currentState, deliveredAt: .context.deliveredAt}'
echo

echo "=== 3. Requesting refund (delivered moments ago — guard PASSES) ==="
REFUND=$(curl -s -X POST "$BASE_URL/workflows/$UUID/events/request_refund" \
  -H "Content-Type: application/json" \
  -d '{ "triggerMetadata": { "actor": "fresh@example.com", "reason": "Changed mind" } }')
echo "$REFUND" | jq .
OUTCOME=$(echo "$REFUND" | jq -r '.outcome')
TO_STATE=$(echo "$REFUND" | jq -r '.toState')
echo
echo "outcome = $OUTCOME"
echo "toState = $TO_STATE"
[ "$OUTCOME" = "success" ] || { echo "FAIL: expected outcome=success"; exit 1; }
[ "$TO_STATE" = "refunded" ] || { echo "FAIL: expected toState=refunded"; exit 1; }
echo

echo "=== 4. Final state ==="
curl -s "$BASE_URL/workflows/$UUID" | jq '{currentState, refundAmount: .context.refundAmount, refundedAt: .context.refundedAt}'
echo

echo "=== 5. History (note: NO guard-rejected row this time) ==="
curl -s "$BASE_URL/workflows/$UUID/history" | jq '[.[] | { eventName, outcome, rejectedBy, fromState, toState }]'
