import { Logger } from "@nestjs/common";
import { WorkflowCommand } from "@duraflows/nestjs";
import type {
  WorkflowCommand as WorkflowCommandInterface,
  CommandResult,
  WorkflowExecutionContext,
} from "@duraflows/core";

@WorkflowCommand("validate-order")
export class ValidateOrderCommand implements WorkflowCommandInterface {
  private readonly logger = new Logger(ValidateOrderCommand.name);

  execute(_subject: unknown, context: WorkflowExecutionContext): CommandResult {
    const { items, customerEmail } = context.context;

    if (!items || !customerEmail) {
      this.logger.warn("Order validation failed — missing required fields");
      return { ok: false, code: "VALIDATION_FAILED", message: "Missing required fields: items, customerEmail" };
    }

    this.logger.log(`Order validated: ${(items as unknown[]).length} item(s) for ${customerEmail}`);
    context.context.validatedAt = context.now.toISOString();
    return { ok: true, code: "ORDER_VALIDATED" };
  }
}
