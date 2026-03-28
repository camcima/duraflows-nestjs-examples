import { Logger } from "@nestjs/common";
import { WorkflowCommand } from "@camcima/duraflows-nestjs";
import type {
  WorkflowCommand as WorkflowCommandInterface,
  CommandResult,
  WorkflowExecutionContext,
} from "@camcima/duraflows-core";

@WorkflowCommand("expire-shipment")
export class ExpireShipmentCommand implements WorkflowCommandInterface {
  private readonly logger = new Logger(ExpireShipmentCommand.name);

  execute(_subject: unknown, context: WorkflowExecutionContext): CommandResult {
    this.logger.log(`Shipment expired — inventory reservation released`);
    context.context.shipmentExpiredAt = context.now.toISOString();
    return { ok: true, code: "SHIPMENT_EXPIRED" };
  }
}
