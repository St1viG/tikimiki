import { Global, Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

/**
 * NotificationsModule — the caller's notification feed plus the shared
 * {@link NotificationsService.create} chokepoint (insert + live socket push).
 *
 * Marked `@Global()` and exports the service so any feature module (follows,
 * comments, team invites, application decisions, …) can create notifications
 * without importing this module explicitly.
 */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
