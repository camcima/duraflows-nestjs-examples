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

const observerErrorLogger = new Logger("WorkflowObserver");

@Module({
  imports: [
    // v1.0.0: forRootAsync is now generic over factory args (`<TArgs>`).
    // Declaring `<[pg.Pool, OrderAuditObserver]>` typechecks the inject tokens
    // against the factory parameters at compile time.
    WorkflowModule.forRootAsync<[pg.Pool, OrderAuditObserver]>({
      // Observer lives in OrderObserversModule so it's visible to this
      // dynamic-module factory (provider scopes don't cross dynamic-module
      // boundaries unless re-exported).
      imports: [OrderObserversModule],
      enableControllers: true,
      useFactory: (pool, auditObserver) => ({
        workflows: [orderWorkflowDefinition],
        persistence: pgWorkflowProviders(pool),
        // v1.0.0: observers moved into the factory return value (was previously
        // a top-level option). This lets observers compose from DI-resolved
        // services like loggers, audit clients, metrics, etc.
        observers: [auditObserver],
        // v1.0.0: replace the default `console.warn` fallback with a structured
        // logger so observer failures are visible in normal app log streams.
        onObserverError: (error, observer, event) => {
          observerErrorLogger.warn(
            `Observer "${observer.name}" threw on ${event.workflowName} ${event.instanceUuid}: ${error instanceof Error ? error.message : String(error)}`,
          );
        },
      }),
      inject: [PG_POOL, OrderAuditObserver],
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
