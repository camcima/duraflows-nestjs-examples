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
        commands: [{ name: "allocate-inventory" }],
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
          commands: [{ name: "confirm-delivery" }],
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
