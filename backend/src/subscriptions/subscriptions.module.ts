import { Module } from "@nestjs/common";
import { SubscriptionsExpiryScheduler } from "./subscriptions-expiry.scheduler";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";

@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionsExpiryScheduler],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
