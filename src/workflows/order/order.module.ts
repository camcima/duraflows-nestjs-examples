import { Module } from "@nestjs/common";
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

@Module({
  imports: [
    WorkflowModule.forRootAsync({
      enableControllers: true,
      useFactory: (pool: pg.Pool) => ({
        workflows: [orderWorkflowDefinition],
        persistence: pgWorkflowProviders(pool),
      }),
      inject: [PG_POOL],
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
  ],
})
export class OrderModule {}
