import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { AuthzService } from "../common/authz.service";
import { CosmeticsService, type EquippedCosmeticDto } from "../common/cosmetics.service";
import { activeTeamMember } from "../common/team.predicates";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { NotificationsService } from "../notifications/notifications.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import {
  channelGroups,
  channelMembers,
  channelMessages,
  channelPins,
  channels,
  conversationMembers,
  conversations,
  directMessages,
  hackathons,
  messageAttachments,
  messageReactions,
  messages,
  notifications,
  organizations,
  serverMutes,
  serverRoles,
  servers,
  teamMembers,
  teams,
  userRoles,
  users,
} from "../db/schema";

/* ── Response types (local) ───────────────────────────────── */

export interface ServerDto {
  serverId: string;
  hackathonId: string;
  hackathonTitle: string;
  name: string;
  logoUrl: string | null;
}

export interface ServerChannelDto {
  channelId: string;
  name: string;
  type: string;
  position: number;
}

export interface ServerGroupDto {
  groupId: string;
  name: string;
  position: number;
  channels: ServerChannelDto[];
}

export interface ServerDetailDto {
  serverId: string;
  name: string;
  groups: ServerGroupDto[];
}

/** One emoji's tally on a message, plus whether the viewer added it. */
export interface ReactionGroup {
  symbol: string;
  count: number;
  mine: boolean;
}

/** A server member with their server roles + hackathon team. */
export interface ServerMemberDto {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  roles: string[];
  teamName: string | null;
  /** True when the member is the organizer OR holds a role with ≥1 permission. */
  isModerator: boolean;
  /** True when the member currently holds an active Premium subscription. */
  isPremium: boolean;
  /** Equipped username effect (e.g. neon name), null when none. */
  usernameEffect: EquippedCosmeticDto | null;
  /** Equipped profile decoration (banner/avatar frame), null when none. */
  profileDecoration: EquippedCosmeticDto | null;
}

/** Server summary returned after an update. */
export interface ServerSummaryDto {
  serverId: string;
  hackathonId: string;
  name: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  updatedAt: string;
}

export interface MessageAttachmentDto {
  url: string;
  type: "image" | "video";
  filename: string | null;
}

export interface MessageDto {
  messageId: string;
  channelId: string | null;
  conversationId: string | null;
  senderId: string;
  senderUsername: string;
  senderDisplayName: string | null;
  senderAvatarUrl: string | null;
  content: string;
  sentAt: string;
  editedAt: string | null;
  replyToId: string | null;
  reactionCount: number;
  /** Per-emoji breakdown (empty when the message has no reactions). */
  reactions: ReactionGroup[];
  /** Image/video attachments, ordered (empty when none). */
  attachments: MessageAttachmentDto[];
}

/** Map a stored attachment URL to image/video by extension. */
const MESSAGE_VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg|ogv)$/i;
function messageMediaType(url: string): "image" | "video" {
  return MESSAGE_VIDEO_EXT.test(url) ? "video" : "image";
}

export interface ToggleReactionResult {
  reacted: boolean;
  symbol: string;
  /** Count for THIS symbol after the toggle (0 means it was removed). */
  count: number;
}

export interface ConversationMemberDto {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  /** True when the member currently holds an active Premium subscription. */
  isPremium: boolean;
  /** Equipped username effect (e.g. neon name), null when none. */
  usernameEffect: EquippedCosmeticDto | null;
  /** Equipped profile decoration (banner/avatar frame), null when none. */
  profileDecoration: EquippedCosmeticDto | null;
}

export interface ConversationLastMessageDto {
  content: string;
  sentAt: string;
  senderUsername: string;
  senderDisplayName: string | null;
}

export interface ConversationDto {
  conversationId: string;
  name: string | null;
  icon: string | null;
  createdAt: string;
  members: ConversationMemberDto[];
  lastMessage: ConversationLastMessageDto | null;
  unreadCount: number;
}

export interface ServerMuteDto {
  muteId: string;
  mutedUserId: string;
  mutedUsername: string;
  mutedDisplayName: string | null;
  mutedBy: string | null;
  mutedAt: string;
  expiresAt: string | null;
  reason: string | null;
}

export interface ChannelMemberDto {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  addedAt: string;
  addedBy: string | null;
}

/* ── Row helpers ──────────────────────────────────────────── */

interface ChannelMessageRow {
  messageId: string;
  channelId: string;
  senderId: string;
  senderUsername: string;
  senderDisplayName: string | null;
  senderAvatarUrl: string | null;
  content: string;
  sentAt: Date;
  editedAt: Date | null;
  replyToId: string | null;
  reactionCount: number;
}

interface DirectMessageRow {
  messageId: string;
  conversationId: string;
  senderId: string;
  senderUsername: string;
  senderDisplayName: string | null;
  senderAvatarUrl: string | null;
  content: string;
  sentAt: Date;
  editedAt: Date | null;
  replyToId: string | null;
  reactionCount: number;
}

@Injectable()
export class ChatService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly realtime: RealtimeGateway,
    private readonly authz: AuthzService,
    private readonly notifications: NotificationsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly cosmetics: CosmeticsService,
  ) {}

  /**
   * User ids that can access a channel's server (role holders + the organizing
   * account) — used to scope @-mention pings to actual server members.
   */
  private async serverMemberIds(channelId: string): Promise<string[]> {
    const serverId = await this.authz.serverIdForChannel(channelId);
    const roleRows = await this.db
      .selectDistinct({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(serverRoles, eq(serverRoles.serverRoleId, userRoles.serverRoleId))
      .where(eq(serverRoles.serverId, serverId));
    const [org] = await this.db
      .select({ orgId: hackathons.organizationId })
      .from(servers)
      .innerJoin(hackathons, eq(hackathons.hackathonId, servers.hackathonId))
      .where(eq(servers.serverId, serverId))
      .limit(1);
    const ids = roleRows.map((r) => r.userId);
    if (org?.orgId) ids.push(org.orgId);
    return ids;
  }

  /* ── Servers ────────────────────────────────────────────── */

  /* ── Membership (role-based access, decoupled from applications) ── */

  /**
   * A user may access a server if they hold ANY role in it (server_roles +
   * user_roles), or they are the organizing account of the server's hackathon.
   * Membership is NOT derived from application status — it is an explicit role
   * grant (see {@link grantServerMembership}).
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

  private async assertServerMember(serverId: string, userId: string): Promise<void> {
    if (!(await this.isServerMember(serverId, userId))) {
      throw new ForbiddenException("You are not a member of this server");
    }
  }

  /**
   * Assert the user can access a channel.
   * - Channel must exist and not be deleted.
   * - User must be a server member.
   * - For `private` channels: user must be in `channel_members`, or hold
   *   `manage_channels` (moderators/organizers always have access).
   *
   * Returns `{ serverId, type }` so callers avoid a second channel query.
   */
  private async assertChannelAccess(
    channelId: string,
    userId: string,
  ): Promise<{ serverId: string; type: string }> {
    const [row] = await this.db
      .select({
        serverId: channelGroups.serverId,
        type: channels.type,
        deletedAt: channels.deletedAt,
      })
      .from(channels)
      .innerJoin(channelGroups, eq(channelGroups.groupId, channels.groupId))
      .where(eq(channels.channelId, channelId))
      .limit(1);
    if (!row || row.deletedAt) throw new NotFoundException("Channel not found");

    await this.assertServerMember(row.serverId, userId);

    if (row.type === "private") {
      const [membership] = await this.db
        .select({ userId: channelMembers.userId })
        .from(channelMembers)
        .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)))
        .limit(1);
      if (!membership) {
        const perms = await this.authz.getServerPermissions(row.serverId, userId);
        if (!perms.has("manage_channels")) {
          throw new ForbiddenException("You are not a member of this channel");
        }
      }
    }

    return { serverId: row.serverId, type: row.type };
  }

  async listServers(userId: string): Promise<ServerDto[]> {
    // Servers where the user holds a role …
    const roleServers = await this.db
      .selectDistinct({ serverId: serverRoles.serverId })
      .from(userRoles)
      .innerJoin(serverRoles, eq(serverRoles.serverRoleId, userRoles.serverRoleId))
      .where(eq(userRoles.userId, userId));
    // … plus servers whose hackathon they organize.
    const orgServers = await this.db
      .select({ serverId: servers.serverId })
      .from(servers)
      .innerJoin(hackathons, eq(hackathons.hackathonId, servers.hackathonId))
      .where(eq(hackathons.organizationId, userId));

    const ids = [
      ...new Set([...roleServers.map((r) => r.serverId), ...orgServers.map((r) => r.serverId)]),
    ];
    if (ids.length === 0) return [];

    const rows = await this.db
      .select({
        serverId: servers.serverId,
        hackathonId: servers.hackathonId,
        hackathonTitle: hackathons.title,
        name: servers.name,
        logoUrl: servers.logoUrl,
      })
      .from(servers)
      .innerJoin(hackathons, eq(servers.hackathonId, hackathons.hackathonId))
      .where(inArray(servers.serverId, ids))
      .orderBy(asc(servers.name));
    return rows.map((r) => ({
      serverId: r.serverId,
      hackathonId: r.hackathonId,
      hackathonTitle: r.hackathonTitle,
      name: r.name,
      logoUrl: r.logoUrl,
    }));
  }

  /**
   * Server members with their server roles + hackathon team — feeds the
   * Discord-style profile popout. Includes everyone holding a role plus the
   * organizing account (labelled "Organizer").
   */
  async listServerMembers(serverId: string, userId: string): Promise<ServerMemberDto[]> {
    await this.assertServerMember(serverId, userId);

    const [srv] = await this.db
      .select({
        hackathonId: servers.hackathonId,
        orgId: hackathons.organizationId,
      })
      .from(servers)
      .innerJoin(hackathons, eq(hackathons.hackathonId, servers.hackathonId))
      .where(eq(servers.serverId, serverId))
      .limit(1);
    if (!srv) return [];

    // Members + each of their role names in this server. `roleHasPerm` flags a
    // role that carries at least one permission (→ marks the holder a moderator).
    const roleRows = await this.db
      .select({
        userId: users.userId,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        bannerUrl: users.bannerUrl,
        roleName: serverRoles.name,
        roleHasPerm: sql<boolean>`exists (
          select 1 from server_role_permissions srp
          where srp.server_role_id = ${serverRoles.serverRoleId}
        )`,
      })
      .from(userRoles)
      .innerJoin(serverRoles, eq(serverRoles.serverRoleId, userRoles.serverRoleId))
      .innerJoin(users, eq(users.userId, userRoles.userId))
      .where(eq(serverRoles.serverId, serverId));

    const byUser = new Map<string, ServerMemberDto>();
    for (const r of roleRows) {
      const entry: ServerMemberDto = byUser.get(r.userId) ?? {
        userId: r.userId,
        username: r.username,
        displayName: r.displayName,
        avatarUrl: r.avatarUrl,
        bannerUrl: r.bannerUrl,
        roles: [],
        teamName: null,
        isModerator: false,
        isPremium: false,
        usernameEffect: null,
        profileDecoration: null,
      };
      entry.roles.push(r.roleName);
      if (r.roleHasPerm) entry.isModerator = true;
      byUser.set(r.userId, entry);
    }

    // The organizing account is an implicit member (no user_roles row).
    if (srv.orgId && !byUser.has(srv.orgId)) {
      const [org] = await this.db
        .select({
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          bannerUrl: users.bannerUrl,
        })
        .from(users)
        .where(eq(users.userId, srv.orgId))
        .limit(1);
      if (org) {
        byUser.set(srv.orgId, {
          userId: srv.orgId,
          username: org.username,
          displayName: org.displayName,
          avatarUrl: org.avatarUrl,
          bannerUrl: org.bannerUrl,
          roles: ["Organizer"],
          teamName: null,
          isModerator: true,
          isPremium: false,
          usernameEffect: null,
          profileDecoration: null,
        });
      }
    }

    // Each member's team in this hackathon.
    const memberIds = [...byUser.keys()];
    if (memberIds.length > 0) {
      const teamRows = await this.db
        .select({ userId: teamMembers.userId, teamName: teams.name })
        .from(teamMembers)
        .innerJoin(teams, eq(teams.teamId, teamMembers.teamId))
        .where(
          and(
            inArray(teamMembers.userId, memberIds),
            eq(teams.hackathonId, srv.hackathonId),
            activeTeamMember,
            isNull(teams.deletedAt),
          ),
        );
      for (const t of teamRows) {
        const e = byUser.get(t.userId);
        if (e) e.teamName = t.teamName;
      }

      const [premium, equippedMap] = await Promise.all([
        this.subscriptions.premiumUserIds(memberIds),
        this.cosmetics.equippedForUsers(memberIds),
      ]);
      for (const id of premium) {
        const e = byUser.get(id);
        if (e) e.isPremium = true;
      }
      for (const [id, equipped] of equippedMap) {
        const e = byUser.get(id);
        if (e) {
          e.usernameEffect = equipped.usernameEffect;
          e.profileDecoration = equipped.profileDecoration;
        }
      }
    }

    return [...byUser.values()];
  }

  /** Attach `isPremium` + equipped cosmetics to conversation-member rows with batch queries. */
  private async withPremium(
    rows: {
      userId: string;
      username: string;
      displayName: string | null;
      avatarUrl: string | null;
      bannerUrl: string | null;
    }[],
  ): Promise<ConversationMemberDto[]> {
    const ids = [...new Set(rows.map((r) => r.userId))];
    const [premium, equippedMap] = await Promise.all([
      this.subscriptions.premiumUserIds(ids),
      this.cosmetics.equippedForUsers(ids),
    ]);
    return rows.map((r) => ({
      userId: r.userId,
      username: r.username,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      bannerUrl: r.bannerUrl,
      isPremium: premium.has(r.userId),
      usernameEffect: equippedMap.get(r.userId)?.usernameEffect ?? null,
      profileDecoration: equippedMap.get(r.userId)?.profileDecoration ?? null,
    }));
  }

  async getServerDetail(serverId: string, userId: string): Promise<ServerDetailDto> {
    await this.assertServerMember(serverId, userId);
    const [server] = await this.db
      .select({ serverId: servers.serverId, name: servers.name })
      .from(servers)
      .where(eq(servers.serverId, serverId))
      .limit(1);
    if (!server) throw new NotFoundException("Server not found");

    const groupRows = await this.db
      .select({
        groupId: channelGroups.groupId,
        name: channelGroups.name,
        position: channelGroups.position,
      })
      .from(channelGroups)
      .where(eq(channelGroups.serverId, serverId))
      .orderBy(asc(channelGroups.position));

    const groupIds = groupRows.map((g) => g.groupId);
    const channelRows = groupIds.length
      ? await this.db
          .select({
            channelId: channels.channelId,
            groupId: channels.groupId,
            name: channels.name,
            type: channels.type,
            position: channels.position,
          })
          .from(channels)
          .where(and(inArray(channels.groupId, groupIds), isNull(channels.deletedAt)))
          .orderBy(asc(channels.position))
      : [];

    const channelsByGroup = new Map<string, ServerChannelDto[]>();
    for (const c of channelRows) {
      const list = channelsByGroup.get(c.groupId) ?? [];
      list.push({
        channelId: c.channelId,
        name: c.name,
        type: c.type,
        position: c.position,
      });
      channelsByGroup.set(c.groupId, list);
    }

    return {
      serverId: server.serverId,
      name: server.name,
      groups: groupRows.map((g) => ({
        groupId: g.groupId,
        name: g.name,
        position: g.position,
        channels: channelsByGroup.get(g.groupId) ?? [],
      })),
    };
  }

  /* ── Server / channel moderation ────────────────────────── */

  /** Edit a server's settings (requires `manage_server`). */
  async updateServer(
    serverId: string,
    userId: string,
    input: { name?: string; logoUrl?: string | null; bannerUrl?: string | null },
  ): Promise<ServerSummaryDto> {
    await this.authz.assertServerPermission(serverId, userId, "manage_server");

    const patch: {
      name?: string;
      logoUrl?: string | null;
      bannerUrl?: string | null;
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.logoUrl !== undefined) patch.logoUrl = input.logoUrl;
    if (input.bannerUrl !== undefined) patch.bannerUrl = input.bannerUrl;

    const [updated] = await this.db
      .update(servers)
      .set(patch)
      .where(eq(servers.serverId, serverId))
      .returning({
        serverId: servers.serverId,
        hackathonId: servers.hackathonId,
        name: servers.name,
        logoUrl: servers.logoUrl,
        bannerUrl: servers.bannerUrl,
        updatedAt: servers.updatedAt,
      });
    if (!updated) throw new NotFoundException("Server not found");

    const summary: ServerSummaryDto = {
      serverId: updated.serverId,
      hackathonId: updated.hackathonId,
      name: updated.name,
      logoUrl: updated.logoUrl,
      bannerUrl: updated.bannerUrl,
      updatedAt: updated.updatedAt.toISOString(),
    };
    this.realtime.emitServerEvent(serverId, "serverUpdated", {
      serverId,
    });
    return summary;
  }

  /** Create a channel group (requires `manage_channels`). */
  async createGroup(serverId: string, userId: string, name: string): Promise<ServerGroupDto> {
    await this.authz.assertServerPermission(serverId, userId, "manage_channels");

    const [{ maxPos }] = await this.db
      .select({
        maxPos: sql<number>`coalesce(max(${channelGroups.position}), -1)`,
      })
      .from(channelGroups)
      .where(eq(channelGroups.serverId, serverId));
    const position = Number(maxPos) + 1;

    let group;
    try {
      [group] = await this.db.insert(channelGroups).values({ serverId, name, position }).returning({
        groupId: channelGroups.groupId,
        name: channelGroups.name,
        position: channelGroups.position,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException("A channel group with that name already exists");
      }
      throw err;
    }

    this.realtime.emitServerEvent(serverId, "channelCreated", {
      serverId,
      groupId: group.groupId,
    });
    return {
      groupId: group.groupId,
      name: group.name,
      position: group.position,
      channels: [],
    };
  }

  /** Create a channel in a group (requires `manage_channels`). */
  async createChannel(
    serverId: string,
    userId: string,
    input: { groupId: string; name: string; type?: string },
  ): Promise<ServerChannelDto> {
    await this.authz.assertServerPermission(serverId, userId, "manage_channels");

    // Group must belong to this server.
    const [group] = await this.db
      .select({ groupId: channelGroups.groupId })
      .from(channelGroups)
      .where(and(eq(channelGroups.groupId, input.groupId), eq(channelGroups.serverId, serverId)))
      .limit(1);
    if (!group) {
      throw new NotFoundException("Channel group not found on this server");
    }

    const type = input.type ?? "general";
    if (type === "team") {
      throw new BadRequestException("Team channels cannot be created through this endpoint");
    }

    const [{ maxPos }] = await this.db
      .select({
        maxPos: sql<number>`coalesce(max(${channels.position}), -1)`,
      })
      .from(channels)
      .where(and(eq(channels.groupId, input.groupId), isNull(channels.deletedAt)));
    const position = Number(maxPos) + 1;

    let channel;
    try {
      [channel] = await this.db
        .insert(channels)
        .values({
          groupId: input.groupId,
          type: type as "general" | "announcements" | "private" | "project" | "kanban",
          name: input.name,
          position,
        })
        .returning({
          channelId: channels.channelId,
          name: channels.name,
          type: channels.type,
          position: channels.position,
        });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException("A channel with that name already exists in this group");
      }
      throw err;
    }

    this.realtime.emitServerEvent(serverId, "channelCreated", {
      serverId,
      groupId: input.groupId,
      channelId: channel.channelId,
    });
    return {
      channelId: channel.channelId,
      name: channel.name,
      type: channel.type,
      position: channel.position,
    };
  }

  /** Rename a channel (requires `manage_channels` on the owning server). */
  async updateChannel(channelId: string, userId: string, name: string): Promise<ServerChannelDto> {
    const serverId = await this.authz.serverIdForChannel(channelId);
    await this.authz.assertServerPermission(serverId, userId, "manage_channels");

    const [existing] = await this.db
      .select({ channelId: channels.channelId })
      .from(channels)
      .where(and(eq(channels.channelId, channelId), isNull(channels.deletedAt)))
      .limit(1);
    if (!existing) throw new NotFoundException("Channel not found");

    let updated;
    try {
      [updated] = await this.db
        .update(channels)
        .set({ name, updatedAt: new Date() })
        .where(eq(channels.channelId, channelId))
        .returning({
          channelId: channels.channelId,
          name: channels.name,
          type: channels.type,
          position: channels.position,
        });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException("A channel with that name already exists in this group");
      }
      throw err;
    }

    this.realtime.emitServerEvent(serverId, "channelUpdated", {
      serverId,
      channelId,
    });
    return {
      channelId: updated.channelId,
      name: updated.name,
      type: updated.type,
      position: updated.position,
    };
  }

  /** Soft-delete a channel (requires `manage_channels`). */
  async deleteChannel(channelId: string, userId: string): Promise<{ success: true }> {
    const serverId = await this.authz.serverIdForChannel(channelId);
    await this.authz.assertServerPermission(serverId, userId, "manage_channels");

    const [existing] = await this.db
      .select({ channelId: channels.channelId })
      .from(channels)
      .where(and(eq(channels.channelId, channelId), isNull(channels.deletedAt)))
      .limit(1);
    if (!existing) throw new NotFoundException("Channel not found");

    await this.db
      .update(channels)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(channels.channelId, channelId));

    this.realtime.emitServerEvent(serverId, "channelDeleted", {
      serverId,
      channelId,
    });
    return { success: true };
  }

  /* ── Pinned messages ────────────────────────────────────────── */

  async listChannelPins(channelId: string, userId: string): Promise<MessageDto[]> {
    await this.assertChannelAccess(channelId, userId);
    const rows = await this.db
      .select({
        messageId: messages.messageId,
        channelId: channelMessages.channelId,
        senderId: messages.senderId,
        senderUsername: users.username,
        senderDisplayName: users.displayName,
        senderAvatarUrl: users.avatarUrl,
        content: messages.content,
        sentAt: messages.sentAt,
        editedAt: messages.editedAt,
        replyToId: messages.replyToId,
        reactionCount: sql<number>`(
          select count(*)::int from message_reactions mr
          where mr.message_id = ${messages.messageId}
        )`,
      })
      .from(channelPins)
      .innerJoin(messages, eq(channelPins.messageId, messages.messageId))
      .innerJoin(channelMessages, eq(channelMessages.messageId, messages.messageId))
      .innerJoin(users, eq(messages.senderId, users.userId))
      .where(and(eq(channelPins.channelId, channelId), isNull(messages.deletedAt)))
      .orderBy(desc(channelPins.pinnedAt));
    const ids = rows.map((r) => r.messageId);
    const reactionsByMsg = await this.loadReactions(ids, userId);
    const attachmentsByMsg = await this.loadAttachments(ids);
    return rows.map((r) =>
      this.toChannelMessageDto(
        r,
        reactionsByMsg.get(r.messageId) ?? [],
        attachmentsByMsg.get(r.messageId) ?? [],
      ),
    );
  }

  async pinMessage(
    channelId: string,
    messageId: string,
    userId: string,
  ): Promise<{ success: true }> {
    const serverId = await this.authz.serverIdForChannel(channelId);
    await this.authz.assertServerPermission(serverId, userId, "manage_messages");

    const [msg] = await this.db
      .select({ messageId: channelMessages.messageId })
      .from(channelMessages)
      .innerJoin(messages, eq(messages.messageId, channelMessages.messageId))
      .where(
        and(
          eq(channelMessages.channelId, channelId),
          eq(channelMessages.messageId, messageId),
          isNull(messages.deletedAt),
        ),
      )
      .limit(1);
    if (!msg) throw new NotFoundException("Message not found in this channel");

    try {
      await this.db.insert(channelPins).values({ channelId, messageId, pinnedBy: userId });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException("Message already pinned");
      throw err;
    }

    this.realtime.emitChannelEvent(channelId, "messagePinned", {
      channelId,
      messageId,
    });
    return { success: true };
  }

  async unpinMessage(
    channelId: string,
    messageId: string,
    userId: string,
  ): Promise<{ success: true }> {
    const serverId = await this.authz.serverIdForChannel(channelId);
    await this.authz.assertServerPermission(serverId, userId, "manage_messages");

    const result = await this.db
      .delete(channelPins)
      .where(and(eq(channelPins.channelId, channelId), eq(channelPins.messageId, messageId)))
      .returning({ messageId: channelPins.messageId });
    if (result.length === 0) throw new NotFoundException("Pin not found");

    this.realtime.emitChannelEvent(channelId, "messageUnpinned", {
      channelId,
      messageId,
    });
    return { success: true };
  }

  /* ── Server mutes ───────────────────────────────────────────── */

  async listServerMutes(serverId: string, userId: string): Promise<ServerMuteDto[]> {
    await this.authz.assertServerPermission(serverId, userId, "manage_messages");
    const rows = await this.db
      .select({
        muteId: serverMutes.muteId,
        mutedUserId: serverMutes.mutedUserId,
        mutedUsername: users.username,
        mutedDisplayName: users.displayName,
        mutedBy: serverMutes.mutedBy,
        mutedAt: serverMutes.mutedAt,
        expiresAt: serverMutes.expiresAt,
        reason: serverMutes.reason,
      })
      .from(serverMutes)
      .innerJoin(users, eq(users.userId, serverMutes.mutedUserId))
      .where(eq(serverMutes.serverId, serverId))
      .orderBy(desc(serverMutes.mutedAt));
    return rows.map((r) => ({
      muteId: r.muteId,
      mutedUserId: r.mutedUserId,
      mutedUsername: r.mutedUsername,
      mutedDisplayName: r.mutedDisplayName,
      mutedBy: r.mutedBy,
      mutedAt: r.mutedAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
      reason: r.reason,
    }));
  }

  async muteUser(
    serverId: string,
    callerId: string,
    input: { userId: string; reason?: string; expiresAt?: string },
  ): Promise<ServerMuteDto> {
    await this.authz.assertServerPermission(serverId, callerId, "manage_messages");
    if (input.userId === callerId) {
      throw new BadRequestException("Cannot mute yourself");
    }

    let mute;
    try {
      [mute] = await this.db
        .insert(serverMutes)
        .values({
          serverId,
          mutedUserId: input.userId,
          mutedBy: callerId,
          reason: input.reason ?? null,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException("User is already muted on this server");
      throw err;
    }

    const [mutedUser] = await this.db
      .select({ username: users.username, displayName: users.displayName })
      .from(users)
      .where(eq(users.userId, input.userId))
      .limit(1);

    return {
      muteId: mute.muteId,
      mutedUserId: mute.mutedUserId,
      mutedUsername: mutedUser?.username ?? "",
      mutedDisplayName: mutedUser?.displayName ?? null,
      mutedBy: mute.mutedBy,
      mutedAt: mute.mutedAt.toISOString(),
      expiresAt: mute.expiresAt?.toISOString() ?? null,
      reason: mute.reason,
    };
  }

  async unmuteUser(
    serverId: string,
    callerId: string,
    targetUserId: string,
  ): Promise<{ success: true }> {
    await this.authz.assertServerPermission(serverId, callerId, "manage_messages");
    const result = await this.db
      .delete(serverMutes)
      .where(and(eq(serverMutes.serverId, serverId), eq(serverMutes.mutedUserId, targetUserId)))
      .returning({ muteId: serverMutes.muteId });
    if (result.length === 0) throw new NotFoundException("Mute not found");
    return { success: true };
  }

  /* ── Private channel members ────────────────────────────────── */

  async listChannelMembers(channelId: string, userId: string): Promise<ChannelMemberDto[]> {
    const serverId = await this.authz.serverIdForChannel(channelId);
    await this.authz.assertServerPermission(serverId, userId, "manage_channels");
    const rows = await this.db
      .select({
        userId: channelMembers.userId,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        addedAt: channelMembers.addedAt,
        addedBy: channelMembers.addedBy,
      })
      .from(channelMembers)
      .innerJoin(users, eq(users.userId, channelMembers.userId))
      .where(eq(channelMembers.channelId, channelId))
      .orderBy(asc(channelMembers.addedAt));
    return rows.map((r) => ({
      userId: r.userId,
      username: r.username,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      addedAt: r.addedAt.toISOString(),
      addedBy: r.addedBy,
    }));
  }

  async addChannelMember(
    channelId: string,
    callerId: string,
    targetUserId: string,
  ): Promise<{ success: true }> {
    const serverId = await this.authz.serverIdForChannel(channelId);
    await this.authz.assertServerPermission(serverId, callerId, "manage_channels");
    if (!(await this.isServerMember(serverId, targetUserId))) {
      throw new BadRequestException("Target user is not a member of this server");
    }
    try {
      await this.db
        .insert(channelMembers)
        .values({ channelId, userId: targetUserId, addedBy: callerId });
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException("User is already a member of this channel");
      throw err;
    }
    this.realtime.emitChannelEvent(channelId, "channelMemberAdded", {
      channelId,
      userId: targetUserId,
    });
    return { success: true };
  }

  async removeChannelMember(
    channelId: string,
    callerId: string,
    targetUserId: string,
  ): Promise<{ success: true }> {
    const serverId = await this.authz.serverIdForChannel(channelId);
    await this.authz.assertServerPermission(serverId, callerId, "manage_channels");
    const result = await this.db
      .delete(channelMembers)
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, targetUserId)))
      .returning({ userId: channelMembers.userId });
    if (result.length === 0) throw new NotFoundException("User is not a member of this channel");
    this.realtime.emitChannelEvent(channelId, "channelMemberRemoved", {
      channelId,
      userId: targetUserId,
    });
    return { success: true };
  }

  /**
   * Soft-delete a message. The author may always delete their own; otherwise the
   * message must be a channel message and the caller needs `manage_messages` on
   * the owning server (DM messages: author only).
   */
  async deleteMessage(messageId: string, userId: string): Promise<{ success: true }> {
    const [msg] = await this.db
      .select({ senderId: messages.senderId })
      .from(messages)
      .where(and(eq(messages.messageId, messageId), isNull(messages.deletedAt)))
      .limit(1);
    if (!msg) throw new NotFoundException("Message not found");

    const isAuthor = msg.senderId === userId;

    // Where does this message live?
    const [chan] = await this.db
      .select({ channelId: channelMessages.channelId })
      .from(channelMessages)
      .where(eq(channelMessages.messageId, messageId))
      .limit(1);
    const [dm] = chan
      ? [undefined]
      : await this.db
          .select({ conversationId: directMessages.conversationId })
          .from(directMessages)
          .where(eq(directMessages.messageId, messageId))
          .limit(1);

    if (!isAuthor) {
      if (chan) {
        const serverId = await this.authz.serverIdForChannel(chan.channelId);
        await this.authz.assertServerPermission(serverId, userId, "manage_messages");
      } else {
        throw new ForbiddenException("You can only delete your own direct messages");
      }
    }

    await this.db
      .update(messages)
      .set({ deletedAt: new Date(), deletedBy: userId })
      .where(eq(messages.messageId, messageId));

    if (chan) {
      this.realtime.emitChannelMessageDeleted(chan.channelId, {
        messageId,
        channelId: chan.channelId,
      });
    } else if (dm) {
      this.realtime.emitConversationMessageDeleted(dm.conversationId, {
        messageId,
        conversationId: dm.conversationId,
      });
    }
    return { success: true };
  }

  /* ── Channel messages ───────────────────────────────────── */

  async listChannelMessages(channelId: string, viewerId: string): Promise<MessageDto[]> {
    await this.assertChannelAccess(channelId, viewerId);
    const rows = await this.db
      .select({
        messageId: messages.messageId,
        channelId: channelMessages.channelId,
        senderId: messages.senderId,
        senderUsername: users.username,
        senderDisplayName: users.displayName,
        senderAvatarUrl: users.avatarUrl,
        content: messages.content,
        sentAt: messages.sentAt,
        editedAt: messages.editedAt,
        replyToId: messages.replyToId,
        reactionCount: sql<number>`(
          select count(*)::int from message_reactions mr
          where mr.message_id = ${messages.messageId}
        )`,
      })
      .from(channelMessages)
      .innerJoin(messages, eq(channelMessages.messageId, messages.messageId))
      .innerJoin(users, eq(messages.senderId, users.userId))
      .where(and(eq(channelMessages.channelId, channelId), isNull(messages.deletedAt)))
      .orderBy(asc(messages.sentAt))
      .limit(100);
    const ids = rows.map((r) => r.messageId);
    const reactionsByMsg = await this.loadReactions(ids, viewerId);
    const attachmentsByMsg = await this.loadAttachments(ids);
    return rows.map((r) =>
      this.toChannelMessageDto(
        r,
        reactionsByMsg.get(r.messageId) ?? [],
        attachmentsByMsg.get(r.messageId) ?? [],
      ),
    );
  }

  async sendChannelMessage(
    userId: string,
    channelId: string,
    content: string,
    replyToId?: string,
    attachmentUrls: string[] = [],
  ): Promise<MessageDto> {
    const { serverId, type } = await this.assertChannelAccess(channelId, userId);

    // `project` and `kanban` channels are embedded app surfaces rendered by the
    // frontend (submission form, board view) — the channel record exists only
    // to anchor permissions, not to hold messages.
    if (type === "project" || type === "kanban") {
      throw new BadRequestException("This channel does not accept messages");
    }
    // Announcement channels are post-restricted to members who can manage
    // messages (organizers/mods); everyone else can read but not post.
    if (type === "announcements") {
      await this.authz.assertServerPermission(serverId, userId, "manage_messages");
    }

    // Expired mutes are lifted lazily on send rather than by a background job,
    // so a user whose mute expired can post immediately without waiting for cleanup.
    // Mute check — auto-lift expired mutes.
    const [mute] = await this.db
      .select({ muteId: serverMutes.muteId, expiresAt: serverMutes.expiresAt })
      .from(serverMutes)
      .where(and(eq(serverMutes.serverId, serverId), eq(serverMutes.mutedUserId, userId)))
      .limit(1);
    if (mute) {
      if (mute.expiresAt && mute.expiresAt < new Date()) {
        await this.db.delete(serverMutes).where(eq(serverMutes.muteId, mute.muteId));
      } else {
        throw new ForbiddenException("You are muted on this server");
      }
    }

    const message = await this.db.transaction(async (tx) => {
      const [msg] = await tx
        .insert(messages)
        .values({ senderId: userId, content, replyToId: replyToId ?? null })
        .returning();
      await tx.insert(channelMessages).values({ messageId: msg.messageId, channelId });
      if (attachmentUrls.length > 0) {
        await tx.insert(messageAttachments).values(
          attachmentUrls.map((url, i) => ({
            messageId: msg.messageId,
            url,
            position: i,
          })),
        );
      }
      return msg;
    });

    const [sender] = await this.db
      .select({
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.userId, userId))
      .limit(1);

    const dto: MessageDto = {
      messageId: message.messageId,
      channelId,
      conversationId: null,
      senderId: userId,
      senderUsername: sender.username,
      senderDisplayName: sender.displayName,
      senderAvatarUrl: sender.avatarUrl,
      content: message.content,
      sentAt: message.sentAt.toISOString(),
      editedAt: message.editedAt ? message.editedAt.toISOString() : null,
      replyToId: message.replyToId,
      reactionCount: 0,
      reactions: [],
      attachments: attachmentUrls.map((url) => ({
        url,
        type: messageMediaType(url),
        filename: null,
      })),
    };
    // Ping tagged @usernames who are members of this server.
    await this.notifications.notifyMentions({
      actorId: userId,
      actorUsername: sender.username,
      content,
      entityType: "message",
      entityId: message.messageId,
      restrictToUserIds: await this.serverMemberIds(channelId),
    });

    this.realtime.emitChannelMessage(channelId, dto);
    return dto;
  }

  /* ── Reactions ──────────────────────────────────────────── */

  async toggleReaction(
    userId: string,
    messageId: string,
    symbol: string,
  ): Promise<ToggleReactionResult> {
    const [message] = await this.db
      .select({ messageId: messages.messageId })
      .from(messages)
      .where(and(eq(messages.messageId, messageId), isNull(messages.deletedAt)))
      .limit(1);
    if (!message) throw new NotFoundException("Message not found");

    const [existing] = await this.db
      .select({ symbol: messageReactions.symbol })
      .from(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, userId),
          eq(messageReactions.symbol, symbol),
        ),
      )
      .limit(1);

    let reacted: boolean;
    if (existing) {
      await this.db
        .delete(messageReactions)
        .where(
          and(
            eq(messageReactions.messageId, messageId),
            eq(messageReactions.userId, userId),
            eq(messageReactions.symbol, symbol),
          ),
        );
      reacted = false;
    } else {
      await this.db.insert(messageReactions).values({ messageId, userId, symbol });
      reacted = true;
    }

    const [{ symbolCount }] = await this.db
      .select({ symbolCount: sql<number>`count(*)::int` })
      .from(messageReactions)
      .where(and(eq(messageReactions.messageId, messageId), eq(messageReactions.symbol, symbol)));

    const count = Number(symbolCount);
    const payload = { messageId, symbol, count };

    // The message may be in a channel or a DM; we look up which room it belongs
    // to here rather than requiring the client to pass it, avoiding spoofing.
    const [chan] = await this.db
      .select({ channelId: channelMessages.channelId })
      .from(channelMessages)
      .where(eq(channelMessages.messageId, messageId))
      .limit(1);
    if (chan) {
      this.realtime.emitChannelReaction(chan.channelId, payload);
    } else {
      const [dm] = await this.db
        .select({ conversationId: directMessages.conversationId })
        .from(directMessages)
        .where(eq(directMessages.messageId, messageId))
        .limit(1);
      if (dm) this.realtime.emitConversationReaction(dm.conversationId, payload);
    }

    return { reacted, symbol, count };
  }

  /* ── Editing ────────────────────────────────────────────── */

  async editMessage(
    userId: string,
    messageId: string,
    content: string,
  ): Promise<{ messageId: string; content: string; editedAt: string }> {
    const [msg] = await this.db
      .select({ senderId: messages.senderId })
      .from(messages)
      .where(and(eq(messages.messageId, messageId), isNull(messages.deletedAt)))
      .limit(1);
    if (!msg) throw new NotFoundException("Message not found");
    if (msg.senderId !== userId) {
      throw new ForbiddenException("You can only edit your own messages");
    }

    const editedAt = new Date();
    await this.db
      .update(messages)
      .set({ content, editedAt })
      .where(eq(messages.messageId, messageId));

    const payload = { messageId, content, editedAt: editedAt.toISOString() };

    // Broadcast the edit to whichever room the message lives in.
    const [chan] = await this.db
      .select({ channelId: channelMessages.channelId })
      .from(channelMessages)
      .where(eq(channelMessages.messageId, messageId))
      .limit(1);
    if (chan) {
      this.realtime.emitChannelMessageEdited(chan.channelId, payload);
    } else {
      const [dm] = await this.db
        .select({ conversationId: directMessages.conversationId })
        .from(directMessages)
        .where(eq(directMessages.messageId, messageId))
        .limit(1);
      if (dm) {
        this.realtime.emitConversationMessageEdited(dm.conversationId, payload);
      }
    }

    return payload;
  }

  /* ── Conversations ──────────────────────────────────────── */

  async listConversations(userId: string): Promise<ConversationDto[]> {
    const membershipRows = await this.db
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(and(eq(conversationMembers.userId, userId), isNull(conversationMembers.leftAt)));
    const conversationIds = membershipRows.map((m) => m.conversationId);
    if (conversationIds.length === 0) return [];

    const convoRows = await this.db
      .select({
        conversationId: conversations.conversationId,
        name: conversations.name,
        icon: conversations.icon,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(inArray(conversations.conversationId, conversationIds))
      .orderBy(desc(conversations.createdAt));

    const memberRows = await this.db
      .select({
        conversationId: conversationMembers.conversationId,
        userId: users.userId,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        bannerUrl: users.bannerUrl,
      })
      .from(conversationMembers)
      .innerJoin(users, eq(conversationMembers.userId, users.userId))
      .where(
        and(
          inArray(conversationMembers.conversationId, conversationIds),
          isNull(conversationMembers.leftAt),
        ),
      );

    const memberIds = [...new Set(memberRows.map((m) => m.userId))];
    const [premiumMembers, equippedByUser] = await Promise.all([
      this.subscriptions.premiumUserIds(memberIds),
      this.cosmetics.equippedForUsers(memberIds),
    ]);
    const membersByConvo = new Map<string, ConversationMemberDto[]>();
    for (const m of memberRows) {
      const list = membersByConvo.get(m.conversationId) ?? [];
      list.push({
        userId: m.userId,
        username: m.username,
        displayName: m.displayName,
        avatarUrl: m.avatarUrl,
        bannerUrl: m.bannerUrl,
        isPremium: premiumMembers.has(m.userId),
        usernameEffect: equippedByUser.get(m.userId)?.usernameEffect ?? null,
        profileDecoration: equippedByUser.get(m.userId)?.profileDecoration ?? null,
      });
      membersByConvo.set(m.conversationId, list);
    }

    const lastMessageRows = await this.db
      .select({
        conversationId: directMessages.conversationId,
        content: messages.content,
        sentAt: messages.sentAt,
        senderUsername: users.username,
        senderDisplayName: users.displayName,
      })
      .from(directMessages)
      .innerJoin(messages, eq(directMessages.messageId, messages.messageId))
      .innerJoin(users, eq(messages.senderId, users.userId))
      .where(
        and(inArray(directMessages.conversationId, conversationIds), isNull(messages.deletedAt)),
      )
      .orderBy(desc(messages.sentAt));

    const lastMessageByConvo = new Map<string, ConversationLastMessageDto>();
    for (const lm of lastMessageRows) {
      if (lastMessageByConvo.has(lm.conversationId)) continue;
      lastMessageByConvo.set(lm.conversationId, {
        content: lm.content,
        sentAt: lm.sentAt.toISOString(),
        senderUsername: lm.senderUsername,
        senderDisplayName: lm.senderDisplayName,
      });
    }

    // isNull(lastReadAt) means the user has never marked the conversation read,
    // so every message in it counts as unread.
    // Unread = messages from OTHER members sent after this user's lastReadAt.
    const unreadRows = await this.db
      .select({
        conversationId: directMessages.conversationId,
        count: sql<number>`count(*)::int`,
      })
      .from(directMessages)
      .innerJoin(messages, eq(directMessages.messageId, messages.messageId))
      .innerJoin(
        conversationMembers,
        and(
          eq(conversationMembers.conversationId, directMessages.conversationId),
          eq(conversationMembers.userId, userId),
        ),
      )
      .where(
        and(
          inArray(directMessages.conversationId, conversationIds),
          ne(messages.senderId, userId),
          isNull(messages.deletedAt),
          or(
            isNull(conversationMembers.lastReadAt),
            gt(messages.sentAt, conversationMembers.lastReadAt),
          ),
        ),
      )
      .groupBy(directMessages.conversationId);

    const unreadByConvo = new Map<string, number>();
    for (const u of unreadRows) {
      unreadByConvo.set(u.conversationId, Number(u.count));
    }

    return convoRows.map((c) => ({
      conversationId: c.conversationId,
      name: c.name,
      icon: c.icon,
      createdAt: c.createdAt.toISOString(),
      members: membersByConvo.get(c.conversationId) ?? [],
      lastMessage: lastMessageByConvo.get(c.conversationId) ?? null,
      unreadCount: unreadByConvo.get(c.conversationId) ?? 0,
    }));
  }

  async createConversation(
    userId: string,
    memberIds: string[],
    name?: string,
    icon?: string,
  ): Promise<ConversationDto> {
    const uniqueMemberIds = Array.from(new Set([userId, ...memberIds]));

    const conversationId = await this.db.transaction(async (tx) => {
      const [convo] = await tx
        .insert(conversations)
        .values({ createdBy: userId, name: name ?? null, icon: icon ?? null })
        .returning({ conversationId: conversations.conversationId });
      await tx.insert(conversationMembers).values(
        uniqueMemberIds.map((memberId) => ({
          conversationId: convo.conversationId,
          userId: memberId,
        })),
      );
      return convo.conversationId;
    });

    return this.buildConversationDto(conversationId, userId);
  }

  /** A single ConversationDto (members + last message + name/icon). */
  private async buildConversationDto(
    conversationId: string,
    forUserId?: string,
  ): Promise<ConversationDto> {
    const [convo] = await this.db
      .select({
        conversationId: conversations.conversationId,
        name: conversations.name,
        icon: conversations.icon,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(eq(conversations.conversationId, conversationId))
      .limit(1);
    if (!convo) throw new NotFoundException("Conversation not found");

    const memberRows = await this.db
      .select({
        userId: users.userId,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        bannerUrl: users.bannerUrl,
      })
      .from(conversationMembers)
      .innerJoin(users, eq(conversationMembers.userId, users.userId))
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          isNull(conversationMembers.leftAt),
        ),
      );

    const [last] = await this.db
      .select({
        content: messages.content,
        sentAt: messages.sentAt,
        senderUsername: users.username,
        senderDisplayName: users.displayName,
      })
      .from(directMessages)
      .innerJoin(messages, eq(directMessages.messageId, messages.messageId))
      .innerJoin(users, eq(messages.senderId, users.userId))
      .where(and(eq(directMessages.conversationId, conversationId), isNull(messages.deletedAt)))
      .orderBy(desc(messages.sentAt))
      .limit(1);

    let unreadCount = 0;
    if (forUserId) {
      const [unread] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(directMessages)
        .innerJoin(messages, eq(directMessages.messageId, messages.messageId))
        .innerJoin(
          conversationMembers,
          and(
            eq(conversationMembers.conversationId, directMessages.conversationId),
            eq(conversationMembers.userId, forUserId),
          ),
        )
        .where(
          and(
            eq(directMessages.conversationId, conversationId),
            ne(messages.senderId, forUserId),
            isNull(messages.deletedAt),
            or(
              isNull(conversationMembers.lastReadAt),
              gt(messages.sentAt, conversationMembers.lastReadAt),
            ),
          ),
        );
      unreadCount = Number(unread?.count ?? 0);
    }

    return {
      conversationId: convo.conversationId,
      name: convo.name,
      icon: convo.icon,
      createdAt: convo.createdAt.toISOString(),
      members: await this.withPremium(memberRows),
      lastMessage: last
        ? {
            content: last.content,
            sentAt: last.sentAt.toISOString(),
            senderUsername: last.senderUsername,
            senderDisplayName: last.senderDisplayName,
          }
        : null,
      unreadCount,
    };
  }

  /** Update a conversation's name / icon (members only). */
  async updateConversation(
    userId: string,
    conversationId: string,
    input: { name?: string | null; icon?: string | null },
  ): Promise<ConversationDto> {
    await this.assertConversationMember(userId, conversationId);
    const patch: { name?: string | null; icon?: string | null } = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.icon !== undefined) patch.icon = input.icon;
    if (Object.keys(patch).length > 0) {
      await this.db
        .update(conversations)
        .set(patch)
        .where(eq(conversations.conversationId, conversationId));
    }
    return this.buildConversationDto(conversationId, userId);
  }

  /** Add members to a conversation (members only). Re-activates anyone who left. */
  async addConversationMembers(
    userId: string,
    conversationId: string,
    userIds: string[],
  ): Promise<ConversationDto> {
    await this.assertConversationMember(userId, conversationId);
    for (const uid of Array.from(new Set(userIds))) {
      await this.db
        .insert(conversationMembers)
        .values({ conversationId, userId: uid })
        .onConflictDoUpdate({
          target: [conversationMembers.conversationId, conversationMembers.userId],
          set: { leftAt: null },
        });
    }
    return this.buildConversationDto(conversationId, userId);
  }

  async listConversationMessages(userId: string, conversationId: string): Promise<MessageDto[]> {
    await this.assertConversationMember(userId, conversationId);

    const rows = await this.db
      .select({
        messageId: messages.messageId,
        conversationId: directMessages.conversationId,
        senderId: messages.senderId,
        senderUsername: users.username,
        senderDisplayName: users.displayName,
        senderAvatarUrl: users.avatarUrl,
        content: messages.content,
        sentAt: messages.sentAt,
        editedAt: messages.editedAt,
        replyToId: messages.replyToId,
        reactionCount: sql<number>`(
          select count(*)::int from message_reactions mr
          where mr.message_id = ${messages.messageId}
        )`,
      })
      .from(directMessages)
      .innerJoin(messages, eq(directMessages.messageId, messages.messageId))
      .innerJoin(users, eq(messages.senderId, users.userId))
      .where(and(eq(directMessages.conversationId, conversationId), isNull(messages.deletedAt)))
      .orderBy(asc(messages.sentAt));
    const ids = rows.map((r) => r.messageId);
    const reactionsByMsg = await this.loadReactions(ids, userId);
    const attachmentsByMsg = await this.loadAttachments(ids);
    return rows.map((r) =>
      this.toDirectMessageDto(
        r,
        reactionsByMsg.get(r.messageId) ?? [],
        attachmentsByMsg.get(r.messageId) ?? [],
      ),
    );
  }

  async sendConversationMessage(
    userId: string,
    conversationId: string,
    content: string,
    replyToId?: string,
    attachmentUrls: string[] = [],
  ): Promise<MessageDto> {
    await this.assertConversationMember(userId, conversationId);

    const message = await this.db.transaction(async (tx) => {
      const [msg] = await tx
        .insert(messages)
        .values({ senderId: userId, content, replyToId: replyToId ?? null })
        .returning();
      await tx.insert(directMessages).values({ messageId: msg.messageId, conversationId });
      if (attachmentUrls.length > 0) {
        await tx.insert(messageAttachments).values(
          attachmentUrls.map((url, i) => ({
            messageId: msg.messageId,
            url,
            position: i,
          })),
        );
      }
      return msg;
    });

    const [sender] = await this.db
      .select({
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.userId, userId))
      .limit(1);

    // Notify the other active members of the conversation.
    const others = await this.db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          isNull(conversationMembers.leftAt),
          ne(conversationMembers.userId, userId),
        ),
      );
    if (others.length > 0) {
      await this.db.insert(notifications).values(
        others.map((o) => ({
          userId: o.userId,
          type: "new_direct_message" as const,
          title: "Nova poruka",
          body: `@${sender.username}: ${content.slice(0, 80)}`,
          entityType: "message" as const,
          entityId: message.messageId,
        })),
      );
      // The DB insert persists for badge counters; the realtime emit updates the
      // badge in the currently open session without requiring a page refresh.
      for (const o of others) {
        this.realtime.emitNotification(o.userId, {
          type: "new_direct_message",
          title: "Nova poruka",
          body: `@${sender.username}: ${content.slice(0, 80)}`,
        });
      }
    }

    const dto: MessageDto = {
      messageId: message.messageId,
      channelId: null,
      conversationId,
      senderId: userId,
      senderUsername: sender.username,
      senderDisplayName: sender.displayName,
      senderAvatarUrl: sender.avatarUrl,
      content: message.content,
      sentAt: message.sentAt.toISOString(),
      editedAt: message.editedAt ? message.editedAt.toISOString() : null,
      replyToId: message.replyToId,
      reactionCount: 0,
      reactions: [],
      attachments: attachmentUrls.map((url) => ({
        url,
        type: messageMediaType(url),
        filename: null,
      })),
    };
    // Ping tagged @usernames who are members of this conversation.
    await this.notifications.notifyMentions({
      actorId: userId,
      actorUsername: sender.username,
      content,
      entityType: "message",
      entityId: message.messageId,
      restrictToUserIds: others.map((o) => o.userId),
    });

    this.realtime.emitDirectMessage(conversationId, dto);
    return dto;
  }

  /** Mark a conversation read for the current user (sets lastReadAt = now). */
  async markConversationRead(userId: string, conversationId: string): Promise<{ success: true }> {
    await this.assertConversationMember(userId, conversationId);
    await this.db
      .update(conversationMembers)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, userId),
        ),
      );
    return { success: true };
  }

  /**
   * The ongoing hackathon whose cohor server the user belongs to (via a server
   * role, or as the organizing account), or null. Mirrors {@link listServers}
   * membership resolution.
   */
  async getMyActiveHackathon(userId: string): Promise<{
    hackathonId: string;
    title: string;
    serverId: string;
    organizationName: string;
  } | null> {
    // Servers where the user holds a role …
    const roleServers = await this.db
      .selectDistinct({ serverId: serverRoles.serverId })
      .from(userRoles)
      .innerJoin(serverRoles, eq(serverRoles.serverRoleId, userRoles.serverRoleId))
      .where(eq(userRoles.userId, userId));
    // … plus servers whose hackathon they organize.
    const orgServers = await this.db
      .select({ serverId: servers.serverId })
      .from(servers)
      .innerJoin(hackathons, eq(hackathons.hackathonId, servers.hackathonId))
      .where(eq(hackathons.organizationId, userId));

    const ids = [
      ...new Set([...roleServers.map((r) => r.serverId), ...orgServers.map((r) => r.serverId)]),
    ];
    if (ids.length === 0) return null;

    const [row] = await this.db
      .select({
        hackathonId: hackathons.hackathonId,
        title: hackathons.title,
        serverId: servers.serverId,
        organizationName: organizations.name,
      })
      .from(servers)
      .innerJoin(hackathons, eq(hackathons.hackathonId, servers.hackathonId))
      .innerJoin(organizations, eq(organizations.userId, hackathons.organizationId))
      .where(
        and(
          inArray(servers.serverId, ids),
          eq(hackathons.status, "ongoing"),
          isNull(hackathons.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /* ── Internal helpers ───────────────────────────────────── */

  private async assertConversationMember(userId: string, conversationId: string): Promise<void> {
    const [membership] = await this.db
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
    if (!membership) {
      throw new ForbiddenException("Not a member of this conversation");
    }
  }

  private toChannelMessageDto(
    r: ChannelMessageRow,
    reactions: ReactionGroup[],
    attachments: MessageAttachmentDto[] = [],
  ): MessageDto {
    return {
      messageId: r.messageId,
      channelId: r.channelId,
      conversationId: null,
      senderId: r.senderId,
      senderUsername: r.senderUsername,
      senderDisplayName: r.senderDisplayName,
      senderAvatarUrl: r.senderAvatarUrl,
      content: r.content,
      sentAt: r.sentAt.toISOString(),
      editedAt: r.editedAt ? r.editedAt.toISOString() : null,
      replyToId: r.replyToId,
      reactionCount: Number(r.reactionCount),
      reactions,
      attachments,
    };
  }

  private toDirectMessageDto(
    r: DirectMessageRow,
    reactions: ReactionGroup[],
    attachments: MessageAttachmentDto[] = [],
  ): MessageDto {
    return {
      messageId: r.messageId,
      channelId: null,
      conversationId: r.conversationId,
      senderId: r.senderId,
      senderUsername: r.senderUsername,
      senderDisplayName: r.senderDisplayName,
      senderAvatarUrl: r.senderAvatarUrl,
      content: r.content,
      sentAt: r.sentAt.toISOString(),
      editedAt: r.editedAt ? r.editedAt.toISOString() : null,
      replyToId: r.replyToId,
      reactionCount: Number(r.reactionCount),
      reactions,
      attachments,
    };
  }

  /** Per-emoji reaction groups for a set of messages, viewer-aware (mine). */
  private async loadReactions(
    messageIds: string[],
    viewerId: string,
  ): Promise<Map<string, ReactionGroup[]>> {
    const byMsg = new Map<string, ReactionGroup[]>();
    if (messageIds.length === 0) return byMsg;
    const rows = await this.db
      .select({
        messageId: messageReactions.messageId,
        symbol: messageReactions.symbol,
        count: sql<number>`count(*)::int`,
        mine: sql<boolean>`bool_or(${messageReactions.userId} = ${viewerId})`,
      })
      .from(messageReactions)
      .where(inArray(messageReactions.messageId, messageIds))
      .groupBy(messageReactions.messageId, messageReactions.symbol)
      .orderBy(asc(messageReactions.symbol));
    for (const r of rows) {
      const list = byMsg.get(r.messageId) ?? [];
      list.push({
        symbol: r.symbol,
        count: Number(r.count),
        mine: Boolean(r.mine),
      });
      byMsg.set(r.messageId, list);
    }
    return byMsg;
  }

  /** Ordered image/video attachments for a set of messages. */
  private async loadAttachments(
    messageIds: string[],
  ): Promise<Map<string, MessageAttachmentDto[]>> {
    const byMsg = new Map<string, MessageAttachmentDto[]>();
    if (messageIds.length === 0) return byMsg;
    const rows = await this.db
      .select({
        messageId: messageAttachments.messageId,
        url: messageAttachments.url,
        filename: messageAttachments.filename,
        position: messageAttachments.position,
      })
      .from(messageAttachments)
      .where(inArray(messageAttachments.messageId, messageIds))
      .orderBy(asc(messageAttachments.messageId), asc(messageAttachments.position));
    for (const r of rows) {
      const list = byMsg.get(r.messageId) ?? [];
      list.push({
        url: r.url,
        type: messageMediaType(r.url),
        filename: r.filename ?? null,
      });
      byMsg.set(r.messageId, list);
    }
    return byMsg;
  }
}

/** Postgres unique-violation guard (code 23505), survives Drizzle wrapping. */
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  if (code === "23505") return true;
  const cause = (err as { cause?: unknown }).cause;
  return (
    typeof cause === "object" && cause !== null && (cause as { code?: unknown }).code === "23505"
  );
}
