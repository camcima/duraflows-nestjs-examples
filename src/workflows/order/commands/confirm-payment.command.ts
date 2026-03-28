import { Logger } from "@nestjs/common";
import { WorkflowCommand } from "@camcima/duraflows-nestjs";
import type {
  WorkflowCommand as WorkflowCommandInterface,
  CommandResult,
  WorkflowExecutionContext,
} from "@camcima/duraflows-core";

@WorkflowCommand("confirm-payment")
export class ConfirmPaymentCommand implements WorkflowCommandInterface {
  private readonly logger = new Logger(ConfirmPaymentCommand.name);

  execute(_subject: unknown, context: WorkflowExecutionContext): CommandResult {
    this.logger.log(`Payment confirmed for amount: ${context.context.totalAmount}`);
    context.context.paidAt = context.now.toISOString();
    return { ok: true, code: "PAYMENT_CONFIRMED" };
  }
}
