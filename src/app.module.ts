import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database/database.module.js";
import { OrderModule } from "./workflows/order/order.module.js";

@Module({
  imports: [DatabaseModule, OrderModule],
})
export class AppModule {}
