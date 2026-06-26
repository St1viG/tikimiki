import { Module } from "@nestjs/common";
import { ModerationController } from "./moderation.controller";
import { ModerationService } from "./moderation.service";

/**
 * ModerationModule — server roles + permission catalog.
 *
 * AuthzService (global) and RealtimeGateway (global) are injected for the
 * permission checks and `rolesChanged` broadcasts respectively. The service's
 * onModuleInit bootstraps the canonical permission catalog.
 */
@Module({
  controllers: [ModerationController],
  providers: [ModerationService],
})
export class ModerationModule {}
