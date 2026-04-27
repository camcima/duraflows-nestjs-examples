#!/usr/bin/env bash
#
# v1.1.0: end-to-end demo of an event guard rejecting an event.
#
# The `request_refund` event in `order.definition.ts` declares
# `guard: { name: "refund-window", metadata: { maxDays: 30 } }`. The guard
# reads `context.deliveredAt` and rejects the event if delivery is older
# than `maxDays`. We exercise the rejection path by:
#   1. Running the order to `delivered` normally
#   2. Backdating `context_json -> 'deliveredAt'` to 60 days ago via psql
#   3. Calling `request_refund` and asserting the response carries
#      `outcome: "guard-rejected"` and `rejectedBy: "refund-window"`
#   4. Verifying the workflow stayed in `delivered` and history shows the
#      rejection row
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"

# Load DB config from .env (same defaults as the app)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../../.env"
if [ -f "$ENV_FILE" ]; then
  set -a; source "$ENV_FILE"; set +a
fi
DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_USER="${DATABASE_USER:-postgres}"
DB_NAME="${DATABASE_NAME:-duraflows_examples}"
export PGPASSWORD="${DATABASE_PASSWORD:-postgres}"

echo "=== 1. Creating order ==="
RESPONSE=$(curl -s -X POST "$BASE_URL/workflows" \
  -H "Content-Type: application/json" \
  -d '{
    "workflowName": "ecommerce-order",
    "context": {
      "orderId": "ORD-GUARD-REJECTED",
      "customerEmail": "stale@example.com",
      "items": [
        { "sku": "GADGET-042", "name": "Red Gadget", "qty": 1, "price": 49.99 }
      ],
      "totalAmount": 49.99
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

echo "=== 3. Backdating deliveredAt to 60 days ago (so the guard rejects) ==="
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
  UPDATE workflow_instances
  SET context_json = jsonb_set(
    context_json,
    '{deliveredAt}',
    to_jsonb((NOW() - INTERVAL '60 days')::text)
  )
  WHERE uuid = '$UUID';"
echo "Updated context.deliveredAt:"
curl -s "$BASE_URL/workflows/$UUID" | jq '.context.deliveredAt'
echo

echo "=== 4. Requesting refund (guard should REJECT) ==="
REFUND=$(curl -s -X POST "$BASE_URL/workflows/$UUID/events/request_refund" \
  -H "Content-Type: application/json" \
  -d '{ "triggerMetadata": { "actor": "stale@example.com", "reason": "Outside refund window" } }')
echo "$REFUND" | jq .
OUTCOME=$(echo "$REFUND" | jq -r '.outcome')
REJECTED_BY=$(echo "$REFUND" | jq -r '.rejectedBy // "(none)"')
echo
echo "outcome    = $OUTCOME"
echo "rejectedBy = $REJECTED_BY"
[ "$OUTCOME" = "guard-rejected" ] || { echo "FAIL: expected outcome=guard-rejected"; exit 1; }
[ "$REJECTED_BY" = "refund-window" ] || { echo "FAIL: expected rejectedBy=refund-window"; exit 1; }
echo

echo "=== 5. State should still be 'delivered' (no transition occurred) ==="
curl -s "$BASE_URL/workflows/$UUID" | jq '.currentState'
echo

echo "=== 6. History shows the guard-rejected row ==="
curl -s "$BASE_URL/workflows/$UUID/history" | jq '[.[] | { eventName, outcome, rejectedBy, fromState, toState }]'
echo

echo "=== Database: workflow_history rows ==="
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --pset=format=wrapped --pset=columns=120 \
  -c "SELECT event_name, outcome, rejected_by, from_state, to_state FROM workflow_history WHERE workflow_instance_uuid = '$UUID' ORDER BY created_at;"
