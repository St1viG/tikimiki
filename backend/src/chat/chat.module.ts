import { Module } from "@nestjs/common";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

/**
 * ChatModule — channel + direct-message REST endpoints.
 *
 * The Socket.io gateway now lives in the global {@link RealtimeModule}; this
 * module simply injects {@link RealtimeGateway} where it needs to emit.
 */
@Module({
  imports: [SubscriptionsModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
