# Command-Only Events

duraflows v1.0.0 made `targetState` optional on `WorkflowEventDefinition`. An event can now declare just `commands` and act as a side-effect-only operation that does not change state. The runtime still appends a history record, so the action is auditable.

An event must define at least one of `targetState`, `errorState`, or `commands` — a fully empty event is a definition error.

## This Example

`order.definition.ts` declares a `note_added` event in the `pending` state with no `targetState`:

```ts
pending: {
  events: {
    process_payment: { targetState: "payment_processing", commands: [{ name: "validate-order" }] },
    cancel: { targetState: "cancelled", commands: [{ name: "cancel-order" }] },
    // command-only — no targetState, stays in `pending`
    note_added: {
      commands: [{ name: "add-note" }],
    },
  },
},
```

`commands/add-note.command.ts` appends to `context.notes[]`:

```ts
@WorkflowCommand("add-note")
export class AddNoteCommand implements WorkflowCommandInterface {
  execute(subject: unknown, context: WorkflowExecutionContext): CommandResult {
    const note = (subject as { note?: string })?.note ?? "(no body)";
    const author = (context.triggerMetadata.actor as string) ?? "system";
    const notes = (context.context.notes as Array<...>) ?? [];
    notes.push({ at: context.now.toISOString(), author, body: note });
    context.context.notes = notes;
    return { ok: true, code: "NOTE_ADDED" };
  }
}
```

## Behaviour

- The transaction commits the context mutation and appends a history record with `fromState === toState === "pending"`.
- A `StateEnterEvent` **does** fire with `fromState === toState`. The runtime treats command-only events as a self-transition, so observers see them as `pending → pending via note_added`. Audit observers can filter on `event.fromState === event.toState` if they want to distinguish these from real transitions.
- The current state's `expiresAt` is preserved; a command-only event does not reset the timeout.
- `version` increments on each call (the instance row is updated for the context mutation).

## Running the Demo

```bash
# Create an order
UUID=$(./scripts/create-order.sh | jq -r '.uuid')

# Add a note — order stays in `pending`
./scripts/events/add-note.sh "$UUID" "Customer asked us to wait until Friday"

# Verify state unchanged
./scripts/queries/get-order.sh "$UUID"  # → currentState: "pending"

# History now contains a `note_added` row with fromState=toState=pending
./scripts/queries/get-history.sh "$UUID"
```

## When To Use This Pattern

- **Operator notes / annotations** — exactly this example.
- **Manual data corrections** — patch a context field that drifted.
- **Side-effect actions** — kick off a background re-index, emit a metric, request a vendor refresh, without paying the cost of modelling a full state.

For anything that should change what events are next available, use a real state transition.
