#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"

curl -s -X POST "$BASE_URL/workflows" \
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
    },
    "trigger": { "type": "user" }
  }' | jq .
