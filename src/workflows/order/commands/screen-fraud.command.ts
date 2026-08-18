import { Logger } from "@nestjs/common";
import { WorkflowCommand } from "@duraflows/nestjs";
import type {
  WorkflowCommand as WorkflowCommandInterface,
  CommandResult,
  WorkflowExecutionContext,
} from "@duraflows/core";

/**
 * NEW in `ecommerce-order-v2` (see docs/side-by-side-versions.md) — the only
 * command handler that `order-v2.definition.ts` does not share with
 * `order.definition.ts`. Screens the order for fraud signals as part of the
 * `fraud_review` state's `onEnter` gateway.
 *
 * `ok: true` continues the onEnter chain to `ready_to_ship`; `ok: false`
 * branches it to `fraud_hold` for a human decision (Pattern A branching —
 * see the duraflows-builder skill, Step 4e).
 *
 * `subject.forceFraudFlag` lets test scripts force the flagged branch on
 * demand, the same convention `process-refund.command.ts` uses for
 * `forceFailure`. Because `fraud_review`'s onEnter fires as part of the
 * onEnter chain triggered by the `payment_success` event (paid -> fraud_review
 * -> ready_to_ship/fraud_hold, all one chain), `forceFraudFlag` must be set in
 * the `subject` of the `payment_success` call — `createInstance` has no
 * `subject` field, so it cannot be set at order creation.
 */
@WorkflowCommand("screen-fraud")
export class ScreenFraudCommand implements WorkflowCommandInterface {
  private readonly logger = new Logger(ScreenFraudCommand.name);

  execute(subject: unknown, context: WorkflowExecutionContext): CommandResult {
    const sub = subject as { forceFraudFlag?: boolean } | undefined;

    if (sub?.forceFraudFlag) {
      this.logger.warn(`Order flagged for manual fraud review (amount: ${context.context.totalAmount})`);
      context.context.fraudFlaggedAt = context.now.toISOString();
      return { ok: false, code: "FRAUD_FLAGGED", message: "Order flagged for manual fraud review" };
    }

    this.logger.log(`Fraud screen clear (amount: ${context.context.totalAmount})`);
    context.context.fraudScreenedAt = context.now.toISOString();
    return { ok: true, code: "FRAUD_SCREEN_CLEAR" };
  }
}
