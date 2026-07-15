import { Inject, Injectable } from "@nestjs/common";
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
import { and, eq, isNull } from "drizzle-orm";
import type { Server, Socket } from "socket.io";
import { activeTeamMember } from "../common/team.predicates";
import { env } from "../config/env";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import {
  administrators,
  channelGroups,
  channels,
  conversationMembers,
  hackathons,
  kanbanBoards,
  serverRoles,
  servers,
  teamMembers,
  teams,
  userRoles,
} from "../db/schema";

/**
 * RealtimeGateway — Socket.io gateway powering live chat.
 *
 * Auth: the client passes its JWT access token in the handshake
 * (`io(url, { auth: { token } })`). On connect we verify it and join the
 * socket to its personal room `user:<id>`. Clients then join channel rooms
 * (`channel:<id>`) / conversation rooms (`conversation:<id>`) to receive live
 * messages. ChatService calls the `emit*` helpers after persisting a message.
 *
 * Every join request is membership-checked (SSU8/9): a socket may only enter
 * rooms of servers/conversations/boards its user actually belongs to.
 * Unauthorized joins are silently ignored — the connection stays up.
 */
@Injectable()
@WebSocketGateway({
  cors: { origin: env.WEB_ORIGIN, credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  /** userId → number of live connections (one user may have several tabs). */
  private readonly online = new Map<string, number>();

  constructor(
    private readonly jwt: JwtService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

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

  /* ── Room membership checks (SSU8/9) ─────────────────────── */

  /**
   * True iff the user may access the server: they hold ANY role on it
   * (user_roles → server_roles) or they are the organizing account of the
   * server's hackathon — the same rule as ChatService.isServerMember.
   */
  private async isServerMember(serverId: string, userId: string): Promise<boolean> {
    const [role] = await this.db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(serverRoles, eq(serverRoles.serverRoleId, userRoles.serverRoleId))
      .where(and(eq(serverRoles.serverId, serverId), eq(userRoles.userId, userId)))
      .limit(1);
    if (role) return true;

    const [own] = await this.db
      .select({ orgId: hackathons.organizationId })
      .from(servers)
      .innerJoin(hackathons, eq(hackathons.hackathonId, servers.hackathonId))
      .where(eq(servers.serverId, serverId))
      .limit(1);
    return own?.orgId === userId;
  }

  /** Owning server of a channel (channels → channel_groups), or null if unknown. */
  private async serverIdForChannel(channelId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ serverId: channelGroups.serverId })
      .from(channels)
      .innerJoin(channelGroups, eq(channelGroups.groupId, channels.groupId))
      .where(eq(channels.channelId, channelId))
      .limit(1);
    return row?.serverId ?? null;
  }

  /** True iff the user is a current (not-left) participant of the conversation. */
  private async isConversationMember(conversationId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, userId),
          isNull(conversationMembers.leftAt),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  /**
   * True iff the user may watch a kanban board: active member of the board's
   * team, the organizing account of the team's hackathon, or a platform
   * admin — the same rule as KanbanService.assertBoardReadAccess.
   */
  private async canAccessBoard(boardId: string, userId: string): Promise<boolean> {
    const [board] = await this.db
      .select({ teamId: kanbanBoards.teamId })
      .from(kanbanBoards)
      .where(eq(kanbanBoards.boardId, boardId))
      .limit(1);
    if (!board) return false;

    const [member] = await this.db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamId, board.teamId), eq(teamMembers.userId, userId), activeTeamMember),
      )
      .limit(1);
    if (member) return true;

    const [org] = await this.db
      .select({ organizationId: hackathons.organizationId })
      .from(teams)
      .innerJoin(hackathons, eq(hackathons.hackathonId, teams.hackathonId))
      .where(eq(teams.teamId, board.teamId))
      .limit(1);
    if (org?.organizationId === userId) return true;

    const [admin] = await this.db
      .select({ userId: administrators.userId })
      .from(administrators)
      .where(eq(administrators.userId, userId))
      .limit(1);
    return Boolean(admin);
  }

  /* ── Room join/leave handlers ─────────────────────────────── */

  @SubscribeMessage("joinChannel")
  async joinChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() channelId: string,
  ): Promise<void> {
    const userId = client.data.userId as string | undefined;
    if (typeof channelId !== "string" || !userId) return;
    const serverId = await this.serverIdForChannel(channelId);
    if (!serverId || !(await this.isServerMember(serverId, userId))) return;
    await client.join(`channel:${channelId}`);
  }

  @SubscribeMessage("leaveChannel")
  leaveChannel(@ConnectedSocket() client: Socket, @MessageBody() channelId: string): void {
    if (typeof channelId === "string") void client.leave(`channel:${channelId}`);
  }

  @SubscribeMessage("joinServer")
  async joinServer(
    @ConnectedSocket() client: Socket,
    @MessageBody() serverId: string,
  ): Promise<void> {
    const userId = client.data.userId as string | undefined;
    if (typeof serverId !== "string" || !userId) return;
    if (!(await this.isServerMember(serverId, userId))) return;
    await client.join(`server:${serverId}`);
  }

  @SubscribeMessage("leaveServer")
  leaveServer(@ConnectedSocket() client: Socket, @MessageBody() serverId: string): void {
    if (typeof serverId === "string") void client.leave(`server:${serverId}`);
  }

  @SubscribeMessage("joinConversation")
  async joinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: string,
  ): Promise<void> {
    const userId = client.data.userId as string | undefined;
    if (typeof conversationId !== "string" || !userId) return;
    if (!(await this.isConversationMember(conversationId, userId))) return;
    await client.join(`conversation:${conversationId}`);
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
  async joinKanban(
    @ConnectedSocket() client: Socket,
    @MessageBody() boardId: string,
  ): Promise<void> {
    const userId = client.data.userId as string | undefined;
    if (typeof boardId !== "string" || !userId) return;
    if (!(await this.canAccessBoard(boardId, userId))) return;
    await client.join(`board:${boardId}`);
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
