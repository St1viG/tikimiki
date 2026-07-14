import { Module } from "@nestjs/common";
import { CosmeticsService } from "../common/cosmetics.service";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [SubscriptionsModule],
  controllers: [UsersController],
  providers: [UsersService, CosmeticsService],
  exports: [UsersService],
})
export class UsersModule {}
