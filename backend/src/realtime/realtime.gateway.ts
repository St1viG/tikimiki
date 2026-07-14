import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { env } from "../config/env";

/**
 * RealtimeGateway — Socket.io gateway powering live chat.
 *
 * Auth: the client passes its JWT access token in the handshake
 * (`io(url, { auth: { token } })`). On connect we verify it and join the
 * socket to its personal room `user:<id>`. Clients then join channel rooms
 * (`channel:<id>`) / conversation rooms (`conversation:<id>`) to receive live
 * messages. ChatService calls the `emit*` helpers after persisting a message.
 */
@Injectable()
@WebSocketGateway({
  cors: { origin: env.WEB_ORIGIN, credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  /** userId → number of live connections (one user may have several tabs). */
  private readonly online = new Map<string, number>();

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket): Promise<void> {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      client.handshake.headers.authorization?.replace("Bearer ", "") ??
      undefined;
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; typ: string }>(token, {
        secret: env.JWT_ACCESS_SECRET,
      });
      // Reject refresh tokens if one is accidentally sent during handshake.
      if (payload.typ !== "access") throw new Error("wrong token type");
      const userId = payload.sub;
      client.data.userId = userId;
      await client.join(`user:${userId}`);
      this.online.set(userId, (this.online.get(userId) ?? 0) + 1);
      this.broadcastPresence();
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;
    const next = (this.online.get(userId) ?? 1) - 1;
    if (next <= 0) this.online.delete(userId);
    else this.online.set(userId, next);
    this.broadcastPresence();
  }

  /** Emit the full set of currently-online user ids to everyone. */
  private broadcastPresence(): void {
    this.server?.emit("presence", { online: [...this.online.keys()] });
  }

  /** Client requests the current presence snapshot (e.g. after registering
   *  its listener, which may have missed the initial connect broadcast). */
  @SubscribeMessage("getPresence")
  getPresence(@ConnectedSocket() client: Socket): void {
    client.emit("presence", { online: [...this.online.keys()] });
  }

  @SubscribeMessage("joinChannel")
  joinChannel(@ConnectedSocket() client: Socket, @MessageBody() channelId: string): void {
    if (typeof channelId === "string") void client.join(`channel:${channelId}`);
  }

  @SubscribeMessage("leaveChannel")
  leaveChannel(@ConnectedSocket() client: Socket, @MessageBody() channelId: string): void {
    if (typeof channelId === "string") void client.leave(`channel:${channelId}`);
  }

  @SubscribeMessage("joinServer")
  joinServer(@ConnectedSocket() client: Socket, @MessageBody() serverId: string): void {
    if (typeof serverId === "string") void client.join(`server:${serverId}`);
  }

  @SubscribeMessage("leaveServer")
  leaveServer(@ConnectedSocket() client: Socket, @MessageBody() serverId: string): void {
    if (typeof serverId === "string") void client.leave(`server:${serverId}`);
  }

  @SubscribeMessage("joinConversation")
  joinConversation(@ConnectedSocket() client: Socket, @MessageBody() conversationId: string): void {
    if (typeof conversationId === "string") void client.join(`conversation:${conversationId}`);
  }

  @SubscribeMessage("leaveConversation")
  leaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: string,
  ): void {
    if (typeof conversationId === "string") void client.leave(`conversation:${conversationId}`);
  }

  /** A user is typing in a channel — relay to others in that channel. */
  @SubscribeMessage("typing")
  typing(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { channelId: string; username: string },
  ): void {
    if (!payload || typeof payload.channelId !== "string") return;
    client.to(`channel:${payload.channelId}`).emit("userTyping", {
      channelId: payload.channelId,
      username: payload.username,
    });
  }

  /* ── Emit helpers (called by ChatService after persisting) ── */

  // Optional chaining guards against the brief window before the WebSocket
  // server is initialized (e.g. during unit tests or early-startup calls).
  emitChannelMessage(channelId: string, message: unknown): void {
    this.server?.to(`channel:${channelId}`).emit("channelMessage", message);
  }

  emitDirectMessage(conversationId: string, message: unknown): void {
    this.server?.to(`conversation:${conversationId}`).emit("directMessage", message);
  }

  emitNotification(userId: string, notification: unknown): void {
    this.server?.to(`user:${userId}`).emit("notification", notification);
  }

  emitChannelReaction(channelId: string, payload: unknown): void {
    this.server?.to(`channel:${channelId}`).emit("messageReaction", payload);
  }

  emitConversationReaction(conversationId: string, payload: unknown): void {
    this.server?.to(`conversation:${conversationId}`).emit("messageReaction", payload);
  }

  emitChannelMessageEdited(channelId: string, payload: unknown): void {
    this.server?.to(`channel:${channelId}`).emit("messageEdited", payload);
  }

  emitConversationMessageEdited(conversationId: string, payload: unknown): void {
    this.server?.to(`conversation:${conversationId}`).emit("messageEdited", payload);
  }

  /**
   * Generic server-room broadcast for moderation/structure events
   * (`channelCreated`, `channelUpdated`, `channelDeleted`, `serverUpdated`,
   * `rolesChanged`). Payloads are minimal (ids); clients refetch.
   */
  emitServerEvent(serverId: string, event: string, payload: unknown): void {
    this.server?.to(`server:${serverId}`).emit(event, payload);
  }

  /** A channel message was soft-deleted — tell the channel room to drop it. */
  emitChannelMessageDeleted(channelId: string, payload: unknown): void {
    this.server?.to(`channel:${channelId}`).emit("messageDeleted", payload);
  }

  /**
   * Generic channel-room broadcast for pin/ACL events
   * (`messagePinned`, `messageUnpinned`, `channelMemberAdded`,
   * `channelMemberRemoved`). Clients refetch on receipt.
   */
  emitChannelEvent(channelId: string, event: string, payload: unknown): void {
    this.server?.to(`channel:${channelId}`).emit(event, payload);
  }

  /** A direct message was soft-deleted — tell the conversation room. */
  emitConversationMessageDeleted(conversationId: string, payload: unknown): void {
    this.server?.to(`conversation:${conversationId}`).emit("messageDeleted", payload);
  }

  @SubscribeMessage("joinKanban")
  joinKanban(@ConnectedSocket() client: Socket, @MessageBody() boardId: string): void {
    if (typeof boardId === "string") void client.join(`board:${boardId}`);
  }

  @SubscribeMessage("leaveKanban")
  leaveKanban(@ConnectedSocket() client: Socket, @MessageBody() boardId: string): void {
    if (typeof boardId === "string") void client.leave(`board:${boardId}`);
  }

  /** Broadcast a kanban board change to everyone in `board:{boardId}` room. */
  emitKanbanUpdate(boardId: string, payload: unknown): void {
    this.server?.to(`board:${boardId}`).emit("kanban:update", payload);
  }
}
