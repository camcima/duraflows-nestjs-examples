import { Logger } from "@nestjs/common";
import { WorkflowCommand } from "@duraflows/nestjs";
import type {
  WorkflowCommand as WorkflowCommandInterface,
  CommandResult,
  WorkflowExecutionContext,
} from "@duraflows/core";

/**
 * Appends an operator note to the order without changing state.
 *
 * Used by the v1.0.0 command-only event pattern: the `note_added` event in
 * `order.definition.ts` defines no `targetState`, so this command runs as a
 * pure side effect and the workflow stays in its current state. A history
 * record is still appended for the audit trail.
 */
@WorkflowCommand("add-note")
export class AddNoteCommand implements WorkflowCommandInterface {
  private readonly logger = new Logger(AddNoteCommand.name);

  execute(subject: unknown, context: WorkflowExecutionContext): CommandResult {
    const note = (subject as { note?: string } | undefined)?.note ?? "(no body)";
    const author = (context.triggerMetadata.actor as string | undefined) ?? "system";

    const notes = (context.context.notes as Array<{ at: string; author: string; body: string }> | undefined) ?? [];
    notes.push({ at: context.now.toISOString(), author, body: note });
    context.context.notes = notes;

    this.logger.log(`Note added by ${author} while in ${context.toState}: "${note}"`);
    return { ok: true, code: "NOTE_ADDED", metadata: { author, length: note.length } };
  }
}
