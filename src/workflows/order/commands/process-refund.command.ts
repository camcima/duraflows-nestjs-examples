import { Logger } from "@nestjs/common";
import { WorkflowCommand } from "@duraflows/nestjs";
import type {
  WorkflowCommand as WorkflowCommandInterface,
  CommandResult,
  WorkflowExecutionContext,
} from "@duraflows/core";

@WorkflowCommand("process-refund")
export class ProcessRefundCommand implements WorkflowCommandInterface {
  private readonly logger = new Logger(ProcessRefundCommand.name);

  execute(subject: unknown, context: WorkflowExecutionContext): CommandResult {
    const amount = context.context.totalAmount;
    const sub = subject as { forceFailure?: boolean } | undefined;

    if (sub?.forceFailure) {
      this.logger.warn(`Refund rejected by payment gateway for amount: ${amount}`);
      context.context.refundFailedAt = context.now.toISOString();
      return { ok: false, code: "REFUND_REJECTED", message: "Payment gateway rejected the refund" };
    }

    this.logger.log(`Refund processed for amount: ${amount}`);
    context.context.refundedAt = context.now.toISOString();
    context.context.refundAmount = amount;
    return { ok: true, code: "REFUND_PROCESSED" };
  }
}
