import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CosmeticsService } from "../common/cosmetics.service";
import { EngagementController } from "./engagement.controller";
import { EngagementService } from "./engagement.service";

@Module({
  imports: [AuthModule],
  controllers: [EngagementController],
  providers: [EngagementService, CosmeticsService],
  exports: [EngagementService],
})
export class EngagementModule {}
