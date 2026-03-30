# WorkflowHandle -- Programmatic Usage

The REST controllers shown in the other examples are one way to interact with workflows. For programmatic usage within your NestJS services, duraflows provides a `WorkflowHandle` -- a thin proxy that binds a workflow instance UUID and delegates all operations to the runtime.

The handle caches nothing. Every method call hits the persistence layer. It is safe to create, pass around, and discard.

## Example: OrderService using WorkflowHandle

```ts
import { Injectable } from "@nestjs/common";
import { WorkflowService, type WorkflowHandle } from "@duraflows/nestjs";

@Injectable()
export class OrderService {
  constructor(private readonly workflowService: WorkflowService) {}

  async createOrder(orderData: CreateOrderDto) {
    const order = await this.orderRepo.create(orderData);

    const instance = await this.workflowService.createInstance({
      workflowName: "ecommerce-order",
      metadata: { orderId: order.uuid },
    });

    await this.orderRepo.setWorkflowInstanceUuid(order.uuid, instance.uuid);
    return order;
  }

  async processPayment(orderUuid: string) {
    const handle = this.getHandle(orderUuid);
    return handle.triggerEvent("process_payment");
  }

  async completePayment(orderUuid: string) {
    const handle = this.getHandle(orderUuid);
    return handle.triggerEvent("payment_success");
  }

  async shipOrder(orderUuid: string) {
    const handle = this.getHandle(orderUuid);
    return handle.triggerEvent("ship");
  }

  async getOrderStatus(orderUuid: string) {
    const handle = this.getHandle(orderUuid);
    const instance = await handle.getInstance();
    return {
      currentState: instance?.currentState,
      context: instance?.context,
    };
  }

  async getAvailableActions(orderUuid: string) {
    const handle = this.getHandle(orderUuid);
    return handle.getAvailableEvents();
  }

  async getOrderHistory(orderUuid: string) {
    const handle = this.getHandle(orderUuid);
    return handle.getHistory({ limit: 50 });
  }

  private getHandle(orderUuid: string): WorkflowHandle {
    // In a real app, look up the workflow instance UUID from the order
    // For simplicity, assume orderUuid IS the workflow instance UUID
    return this.workflowService.getHandle(orderUuid);
  }
}
```

## Key Points

- **`getHandle()` is synchronous** -- it does not hit the database. It just binds the UUID.
- **No cached state** -- `handle.getInstance()` always returns fresh data.
- **Identity bound once** -- no need to repeat the UUID on every call.
- **Works with both `WorkflowService` (NestJS) and `WorkflowRuntime` (core)**.

## Comparison: Before and After

**Before (UUID-based):**

```ts
const instance = await this.workflowService.getInstance(uuid);
const events = await this.workflowService.getAvailableEvents({ workflowInstanceUuid: uuid });
const result = await this.workflowService.triggerEvent({
  workflowInstanceUuid: uuid,
  eventName: "ship",
});
const history = await this.workflowService.getHistory(uuid);
```

**After (handle-based):**

```ts
const handle = this.workflowService.getHandle(uuid);
const instance = await handle.getInstance();
const events = await handle.getAvailableEvents();
const result = await handle.triggerEvent("ship");
const history = await handle.getHistory();
```
