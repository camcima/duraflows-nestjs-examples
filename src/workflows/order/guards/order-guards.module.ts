import { Module } from "@nestjs/common";
import { RefundWindowGuard } from "./refund-window.guard.js";

/**
 * Stand-alone module that provides and exports order guards.
 *
 * Same rationale as `OrderObserversModule`: `WorkflowModule.forRootAsync(...)`
 * is itself a `DynamicModule`, so its `useFactory` can only inject from
 * providers visible to that dynamic module — either global providers, or
 * providers exported by modules listed in the `imports` array of the async
 * options. A provider declared directly in `OrderModule.providers` is NOT
 * visible to `WorkflowModule`'s factory, because `OrderModule` is the module
 * *importing* `WorkflowModule`, not the other way around — dependency
 * visibility only flows from an imported module's exports, never from the
 * importer down into the imported module. Bundling guards in their own
 * module keeps the wiring discoverable and lets the factory pull them in via
 * `imports: [OrderGuardsModule]`.
 */
@Module({
  providers: [RefundWindowGuard],
  exports: [RefundWindowGuard],
})
export class OrderGuardsModule {}
