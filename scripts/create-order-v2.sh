#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"

# v5.0.0 side-by-side pattern (docs/side-by-side-versions.md): creates an
# instance of `ecommerce-order-v2`, the forked definition registered
# alongside `ecommerce-order` in order.module.ts. Same REST endpoint as
# create-order.sh -- only `workflowName` differs. `createInstance` has no
# `subject` field, so the new `fraud_review` gateway's screen-fraud command
# always runs "clean" for a freshly created order; force the flagged branch
# by passing `subject: { forceFraudFlag: true }` on the `payment_success`
# event instead (see scripts/events/process-payment.sh + the definition
# comments in order-v2.definition.ts).

curl -s -X POST "$BASE_URL/workflows" \
  -H "Content-Type: application/json" \
  -d '{
    "workflowName": "ecommerce-order-v2",
    "context": {
      "orderId": "ORD-V2-20260328-001",
      "customerEmail": "jane@example.com",
      "items": [
        { "sku": "WIDGET-001", "name": "Blue Widget", "qty": 1, "price": 29.99 }
      ],
      "totalAmount": 29.99
    }
  }' | jq .
