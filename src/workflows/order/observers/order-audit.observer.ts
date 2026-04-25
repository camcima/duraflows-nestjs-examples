import { Injectable, Logger } from "@nestjs/common";
import type { StateEnterEvent, WorkflowObserver } from "@duraflows/core";

/**
 * v1.0.0 observer — fires post-commit on every state entry (events, onEnter
 * hops, timeouts, and the initial `createInstance` entry). Sequential,
 * at-most-once, and error-contained: any throw here is routed to the runtime's
 * `onObserverError` handler instead of rolling back the transition.
 *
 * `transitionUuid` matches the UUID seen by commands that ran on entry to this
 * state, so observer logs and command logs can be correlated 1:1.
 */
@Injectable()
export class OrderAuditObserver implements WorkflowObserver {
  readonly name = "order-audit";

  private readonly logger = new Logger(OrderAuditObserver.name);

  onEnter(event: StateEnterEvent): void {
    const arrow = event.fromState ? `${event.fromState} → ${event.toState}` : `∅ → ${event.toState}`;
    const trigger = event.triggerEvent ?? "(initial / onEnter)";

    this.logger.log(
      `[${event.workflowName}] ${event.instanceUuid.slice(0, 8)} ${arrow} via ${trigger} ` +
        `[transitionUuid=${event.transitionUuid.slice(0, 8)}]`,
    );
  }
}
