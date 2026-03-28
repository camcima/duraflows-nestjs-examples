#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "=== 1. Creating order ==="
RESPONSE=$(curl -s -X POST "$BASE_URL/workflows" \
  -H "Content-Type: application/json" \
  -d '{
    "workflowName": "ecommerce-order",
    "context": {
      "orderId": "ORD-20260328-001",
      "customerEmail": "john@example.com",
      "items": [
        { "sku": "WIDGET-001", "name": "Blue Widget", "qty": 2, "price": 29.99 },
        { "sku": "GADGET-042", "name": "Red Gadget", "qty": 1, "price": 49.99 }
      ],
      "totalAmount": 109.97
    }
  }')
echo "$RESPONSE" | jq .
UUID=$(echo "$RESPONSE" | jq -r '.uuid')
echo "Order UUID: $UUID"
echo

echo "=== 2. Processing payment ==="
curl -s -X POST "$BASE_URL/workflows/$UUID/events/process_payment" \
  -H "Content-Type: application/json" \
  -d '{ "triggerMetadata": { "actor": "john@example.com", "source": "checkout-ui" } }' | jq .
echo

echo "=== 3. Payment success ==="
curl -s -X POST "$BASE_URL/workflows/$UUID/events/payment_success" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
echo

echo "=== 4. Shipping order ==="
curl -s -X POST "$BASE_URL/workflows/$UUID/events/ship" \
  -H "Content-Type: application/json" \
  -d '{ "triggerMetadata": { "actor": "admin@warehouse.com", "reason": "Batch shipment #42" } }' | jq .
echo

echo "=== 5. Delivering order ==="
curl -s -X POST "$BASE_URL/workflows/$UUID/events/deliver" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
echo

echo "=== Final order state ==="
curl -s "$BASE_URL/workflows/$UUID" | jq .
echo

echo "=== Full history ==="
curl -s "$BASE_URL/workflows/$UUID/history" | jq .
echo

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

echo "=== Database: workflow_instances row ==="
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -x \
  -c "SELECT * FROM workflow_instances WHERE uuid = '$UUID';"
echo

echo "=== Database: workflow_history rows ==="
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --pset=format=wrapped --pset=columns=120 \
  -c "SELECT uuid, from_state, event_name, to_state, outcome, command_results_json, trigger_metadata_json, created_at FROM workflow_history WHERE workflow_instance_uuid = '$UUID' ORDER BY created_at;"
