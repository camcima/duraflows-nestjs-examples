import { Logger } from "@nestjs/common";
import { WorkflowCommand } from "@duraflows/nestjs";
import type {
  WorkflowCommand as WorkflowCommandInterface,
  CommandResult,
  WorkflowExecutionContext,
} from "@duraflows/core";

@WorkflowCommand("allocate-inventory")
export class AllocateInventoryCommand implements WorkflowCommandInterface {
  private readonly logger = new Logger(AllocateInventoryCommand.name);

  execute(_subject: unknown, context: WorkflowExecutionContext): CommandResult {
    const items = context.context.items as { sku: string; qty: number }[];
    this.logger.log(`Inventory allocated for ${items.length} item(s): ${items.map((i) => `${i.sku} x${i.qty}`).join(", ")}`);
    context.context.inventoryAllocatedAt = context.now.toISOString();
    return { ok: true, code: "INVENTORY_ALLOCATED" };
  }
}
