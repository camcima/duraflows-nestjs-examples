import { Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { WorkflowCommand } from "@camcima/duraflows-nestjs";
import type {
  WorkflowCommand as WorkflowCommandInterface,
  CommandResult,
  WorkflowExecutionContext,
} from "@camcima/duraflows-core";

@WorkflowCommand("create-shipment")
export class CreateShipmentCommand implements WorkflowCommandInterface {
  private readonly logger = new Logger(CreateShipmentCommand.name);

  execute(_subject: unknown, context: WorkflowExecutionContext): CommandResult {
    const trackingNumber = `TRK-${randomUUID().slice(0, 8).toUpperCase()}`;
    this.logger.log(`Shipment created with tracking number: ${trackingNumber}`);
    context.context.shippedAt = context.now.toISOString();
    context.context.trackingNumber = trackingNumber;
    return { ok: true, code: "SHIPMENT_CREATED" };
  }
}
