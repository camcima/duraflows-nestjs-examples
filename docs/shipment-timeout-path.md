# Shipment Timeout Path

This path exercises the **timeout** feature. After payment succeeds and inventory is allocated, the order sits in `ready_to_ship` until the 1-minute timeout expires, automatically transitioning to `shipment_expired`.

## Sequence Diagram

```mermaid
sequenceDiagram
    actor Customer
    participant API
    participant Workflow as Workflow Engine
    participant Commands
    participant Timeout as Timeout Processor

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

    rect rgb(255, 243, 205)
        Note over Workflow,Timeout: 1 minute passes with no ship event...

        Timeout->>API: POST /workflows/timeouts/process
        API->>Workflow: Check for expired timeouts
        Workflow->>Workflow: shipment_timeout expired
        Workflow->>Commands: expire-shipment
        Commands-->>Workflow: OK (SHIPMENT_EXPIRED)
        Workflow->>Workflow: ready_to_ship → shipment_expired
        API-->>Timeout: { processed: 1 }
    end

    Customer->>API: GET /workflows/:uuid
    API-->>Customer: { currentState: "shipment_expired" }
```

## State Diagram

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> payment_processing : process_payment
    payment_processing --> paid : payment_success
    paid --> ready_to_ship : onEnter (auto)

    ready_to_ship --> shipment_expired : shipment_timeout (1 min)
    shipment_expired --> [*]

    state "ready_to_ship" as ready_to_ship
    state "shipment_expired" as shipment_expired

    note right of ready_to_ship
        If no "ship" event arrives
        within 1 minute, the timeout
        fires automatically.
    end note
```

## Steps

| # | Event | Command | From State | To State | Notes |
|---|-------|---------|------------|----------|-------|
| 1 | `process_payment` | `validate-order` | pending | payment_processing | |
| 2 | `payment_success` | `confirm-payment` | payment_processing | paid | |
| 3 | _(auto)_ | `allocate-inventory` | paid | ready_to_ship | |
| 4 | _(timeout)_ | `expire-shipment` | ready_to_ship | shipment_expired | After 1 min |

## Key Concepts Demonstrated

- **Timeouts** -- Events can define a `timeout` property (e.g., `{ afterMinutes: 1 }`). When the workflow has been in the state longer than the specified duration, the timeout event becomes eligible for processing.
- **Timeout processing** -- Timeouts are not processed automatically by a background job. Instead, the `POST /workflows/timeouts/process` endpoint must be called (e.g., via a cron job). This gives you full control over when and how timeouts are checked.
- **Multiple timeouts in the workflow** -- This workflow defines two timeouts:
  - `payment_timeout` in `payment_processing` (30 minutes) -- cancels the order if payment takes too long.
  - `shipment_timeout` in `ready_to_ship` (1 minute) -- expires the order if it isn't shipped in time.

  This path demonstrates only the shipment timeout; the payment timeout follows the same mechanism.

## Running It

```bash
./scripts/paths/shipment-timeout-path.sh
```

This script creates an order, processes payment, then waits ~70 seconds before calling the timeout processor. The order should end up in `shipment_expired`.
