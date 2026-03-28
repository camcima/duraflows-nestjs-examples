# Refund Failure Path

This path exercises the **error state** feature. After a normal order lifecycle, a refund is requested but fails. The workflow transitions to `refund_failed` instead of `refunded`, and a retry eventually succeeds.

## Sequence Diagram

```mermaid
sequenceDiagram
    actor Customer
    actor Support
    participant API
    participant Workflow as Workflow Engine
    participant Commands

    Customer->>API: POST /workflows (create order)
    API->>Workflow: Create instance (pending)
    API-->>Customer: { uuid, currentState: "pending" }

    Customer->>API: POST /workflows/:uuid/events/process_payment
    Workflow->>Commands: validate-order
    Commands-->>Workflow: OK (ORDER_VALIDATED)
    Workflow->>Workflow: pending → payment_processing

    Customer->>API: POST /workflows/:uuid/events/payment_success
    Workflow->>Commands: confirm-payment
    Commands-->>Workflow: OK (PAYMENT_CONFIRMED)
    Workflow->>Workflow: payment_processing → paid
    Note over Workflow: onEnter auto-transition
    Workflow->>Commands: allocate-inventory
    Commands-->>Workflow: OK (INVENTORY_ALLOCATED)
    Workflow->>Workflow: paid → ready_to_ship

    Customer->>API: POST /workflows/:uuid/events/ship
    Workflow->>Commands: create-shipment
    Commands-->>Workflow: OK (SHIPMENT_CREATED)
    Workflow->>Workflow: ready_to_ship → shipped

    Customer->>API: POST /workflows/:uuid/events/deliver
    Workflow->>Commands: confirm-delivery
    Commands-->>Workflow: OK (DELIVERY_CONFIRMED)
    Workflow->>Workflow: shipped → delivered

    rect rgb(255, 230, 230)
        Note over Customer,Commands: Refund fails — errorState kicks in
        Customer->>API: POST /workflows/:uuid/events/request_refund
        Note right of Customer: subject: { forceFailure: true }
        Workflow->>Commands: process-refund
        Commands-->>Workflow: FAIL (REFUND_REJECTED)
        Workflow->>Workflow: delivered → refund_failed
        API-->>Customer: { currentState: "refund_failed" }
    end

    rect rgb(230, 255, 230)
        Note over Support,Commands: Support retries the refund
        Support->>API: POST /workflows/:uuid/events/retry_refund
        Workflow->>Commands: process-refund
        Commands-->>Workflow: OK (REFUND_PROCESSED)
        Workflow->>Workflow: refund_failed → refunded
        API-->>Support: { currentState: "refunded" }
    end
```

## State Diagram

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> payment_processing : process_payment
    payment_processing --> paid : payment_success
    paid --> ready_to_ship : onEnter (auto)
    ready_to_ship --> shipped : ship
    shipped --> delivered : deliver

    delivered --> refund_failed : request_refund (command fails)
    refund_failed --> refunded : retry_refund (command succeeds)
    refunded --> [*]

    state "refund_failed" as refund_failed
    state "refunded" as refunded
```

## Steps

| # | Event | Command | From State | To State | Outcome |
|---|-------|---------|------------|----------|---------|
| 1 | `process_payment` | `validate-order` | pending | payment_processing | OK |
| 2 | `payment_success` | `confirm-payment` | payment_processing | paid | OK |
| 3 | _(auto)_ | `allocate-inventory` | paid | ready_to_ship | OK |
| 4 | `ship` | `create-shipment` | ready_to_ship | shipped | OK |
| 5 | `deliver` | `confirm-delivery` | shipped | delivered | OK |
| 6 | `request_refund` | `process-refund` | delivered | refund_failed | **FAIL** |
| 7 | `retry_refund` | `process-refund` | refund_failed | refunded | OK |

## Key Concepts Demonstrated

- **Error states (`errorState`)** -- The `request_refund` event defines both a `targetState: "refunded"` and an `errorState: "refund_failed"`. When the `process-refund` command returns `{ ok: false }`, the workflow transitions to the error state instead of the target state.
- **Retry from error state** -- The `refund_failed` state defines a `retry_refund` event that re-executes the same `process-refund` command. If it succeeds, the workflow moves to `refunded`. If it fails again, it stays in `refund_failed`.
- **Subject data** -- The `forceFailure` flag is passed via the event's `subject` field, allowing the command to simulate a payment gateway rejection. This shows how external input can influence command behavior.

## Running It

```bash
./scripts/paths/refund-failure-path.sh
```

This script runs the full order lifecycle, then triggers a failing refund followed by a successful retry.
