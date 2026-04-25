import type { WorkflowDefinition } from "@duraflows/core";

export const orderWorkflowDefinition: WorkflowDefinition = {
  name: "ecommerce-order",
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
