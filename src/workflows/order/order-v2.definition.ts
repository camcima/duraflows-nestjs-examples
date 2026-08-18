import type { WorkflowDefinition } from "@duraflows/core";

/**
 * A fork of `ecommerce-order` under a DIFFERENT workflow `name`.
 *
 * This is NOT duraflows version pinning. `WorkflowDefinition.version` (see
 * `order.definition.ts` and docs/definition-versions.md) is provenance only —
 * it never selects which content an instance executes; every instance always
 * runs whatever is *currently registered* under its `workflowName`. Two
 * definitions cannot share a name either:
 * `InMemoryDefinitionRegistry.register()` throws on a duplicate name, and
 * every resolution site in `WorkflowRuntime` looks up the definition by name
 * alone. So the only way two differently-shaped flows can run side by side in
 * 5.0.0 is under two different `name`s — a workaround, not a duraflows
 * feature. Full writeup: docs/side-by-side-versions.md.
 *
 * The fork: a fraud-review gateway (`fraud_review` -> `fraud_hold`) is
 * inserted between `paid` and `ready_to_ship`. Everything else is
 * byte-for-byte identical to `ecommerce-order` and — this is the point worth
 * noticing — reuses the SAME command implementations and the SAME
 * `refund-window` guard as `ecommerce-order`, registered once in
 * `order.module.ts` and referenced by both definitions by name. Forking a
 * workflow name is cheap on the code side; docs/side-by-side-versions.md
 * covers what it costs operationally.
 */
export const orderV2WorkflowDefinition: WorkflowDefinition = {
  name: "ecommerce-order-v2",
  version: 1,
  initialState: "pending",
  states: {
    // --- identical to ecommerce-order -------------------------------------
    pending: {
      events: {
        process_payment: {
          targetState: "payment_processing",
          commands: [{ name: "validate-order" }],
        },
        cancel: {
          targetState: "cancelled",
          commands: [{ name: "cancel-order" }],
        },
        note_added: {
          commands: [{ name: "add-note" }],
        },
      },
    },

    payment_processing: {
      events: {
        payment_success: {
          targetState: "paid",
          commands: [{ name: "confirm-payment" }],
        },
        payment_failure: {
          targetState: "payment_failed",
          commands: [{ name: "log-payment-failure" }],
        },
        payment_timeout: {
          targetState: "cancelled",
          commands: [{ name: "cancel-order" }],
          timeout: { afterMinutes: 30 },
        },
      },
    },

    // --- CHANGED from ecommerce-order --------------------------------------
    // v1's `paid` onEnter targets `ready_to_ship` directly. Here it targets
    // the new `fraud_review` gateway instead; the chain continues through it
    // automatically (onEnter chaining -- see duraflows-developer skill).
    paid: {
      onEnter: {
        targetState: "fraud_review",
        commands: [
          { name: "allocate-inventory" },
          {
            name: "send-notification",
            metadata: { channel: "email", template: "payment-confirmed" },
          },
        ],
      },
    },

    // NEW state. Runs the new `screen-fraud` command and branches: a clean
    // screen continues the chain to `ready_to_ship`; a flagged screen routes
    // to the new `fraud_hold` waiting state instead (Pattern A branching).
    fraud_review: {
      onEnter: {
        commands: [{ name: "screen-fraud" }],
        targetState: "ready_to_ship",
        errorState: "fraud_hold",
      },
    },

    // NEW state. A human reviewer approves (continue to shipping) or rejects
    // (cancel) an order the fraud screen flagged. Reuses `cancel-order`.
    fraud_hold: {
      events: {
        approve_hold: {
          targetState: "ready_to_ship",
        },
        reject_hold: {
          targetState: "cancelled",
          commands: [{ name: "cancel-order" }],
        },
      },
    },

    // --- identical to ecommerce-order from here down ------------------------
    ready_to_ship: {
      events: {
        ship: {
          targetState: "shipped",
          commands: [{ name: "create-shipment" }],
        },
        shipment_timeout: {
          targetState: "shipment_expired",
          commands: [{ name: "expire-shipment" }],
          timeout: { afterMinutes: 1 },
        },
      },
    },

    shipment_expired: {},

    shipped: {
      events: {
        deliver: {
          targetState: "delivered",
          commands: [
            { name: "confirm-delivery" },
            { name: "send-notification", metadata: { channel: "sms", template: "delivered" } },
          ],
        },
      },
    },

    delivered: {
      events: {
        // Same guard ref as ecommerce-order -- resolved against the one
        // shared guard registry configured in order.module.ts.
        request_refund: {
          guard: { name: "refund-window", metadata: { maxDays: 30 } },
          targetState: "refunded",
          errorState: "refund_failed",
          commands: [{ name: "process-refund" }],
        },
      },
    },

    cancelled: {},

    payment_failed: {
      events: {
        retry_payment: {
          targetState: "payment_processing",
          commands: [{ name: "validate-order" }],
        },
        cancel: {
          targetState: "cancelled",
          commands: [{ name: "cancel-order" }],
        },
      },
    },

    refund_failed: {
      events: {
        retry_refund: {
          targetState: "refunded",
          errorState: "refund_failed",
          commands: [{ name: "process-refund" }],
        },
      },
    },

    refunded: {},
  },
};
