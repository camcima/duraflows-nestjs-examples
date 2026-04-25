#!/usr/bin/env bash
# v1.0.0 demo: bestEffort commands.
#
# `send-notification` is wired into the `deliver` event with `bestEffort: true`.
# When the subject sets `simulateNotificationFailure: true`, the command throws
# inside the runtime — but the workflow still transitions to `delivered` and
# `outcome` stays `success`. The thrown error is captured in
# `command_results_json` as a serializable `{ name, message, stack }` shape.
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "=== 1. Creating order ==="
RESPONSE=$(curl -s -X POST "$BASE_URL/workflows" \
  -H "Content-Type: application/json" \
  -d '{
    "workflowName": "ecommerce-order",
    "context": {
      "orderId": "ORD-BESTEFFORT-001",
      "customerEmail": "carlos@example.com",
      "items": [{ "sku": "WIDGET-001", "name": "Blue Widget", "qty": 1, "price": 29.99 }],
      "totalAmount": 29.99
    }
  }')
echo "$RESPONSE" | jq .
UUID=$(echo "$RESPONSE" | jq -r '.uuid')
echo "Order UUID: $UUID"
echo

echo "=== 2. Processing payment ==="
curl -s -X POST "$BASE_URL/workflows/$UUID/events/process_payment" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
echo

echo "=== 3. Payment success — onEnter chain runs allocate-inventory + send-notification (bestEffort, succeeds) ==="
curl -s -X POST "$BASE_URL/workflows/$UUID/events/payment_success" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
echo

echo "=== 4. Shipping ==="
curl -s -X POST "$BASE_URL/workflows/$UUID/events/ship" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
echo

echo "=== 5. Delivering with notification provider FORCED to fail ==="
echo "    The bestEffort send-notification will throw, but the workflow"
echo "    must still reach 'delivered' with outcome=success."
curl -s -X POST "$BASE_URL/workflows/$UUID/events/deliver" \
  -H "Content-Type: application/json" \
  -d '{
    "triggerMetadata": { "actor": "courier@example.com" },
    "subject": { "simulateNotificationFailure": true }
  }' | jq .
echo

echo "=== 6. Final state (must be 'delivered') ==="
curl -s "$BASE_URL/workflows/$UUID" | jq '{ currentState, version }'
echo

echo "=== 7. History — most recent record shows bestEffort failure recorded but outcome=success ==="
# History is returned newest-first, so [0] is the deliver record we just created.
curl -s "$BASE_URL/workflows/$UUID/history" \
  | jq '.[0] | { fromState, eventName, toState, outcome, commandResults: .commandResultsJson }'
