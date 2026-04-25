# Observers

Observers are lifecycle hooks introduced in **duraflows v1.0.0**. The runtime fires a `StateEnterEvent` on every state entry — events, `onEnter` hops, timeouts, and the initial `createInstance` entry — **after the transaction commits**. Observers are the right place for cross-cutting concerns that must not affect runtime correctness: audit logs, metrics, cache invalidation, projections, webhooks.

## Semantics

- **Post-commit** — the database write is durable before observers run, so an observer never sees a state that was rolled back.
- **At-most-once** — an observer that throws is not retried.
- **Sequential** — observers run one after another in registration order (does not block the runtime call that triggered the transition; the runtime returns once the transaction commits, then observers fire).
- **Error-contained** — a thrown error is routed to `onObserverError` (or `console.warn` if not configured) and does not abort other observers, the transition, or the response.

## This Example

`src/workflows/order/observers/order-audit.observer.ts` implements `WorkflowObserver`:

```ts
@Injectable()
export class OrderAuditObserver implements WorkflowObserver {
  readonly name = "order-audit";

  onEnter(event: StateEnterEvent): void {
    const arrow = event.fromState ? `${event.fromState} → ${event.toState}` : `∅ → ${event.toState}`;
    const trigger = event.triggerEvent ?? "(initial / onEnter)";
    this.logger.log(
      `[${event.workflowName}] ${event.instanceUuid.slice(0, 8)} ${arrow} via ${trigger} ` +
        `[transitionUuid=${event.transitionUuid.slice(0, 8)}]`,
    );
  }
}
```

It is wired in `order.module.ts` via the v1.0.0 pattern: register the observer as a NestJS provider, inject it into the `useFactory`, and return it from `WorkflowModuleFactoryConfig.observers`.

```ts
WorkflowModule.forRootAsync<[pg.Pool, OrderAuditObserver]>({
  enableControllers: true,
  useFactory: (pool, auditObserver) => ({
    workflows: [orderWorkflowDefinition],
    persistence: pgWorkflowProviders(pool),
    observers: [auditObserver],
    onObserverError: (error, observerName, event) => {
      observerErrorLogger.warn(`Observer "${observerName}" threw: ...`);
    },
  }),
  inject: [PG_POOL, OrderAuditObserver],
});
```

## v1.0.0 Breaking Change

In v0.x, observers were a top-level option on `WorkflowModuleAsyncOptions`. In v1.0.0 they moved into `WorkflowModuleFactoryConfig` (the object returned by `useFactory`) so they can compose from DI-resolved services. The synchronous `forRoot` is unchanged — `observers` remains a top-level option there.

## What You'll See

Run the happy path:

```bash
./scripts/paths/happy-path.sh
```

The server log shows entries like:

```
[Nest] LOG [OrderAuditObserver] [ecommerce-order] a1b2c3d4 ∅ → pending via (initial / onEnter) [transitionUuid=11111111]
[Nest] LOG [OrderAuditObserver] [ecommerce-order] a1b2c3d4 pending → payment_processing via process_payment [transitionUuid=22222222]
[Nest] LOG [OrderAuditObserver] [ecommerce-order] a1b2c3d4 payment_processing → paid via payment_success [transitionUuid=33333333]
[Nest] LOG [OrderAuditObserver] [ecommerce-order] a1b2c3d4 paid → ready_to_ship via (initial / onEnter) [transitionUuid=44444444]
[Nest] LOG [OrderAuditObserver] [ecommerce-order] a1b2c3d4 ready_to_ship → shipped via ship [transitionUuid=55555555]
[Nest] LOG [OrderAuditObserver] [ecommerce-order] a1b2c3d4 shipped → delivered via deliver [transitionUuid=66666666]
```

`transitionUuid` matches the UUID seen by commands that ran on entry to the same state, so observer logs and command logs can be correlated 1:1 — this is critical for distributed tracing.

## When NOT to Use an Observer

Observers fire **after** commit and **at-most-once**. Don't put business-critical work here. If your work must run inside the transaction, must retry on failure, or must be transactionally atomic with the state change, use a workflow command instead.
