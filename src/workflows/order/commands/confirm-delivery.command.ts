import { Logger } from "@nestjs/common";
import { WorkflowCommand } from "@camcima/duraflows-nestjs";
import type {
  WorkflowCommand as WorkflowCommandInterface,
  CommandResult,
  WorkflowExecutionContext,
} from "@camcima/duraflows-core";

@WorkflowCommand("confirm-delivery")
export class ConfirmDeliveryCommand implements WorkflowCommandInterface {
  private readonly logger = new Logger(ConfirmDeliveryCommand.name);

  execute(_subject: unknown, context: WorkflowExecutionContext): CommandResult {
    this.logger.log(`Delivery confirmed (tracking: ${context.context.trackingNumber})`);
    context.context.deliveredAt = context.now.toISOString();
    return { ok: true, code: "DELIVERY_CONFIRMED" };
  }
}
