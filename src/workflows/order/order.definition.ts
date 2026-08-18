import type { WorkflowDefinition } from "@duraflows/core";

export const orderWorkflowDefinition: WorkflowDefinition = {
  name: "ecommerce-order",
  // v5.0.0: explicit definition version (defaults to 1 if omitted -- spelled
  // out here so the feature is visible in the code a reader looks at first).
  // Bump this whenever the states/events/commands below change content;
  // `WorkflowRuntime.initialize()` (run at NestJS module init) throws
  // `WorkflowDefinitionError` and refuses to start if the content hash drifts
  // under an unbumped version. See docs/definition-versions.md.
  version: 1,
  initialState: "pending",
  states: {
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
        // v1.0.0: command-only event — no `targetState`, runs commands and stays
        // in `pending`. A history record is appended; no `StateEnterEvent`
        // fires because no state was actually entered.
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

    paid: {
      onEnter: {
        targetState: "ready_to_ship",
        commands: [
          { name: "allocate-inventory" },
          // v1.0.0: bestEffort + per-command metadata. Failure here is
          // recorded in history but does NOT abort the onEnter chain or taint
          // `outcome`. `commandMetadata` is exposed to the handler via
          // `WorkflowExecutionContext.commandMetadata`.
          {
            name: "send-notification",
            metadata: { channel: "email", template: "payment-confirmed" },
          },
        ],
      },
    },

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
            // Same handler, different metadata — second bestEffort send
            { name: "send-notification", metadata: { channel: "sms", template: "delivered" } },
          ],
        },
      },
    },

    delivered: {
      events: {
        request_refund: {
          // v1.1.0: per-event guard. Runs BEFORE any commands; if it returns
          // `false`, the event short-circuits with `outcome: "guard-rejected"`,
          // no commands run, no state change, and a history row with
          // `rejectedBy: "refund-window"` is appended. `errorState` is for
          // command failures only — it does NOT catch guard rejections.
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
