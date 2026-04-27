# Event Guards (v1.1.0)

duraflows v1.1.0 adds **per-event guards**: read-only predicates that decide whether an event is allowed to fire. A guard runs **before** any commands; if it returns `false`, the event short-circuits with `outcome: "guard-rejected"`, no commands run, no state change, and a history row is appended for the audit trail.

Guards are different from `errorState`:

| Concern | Where it runs | What it observes | Outcome |
|---|---|---|---|
| **Guard** | Before commands | A precondition (e.g. "is the user verified?") | `"guard-rejected"`, stays in `fromState` |
| **`errorState`** | After commands | A command failed (`{ ok: false }`) | `"failure"`, transitions to `errorState` |

`errorState` does **not** catch guard rejections. A rejected event simply does nothing, which is the right behaviour for a precondition: you'd retry it later, on a different instance, or after a separate workflow leg makes it eligible.

## This Example

The order workflow's `request_refund` event in the `delivered` state has a refund-window guard:

```ts
// order.definition.ts
delivered: {
  events: {
    request_refund: {
      // v1.1.0: per-event guard, evaluated before commands
      guard: { name: "refund-window", metadata: { maxDays: 30 } },
      targetState: "refunded",
      errorState: "refund_failed",
      commands: [{ name: "process-refund" }],
    },
  },
},
```

The guard implementation reads `context.deliveredAt` (written by `confirm-delivery`) and the `maxDays` metadata supplied at the call site:

```ts
// guards/refund-window.guard.ts
@Injectable()
export class RefundWindowGuard implements WorkflowGuard {
  readonly name = "refund-window";

  evaluate(_subject: unknown, context: WorkflowExecutionContext): boolean {
    const deliveredAt = context.context.deliveredAt as string | undefined;
    const maxDays = (context.commandMetadata.maxDays as number | undefined) ?? 30;

    if (!deliveredAt) return false;
    const ageDays = (context.now.getTime() - Date.parse(deliveredAt)) / (24 * 60 * 60 * 1000);
    return ageDays <= maxDays;
  }
}
```

Wire-up in `OrderModule`:

```ts
// order.module.ts
WorkflowModule.forRootAsync<[pg.Pool, OrderAuditObserver, RefundWindowGuard]>({
  imports: [OrderObserversModule],
  enableControllers: true,
  useFactory: (pool, auditObserver, refundWindowGuard) => ({
    workflows: [orderWorkflowDefinition],
    persistence: pgWorkflowProviders(pool),
    observers: [auditObserver],
    // v1.1.0: per-event guards, wired through DI
    guards: [refundWindowGuard],
  }),
  inject: [PG_POOL, OrderAuditObserver, RefundWindowGuard],
}),

// In providers:
providers: [
  /* commands... */,
  RefundWindowGuard,
],
```

## Guards Must Be Pure

A guard's `evaluate` must be a read-only predicate. Don't mutate the subject, don't call external services, don't write to databases. Side effects belong in commands, which run **after** the guard passes. Guards may be re-evaluated (a timeout sweep retries an instance, for example) and any side effects performed inside them will repeat without compensation.

The runtime enforces purity by handing the guard a `deepFreeze`d clone of `ctx.context`. An attempted mutation throws under strict mode rather than silently leaking into the persisted instance state.

If you need to call an external system to make the decision, do that work in a command on a prior transition and stash the result in `context` for the guard to read.

## Behaviour

- The guard runs inside the same transaction as the would-be transition.
- If `false`, the runtime appends a history row with `outcome: "guard-rejected"`, `rejectedBy: "<guard-name>"`, `fromState === toState` (no transition), and an empty `commandResultsJson`.
- The instance's `version` increments on each rejection because we update the row to clear/preserve `expiresAt` and bump audit fields.
- The HTTP response from `POST /workflows/:uuid/events/:eventName` carries `outcome: "guard-rejected"` and `rejectedBy: "<guard-name>"`.
- For **timeout-driven** events with a guard that rejects, the runtime additionally clears `expiresAt` so the timeout sweep will not pick the instance up again on the next tick.

## Running the Demos

Two end-to-end paths exercise both branches.

**Guard passes** (delivered moments ago → refund proceeds):

```bash
./scripts/paths/refund-window-pass-path.sh
```

**Guard rejects** (delivered 60 days ago → refund short-circuited):

```bash
./scripts/paths/refund-window-rejected-path.sh
```

The rejected path backdates `context.deliveredAt` to 60 days ago via a direct `psql` UPDATE — this is the simplest way to simulate an old delivery without introducing a clock-override endpoint.

## Validation at Bootstrap

When you supply guards via the convenience `guards: [...]` array (as `OrderModule` does), `WorkflowModule` validates every `guard.name` reference in the registered workflow definitions at module bootstrap. An unresolved ref fails registration with `WorkflowDefinitionError` — typos are caught before the app accepts traffic.

If you supply a custom `guardRegistry` instead, the runtime cannot enumerate names and skips bootstrap validation; unresolved refs surface at first use as `WorkflowError`. See the core `docs/nestjs-integration.md` in the duraflows repo for the full reasoning.

## When To Use Guards

- **Eligibility checks** — refund window, plan-tier gating, KYC verification
- **Concurrency / idempotency gates** — "only fire if not already in flight" reading from context
- **Business-hours / quiet-hours** — clock-based gates on `ctx.now`
- **Feature flags** — gated event rollouts driven by `ctx.metadata` cohort fields

For things that should **transform** state on rejection (e.g. route to a `manual_review` state), use a command that returns `{ ok: false }` and an `errorState`. Guards are for "this event can't fire right now"; `errorState` is for "this event tried but failed".
