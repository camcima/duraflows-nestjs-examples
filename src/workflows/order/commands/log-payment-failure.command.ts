import { Logger } from "@nestjs/common";
import { WorkflowCommand } from "@duraflows/nestjs";
import type {
  WorkflowCommand as WorkflowCommandInterface,
  CommandResult,
  WorkflowExecutionContext,
} from "@duraflows/core";

@WorkflowCommand("log-payment-failure")
export class LogPaymentFailureCommand implements WorkflowCommandInterface {
  private readonly logger = new Logger(LogPaymentFailureCommand.name);

  execute(_subject: unknown, context: WorkflowExecutionContext): CommandResult {
    this.logger.warn(`Payment failed for amount: ${context.context.totalAmount}`);
    context.context.paymentFailedAt = context.now.toISOString();
    context.context.paymentFailureReason = "Payment gateway declined the transaction";
    return { ok: true, code: "PAYMENT_FAILURE_LOGGED" };
  }
}
