import { Logger } from "@nestjs/common";
import { WorkflowCommand } from "@duraflows/nestjs";
import type {
  WorkflowCommand as WorkflowCommandInterface,
  CommandResult,
  WorkflowExecutionContext,
} from "@duraflows/core";

/**
 * Fire-and-forget notification command (v1.0.0 `bestEffort`).
 *
 * Failure here — whether returned as `ok: false` or thrown — does NOT abort the
 * onEnter chain or taint the aggregate `outcome`. The runtime records the
 * failure in history and moves on, so flaky email/SMS providers can never
 * block an order from progressing.
 *
 * Per-command `metadata` is exposed via `context.commandMetadata` (v1.0.0),
 * letting one handler serve many call sites with different templates/channels.
 */
@WorkflowCommand("send-notification")
export class SendNotificationCommand implements WorkflowCommandInterface {
  readonly bestEffort = true;

  private readonly logger = new Logger(SendNotificationCommand.name);

  execute(subject: unknown, context: WorkflowExecutionContext): CommandResult {
    const channel = (context.commandMetadata.channel as string | undefined) ?? "email";
    const template = (context.commandMetadata.template as string | undefined) ?? "generic";
    const recipient = context.context.customerEmail as string | undefined;

    const sub = subject as { simulateNotificationFailure?: boolean } | undefined;

    if (sub?.simulateNotificationFailure) {
      this.logger.warn(
        `Notification provider down — ${channel}/${template} to ${recipient ?? "unknown"} skipped`,
      );
      throw new Error(`${channel} provider unavailable`);
    }

    this.logger.log(
      `Notification sent: ${channel}/${template} → ${recipient ?? "unknown"} (${context.fromState ?? "∅"} → ${context.toState})`,
    );
    return {
      ok: true,
      code: "NOTIFICATION_SENT",
      metadata: { channel, template, transitionUuid: context.transitionUuid },
    };
  }
}
