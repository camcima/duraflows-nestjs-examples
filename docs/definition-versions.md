# Definition Versions (v5.0.0)

duraflows v5.0.0 adds an explicit `version` field to `WorkflowDefinition`, a `workflow_definitions` snapshot table that records the content of every `(workflowName, version)` pair ever registered, and a startup guard that refuses to boot if a definition's content changed without its `version` being bumped. Every workflow instance and every history row also carries a `definitionVersion` stamp recording which version governed that instance/transition.

## Read This First: Versioning Does Not Pin Execution

**This is provenance, not pinning.** In v5.0.0, every instance — brand new or already in flight — still executes whatever content is **currently registered** for that workflow name, regardless of the version number stamped on the instance or on any of its history rows. There is no mechanism yet that runs an in-flight instance against the exact definition content it was created under. Version-pinned execution is planned for a later duraflows release; it does not exist in 5.0.0.

Concretely: if you deploy a new build with different workflow content, **every** existing instance of that workflow starts executing the new content on its very next transition — the same way it always has, version field or not. The `definitionVersion` stamp only tells you, after the fact, which content an instance *did* run under at each point in its history. It does not protect an in-flight instance from a content change. See [Live Walkthrough 2](#2-resolution-is-unchanged-a-live-demonstration) below for a real, reproduced example of this.

If that's a problem for the change you're making — not just "I want to publish a new version," but "I need in-flight instances to keep their current behavior while new instances get the new behavior" — versioning alone doesn't solve it. See [docs/side-by-side-versions.md](side-by-side-versions.md) for the workaround this example app demonstrates (forking to a new workflow name) and why it's a workaround rather than a feature.

## The `version` Field

```ts
// order.definition.ts
export const orderWorkflowDefinition: WorkflowDefinition = {
  name: "ecommerce-order",
  version: 1, // explicit; omitting it also defaults to 1
  initialState: "pending",
  states: { /* ... */ },
};
```

- `version` is optional and defaults to `1` when omitted. This example sets it explicitly (see the comment in `order.definition.ts`) so the feature is visible in the file a reader opens first.
- It must be a positive safe integer. Registering a non-integer or `<= 0` version throws `WorkflowDefinitionError` at registration time (`"version must be a positive integer, got ..."`).
- **Bump it whenever you change the definition's content** — states, events, commands, guards, timeouts, metadata, anything under `states`. The rule that enforces this is the startup guard, below.
- Bumping `version` alone, with no other content change, is legal and expected — see [Live Walkthrough 1](#1-bumping-version-creates-a-new-snapshot).

## The `workflow_definitions` Snapshot Table

```
                     Table "public.workflow_definitions"
     Column      |           Type           | Nullable | Default
-----------------+--------------------------+----------+---------
 workflow_name   | text                     | not null |
 version         | integer                  | not null |
 content_hash    | text                     | not null |
 definition_json | jsonb                    | not null |
 registered_at   | timestamptz              | not null | now()
Primary key: (workflow_name, version)
```

The first time `WorkflowRuntime.initialize()` sees a given `(workflowName, version)` pair, it writes an **immutable** row: the full definition JSON, a canonical content hash (SHA-256 over the definition with `version` itself excluded — see below), and a timestamp. `initialize()` runs automatically at NestJS module init (`WorkflowRuntimeInitializer implements OnModuleInit`), so this happens on every app startup, not just the first one ever.

A real row from this example app, queried with the new `list-definition-snapshots.sh` script:

```bash
./scripts/queries/list-definition-snapshots.sh
```

```
  workflow_name  | version |                              content_hash                               |         registered_at
-----------------+---------+-------------------------------------------------------------------------+-------------------------------
 ecommerce-order |       1 | sha256:bd26110cf5ce8df2998c5fbbdb6e5ff8ed8468a904a9c3c7df3af6fea5ab7acf | 2026-08-17 20:57:15.914961-04
(1 row)
```

**The hash excludes `version` (and `versionPolicy`).** Relabeling a version without touching content never changes the hash; changing content without relabeling the version always does. This is exactly what the startup guard checks. Restarting the app repeatedly with no content change reuses the same row (`INSERT ... ON CONFLICT (workflow_name, version) DO NOTHING`) — `registered_at` does not move and no new row appears. Confirmed by restarting this app three times during verification: the row above kept the same `registered_at` timestamp (`20:57:15`) across all of them.

## Stamping: `definitionVersion` on Instances and History

`WorkflowInstance.definitionVersion` and `WorkflowHistoryRecord.definitionVersion` are stamped with whatever version is **currently registered** — at creation, and again on every transition (including command-only events and `onEnter` hops). Both fields are exposed as-is on the REST responses (`GET /workflows/:uuid` and `GET /workflows/:uuid/history`), since the controllers return the core `WorkflowInstance`/`WorkflowHistoryRecord` objects directly.

### Legacy rows adopt the current version on their next transition

A row with `definitionVersion: null` predates versioning — either it was created by a pre-5.0.0 app, or (as simulated below) an operator/migration cleared it. The next time that instance transitions, it gets stamped with whatever version is currently registered, same as any other instance.

To reproduce (the same trick `docs/guards.md` uses to simulate a hard-to-reach condition — a direct `psql` write, since the API has no way to produce a `NULL` stamp on demand):

```bash
UUID=$(./scripts/create-order.sh | jq -r '.uuid')
psql -h localhost -U postgres -d duraflows_examples \
  -c "UPDATE workflow_instances SET definition_version = NULL WHERE uuid = '$UUID';"

./scripts/queries/get-definition-versions.sh "$UUID"   # definitionVersion: null
./scripts/events/add-note.sh "$UUID" "legacy row demo"
./scripts/queries/get-definition-versions.sh "$UUID"   # definitionVersion: 1
```

Real output from running exactly this against the local database:

```
Instance:                              Instance (after note_added):
{                                       {
  "currentState": "pending",             "currentState": "pending",
  "definitionVersion": null              "definitionVersion": 1
}                                       }

                                        History (oldest first):
                                        [
                                          {
                                            "eventName": "note_added",
                                            "fromState": "pending",
                                            "toState": "pending",
                                            "outcome": "success",
                                            "definitionVersion": 1
                                          }
                                        ]
```

## Live Walkthroughs

Both of these were performed for real against the local database while writing this document; the definitions and instances they created are still there if you inspect the database yourself (`./scripts/queries/list-definition-snapshots.sh`).

### 1. Bumping `version` creates a new snapshot

Starting from the shipped `version: 1`, this change bumps the version **and** changes content (an inert `metadata` addition on the terminal `cancelled` state, purely to prove the hash reacts to content, not just the number):

```diff
-  version: 1,
+  version: 2,
   ...
-    cancelled: {},
+    cancelled: { metadata: { terminal: true } },
```

```bash
npm run build && npm start
```

The app boots normally — a version bump with the guard satisfied is a non-event. `workflow_definitions` now has **two** rows for `ecommerce-order`:

```
  workflow_name  | version |                              content_hash                               |         registered_at
-----------------+---------+-------------------------------------------------------------------------+-------------------------------
 ecommerce-order |       1 | sha256:bd26110cf5ce8df2998c5fbbdb6e5ff8ed8468a904a9c3c7df3af6fea5ab7acf | 2026-08-17 20:57:15.914961-04
 ecommerce-order |       2 | sha256:f8af1d5f207dcc58bda04df235e28afcb9bde7e658602c3fadb4c5d86a4cc0f4 | 2026-08-17 21:13:41.916558-04
(2 rows)
```

Both rows are permanent — even after reverting the code back to `version: 1` (as shipped in this repo) and restarting, the `version: 2` row stays in the table. Snapshots are never deleted; they're an append-only history of every definition shape that was ever live.

### 2. Resolution is unchanged: a live demonstration

This is the walkthrough for the warning at the top of this document. While the app was running with the `version: 2` content above, a new order was created:

```bash
./scripts/create-order.sh   # while version 2 is registered
# → { "uuid": "1ebd8ce5-...", "definitionVersion": 2, "currentState": "pending", ... }
./scripts/events/add-note.sh 1ebd8ce5-bb5e-48f3-8106-74cbf97fe3bb "created under v2"
```

The instance and its `note_added` history row were both stamped `definitionVersion: 2`, as expected. Then, **without touching that instance**, the code was reverted to `version: 1` (the original content), rebuilt, and the app restarted — so `ecommerce-order` was now registered as `version: 1` again. The same instance was then driven forward one more step:

```bash
./scripts/events/process-payment.sh 1ebd8ce5-bb5e-48f3-8106-74cbf97fe3bb
./scripts/queries/get-definition-versions.sh 1ebd8ce5-bb5e-48f3-8106-74cbf97fe3bb
```

Real output:

```json
{
  "uuid": "1ebd8ce5-bb5e-48f3-8106-74cbf97fe3bb",
  "currentState": "payment_processing",
  "definitionVersion": 1
}
```

```json
[
  { "eventName": "note_added",     "fromState": "pending", "toState": "pending",             "outcome": "success", "definitionVersion": 2 },
  { "eventName": "process_payment", "fromState": "pending", "toState": "payment_processing", "outcome": "success", "definitionVersion": 1 }
]
```

The instance's `definitionVersion` flipped from `2` to `1` on its very next transition, with no migration, no explicit "downgrade", nothing — it simply followed whatever was currently registered, exactly like it always has. The two history rows now permanently disagree about which version governed them (`2` then `1`), which is correct: each row is the honest provenance record for *that* transition, not a claim about what the instance is pinned to. Nothing in v5.0.0 stopped `process_payment` from running the `version: 1` logic even though the instance was created and first touched under `version: 2` content.

## The Startup Guard

If a definition's content changes without a matching `version` bump, `WorkflowRuntime.initialize()` — called automatically by `WorkflowRuntimeInitializer` (`OnModuleInit`) — throws `WorkflowDefinitionError` and the app **fails to start**. This is the most vivid part of the feature: it turns a silent, hard-to-notice drift into a boot-time crash.

To reproduce (and this is exactly what was run to capture the output below — edit, build, observe, revert):

1. Edit `order.definition.ts` and change content **without** touching `version` (still `1`):

   ```diff
   -    cancelled: {},
   +    cancelled: { metadata: { terminal: true } },
   ```

2. Build and start:

   ```bash
   npm run build && npm start
   ```

3. Observe. Nest logs every route as "Mapped" (route registration happens before `OnModuleInit`), but the app never reaches "Nest application successfully started" or "Server running on http://localhost:3000" — it crashes first, with exit code `1`:

   ```
   file:///.../node_modules/@duraflows/core/dist/runtime/workflow-runtime.js:122
                   throw new WorkflowDefinitionError(definition.name, `Definition content changed but version ${version} was not bumped ` +
                         ^

   WorkflowDefinitionError: Workflow "ecommerce-order": Definition content changed but version 1 was not bumped (stored sha256:bd26110cf5ce8df2998c5fbbdb6e5ff8ed8468a904a9c3c7df3af6fea5ab7acf, registered sha256:f8af1d5f207dcc58bda04df235e28afcb9bde7e658602c3fadb4c5d86a4cc0f4). Bump the definition's "version" field to publish the change.
       at WorkflowRuntime.syncDefinitions (.../node_modules/@duraflows/core/dist/runtime/workflow-runtime.js:122:23)
       at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
       at async WorkflowRuntimeInitializer.onModuleInit (.../node_modules/@duraflows/nestjs/dist/providers/workflow-runtime-initializer.js:26:9)
       ...
   {
     workflowName: 'ecommerce-order',
     [cause]: undefined
   }

   Node.js v22.22.2
   ```

   The message is genuinely actionable: it names the workflow, states the exact rule that was violated ("version 1 was not bumped"), shows both hashes so you can tell the stored (old) content from the registered (new) content, and tells you exactly what to do ("Bump the definition's `version` field"). The one thing it does *not* tell you is *what changed* — with a large definition you'd need `git diff` or a JSON diff of `definition_json` against the current definition to find the actual delta; the hash mismatch alone doesn't localize it.

4. Fix it — either revert the content change, or bump the version to match it:

   ```diff
   -  version: 1,
   +  version: 2,
   ```

5. Rebuild and restart. The app boots normally again, and (per Walkthrough 1) a second snapshot row appears.

For this repo, step 4 was "revert" — the committed `order.definition.ts` stays at `version: 1` with its original content, matching the `version: 1` snapshot already in the table.

## Running the Demos

| Script | What it shows |
|--------|----------------|
| `scripts/queries/list-definition-snapshots.sh` | Every `(workflow_name, version)` snapshot ever registered — direct `psql` read, no REST equivalent exists |
| `scripts/queries/get-definition-versions.sh <uuid>` | An instance's `definitionVersion` next to every history row's `definitionVersion`, oldest first |

Both reuse the connection/env handling from `scripts/db/create-tables.sh` (for the psql-based one) and `scripts/queries/get-order.sh` / `get-history.sh` (for the REST-based one).

## When To Bump `version`

- **Bump it** whenever you change anything under `states` — add/remove/rename a state or event, change a `targetState`/`errorState`, add/remove a command or guard, change a `timeout`, change state-entry `context` or `metadata`. If you're not sure, bump it; the guard would have caught the omission at your next deploy anyway, so bumping proactively just moves the check from "the app refuses to start in CI/production" to "you already knew."
- **Don't bump it** for changes that don't touch the definition object at all — command *implementation* changes (the TypeScript inside a `WorkflowCommand.execute`), guard implementation changes, observer changes. The content hash only covers the `WorkflowDefinition` JSON (states/events/commands-by-name/timeouts/guards-by-name/metadata), not the code those names resolve to.
- **A first-time build doesn't need to worry about this** — it matters from the second deploy of a given workflow name onward.
- Remember: bumping `version` publishes a new snapshot and unblocks startup. It does **not** pin any instance to the version it was created under — see [Read This First](#read-this-first-versioning-does-not-pin-execution).

## Need To Change In-Flight Behavior, Not Just Publish a New Version?

A `version` bump is right for backward-compatible changes — see above. But because resolution is unchanged (no pinning), a version bump is **not** enough if the change would alter what an already-in-flight instance does next in a way you don't want applied retroactively. For that case, this example app also demonstrates the only real workaround available in 5.0.0: forking the workflow under a **new name**, registering both definitions side by side, and routing new work to the new name while the old name drains naturally. See [docs/side-by-side-versions.md](side-by-side-versions.md) for the full pattern, a live walkthrough, and — importantly — its costs, including the one thing it cannot do: move an in-flight instance from the old name to the new one.
