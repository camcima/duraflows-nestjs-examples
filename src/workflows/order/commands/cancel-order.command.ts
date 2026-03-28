import { Logger } from "@nestjs/common";
import { WorkflowCommand } from "@camcima/duraflows-nestjs";
import type {
  WorkflowCommand as WorkflowCommandInterface,
  CommandResult,
  WorkflowExecutionContext,
} from "@camcima/duraflows-core";

@WorkflowCommand("cancel-order")
export class CancelOrderCommand implements WorkflowCommandInterface {
  private readonly logger = new Logger(CancelOrderCommand.name);

  execute(_subject: unknown, context: WorkflowExecutionContext): CommandResult {
    this.logger.log("Order cancelled");
    context.context.cancelledAt = context.now.toISOString();
    return { ok: true, code: "ORDER_CANCELLED" };
  }
}
