import { Global, Module } from "@nestjs/common";
import { RealtimeGateway } from "./realtime.gateway";

/**
 * RealtimeModule — exposes the single {@link RealtimeGateway} application-wide.
 *
 * Marked `@Global()` so any feature service (chat, notifications, teams, …) can
 * inject the gateway to push live socket events without each module importing
 * this one. There is exactly ONE gateway instance (the one Socket.io binds to),
 * which is why the gateway is provided here and nowhere else.
 */
@Global()
@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
