import { Logger, Module } from "@nestjs/common";
import type pg from "pg";
import { WorkflowModule } from "@duraflows/nestjs";
import { pgWorkflowProviders } from "@duraflows/pg";
import { PG_POOL } from "../../database/database.module.js";
import { orderWorkflowDefinition } from "./order.definition.js";
import { ValidateOrderCommand } from "./commands/validate-order.command.js";
import { ConfirmPaymentCommand } from "./commands/confirm-payment.command.js";
import { LogPaymentFailureCommand } from "./commands/log-payment-failure.command.js";
import { CancelOrderCommand } from "./commands/cancel-order.command.js";
import { CreateShipmentCommand } from "./commands/create-shipment.command.js";
import { ConfirmDeliveryCommand } from "./commands/confirm-delivery.command.js";
import { AllocateInventoryCommand } from "./commands/allocate-inventory.command.js";
import { ProcessRefundCommand } from "./commands/process-refund.command.js";
import { ExpireShipmentCommand } from "./commands/expire-shipment.command.js";
import { SendNotificationCommand } from "./commands/send-notification.command.js";
import { AddNoteCommand } from "./commands/add-note.command.js";
import { OrderAuditObserver } from "./observers/order-audit.observer.js";
import { OrderObserversModule } from "./observers/order-observers.module.js";
import { RefundWindowGuard } from "./guards/refund-window.guard.js";
import { OrderGuardsModule } from "./guards/order-guards.module.js";

const observerErrorLogger = new Logger("WorkflowObserver");

@Module({
  imports: [
    // v1.0.0: forRootAsync is generic over factory args (`<TArgs>`).
    // v1.1.0: third arg is the guard instance — typed alongside Pool + observer
    // so the inject tokens are checked against the factory params at compile time.
    WorkflowModule.forRootAsync<[pg.Pool, OrderAuditObserver, RefundWindowGuard]>({
      // Observer and guard live in their own exporting modules so they're
      // visible to this dynamic-module factory (provider scopes don't cross
      // dynamic-module boundaries unless re-exported — see OrderGuardsModule
      // for why RefundWindowGuard can't just live in OrderModule.providers).
      imports: [OrderObserversModule, OrderGuardsModule],
      enableControllers: true,
      useFactory: (pool, auditObserver, refundWindowGuard) => ({
        workflows: [orderWorkflowDefinition],
        persistence: pgWorkflowProviders(pool),
        // v1.0.0: observers moved into the factory return value (was previously
        // a top-level option). This lets observers compose from DI-resolved
        // services like loggers, audit clients, metrics, etc.
        observers: [auditObserver],
        // v1.1.0: per-event guards wired through DI. Each guard is a
        // @Injectable class that implements `WorkflowGuard`. The runtime
        // resolves guard refs in the workflow definition (e.g.
        // `guard: { name: "refund-window" }` on `request_refund`) against
        // this array at module bootstrap; an unknown ref fails registration
        // with `WorkflowDefinitionError`.
        guards: [refundWindowGuard],
        // v1.0.0: replace the default `console.warn` fallback with a structured
        // logger so observer failures are visible in normal app log streams.
        onObserverError: (error, observer, event) => {
          observerErrorLogger.warn(
            `Observer "${observer.name}" threw on ${event.workflowName} ${event.instanceUuid}: ${error instanceof Error ? error.message : String(error)}`,
          );
        },
      }),
      inject: [PG_POOL, OrderAuditObserver, RefundWindowGuard],
    }),
  ],
  providers: [
    ValidateOrderCommand,
    ConfirmPaymentCommand,
    LogPaymentFailureCommand,
    CancelOrderCommand,
    AllocateInventoryCommand,
    CreateShipmentCommand,
    ConfirmDeliveryCommand,
    ProcessRefundCommand,
    ExpireShipmentCommand,
    SendNotificationCommand,
    AddNoteCommand,
  ],
})
export class OrderModule {}
