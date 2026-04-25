import { Module } from "@nestjs/common";
import { OrderAuditObserver } from "./order-audit.observer.js";

/**
 * Stand-alone module that provides and exports order observers.
 *
 * `WorkflowModule.forRootAsync(...)` is itself a `DynamicModule`, so its
 * `useFactory` can only inject from providers visible to that dynamic module —
 * either global providers, or providers exported by modules listed in the
 * `imports` array of the async options. Bundling observers in their own
 * module keeps the wiring discoverable and lets the factory pull them in via
 * `imports: [OrderObserversModule]`.
 */
@Module({
  providers: [OrderAuditObserver],
  exports: [OrderAuditObserver],
})
export class OrderObserversModule {}
