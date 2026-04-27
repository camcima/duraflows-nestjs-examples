import { Injectable, Logger } from "@nestjs/common";
import type { WorkflowGuard, WorkflowExecutionContext } from "@duraflows/core";

/**
 * v1.1.0 guard. Allows the `request_refund` event to fire only while the
 * order is still inside the configured refund window (in days).
 *
 * Reads:
 * - `context.context.deliveredAt` — ISO timestamp written by `confirm-delivery`
 * - `context.commandMetadata.maxDays` — comes from the event's
 *   `guard.metadata` block in `order.definition.ts`
 *
 * Returns `false` to short-circuit the event with `outcome: "guard-rejected"`.
 * No commands run, no state change, but a history row with `rejectedBy:
 * "refund-window"` is appended for the audit trail.
 *
 * Pure: reads from `ctx.context` only, never mutates. Mutations would throw
 * under v1.1.0 — the runtime hands the guard a frozen clone.
 */
@Injectable()
export class RefundWindowGuard implements WorkflowGuard {
  readonly name = "refund-window";
  private readonly logger = new Logger(RefundWindowGuard.name);

  evaluate(_subject: unknown, context: WorkflowExecutionContext): boolean {
    const deliveredAt = context.context.deliveredAt as string | undefined;
    const maxDays = (context.commandMetadata.maxDays as number | undefined) ?? 30;

    if (!deliveredAt) {
      // Defensive: an order should not reach `delivered` without this field,
      // but if it did, refunds are disallowed pending investigation.
      this.logger.warn(`Refund denied: deliveredAt is missing on ${context.fromState}`);
      return false;
    }

    const deliveredMs = Date.parse(deliveredAt);
    const ageDays = (context.now.getTime() - deliveredMs) / (24 * 60 * 60 * 1000);
    const eligible = ageDays <= maxDays;

    this.logger.log(
      `Refund eligibility: deliveredAt=${deliveredAt}, ageDays=${ageDays.toFixed(1)}, maxDays=${maxDays}, eligible=${eligible}`,
    );
    return eligible;
  }
}
