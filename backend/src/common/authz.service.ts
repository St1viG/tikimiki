import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import {
  administrators,
  channelGroups,
  channels,
  hackathons,
  permissions,
  serverRolePermissions,
  serverRoles,
  servers,
  userBans,
  userRoles,
} from "../db/schema";

/** An active (not-yet-lifted) ban row. */
export interface ActiveBan {
  banId: string;
  reason: string;
}

/**
 * AuthzService — shared role / ownership checks used across feature modules.
 *
 * The role model: a user is a platform **admin** iff they have a row in
 * `administrators`; a hackathon is **owned** by the user whose id equals the
 * hackathon's `organizationId` (organizations are users with an extra profile
 * row). There is no separate moderator role, so moderation surfaces are
 * admin-gated.
 *
 * Provided globally (see {@link AuthzModule}) so any service can inject it.
 */
@Injectable()
export class AuthzService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** True iff the user has an `administrators` row. */
  async isAdmin(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ userId: administrators.userId })
      .from(administrators)
      .where(eq(administrators.userId, userId))
      .limit(1);
    return Boolean(row);
  }

  /** Throw 403 unless the user is a platform admin. */
  async assertAdmin(userId: string): Promise<void> {
    if (!(await this.isAdmin(userId))) {
      throw new ForbiddenException("Admin access required");
    }
  }

  /**
   * The user's active (not-yet-lifted) ban, or `null` if none. The single
   * source of truth for the `user_bans where user_id = … and lifted_at is null`
   * lookup used across auth / account flows.
   */
  async getActiveBan(userId: string): Promise<ActiveBan | null> {
    const [row] = await this.db
      .select({ banId: userBans.banId, reason: userBans.reason })
      .from(userBans)
      .where(and(eq(userBans.userId, userId), isNull(userBans.liftedAt)))
      .limit(1);
    return row ?? null;
  }

  /** True iff the user currently has an active ban. */
  async isBanned(userId: string): Promise<boolean> {
    return (await this.getActiveBan(userId)) !== null;
  }

  /**
   * Allow the hackathon's organizing user or any admin. Throws 404 if the
   * hackathon does not exist, 403 if the caller is neither owner nor admin.
   */
  async assertHackathonOwnerOrAdmin(
    hackathonId: string,
    userId: string,
  ): Promise<void> {
    const [hk] = await this.db
      .select({ organizationId: hackathons.organizationId })
      .from(hackathons)
      .where(eq(hackathons.hackathonId, hackathonId))
      .limit(1);
    if (!hk) {
      throw new NotFoundException("Hackathon not found");
    }
    if (hk.organizationId === userId) return;
    if (await this.isAdmin(userId)) return;
    throw new ForbiddenException(
      "Only the organizing team can manage this hackathon",
    );
  }

  /* ── Server moderation permissions ───────────────────────── */

  /**
   * True iff the user is the organizing account of the server's hackathon.
   * Organizers (and platform admins) implicitly hold every server permission.
   */
  private async isServerOrganizer(
    serverId: string,
    userId: string,
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ orgId: hackathons.organizationId })
      .from(servers)
      .innerJoin(hackathons, eq(hackathons.hackathonId, servers.hackathonId))
      .where(eq(servers.serverId, serverId))
      .limit(1);
    return row?.orgId === userId;
  }

  /** All permission names defined in the catalog (the implicit organizer set). */
  private async allPermissionNames(): Promise<Set<string>> {
    const rows = await this.db
      .select({ name: permissions.name })
      .from(permissions);
    return new Set(rows.map((r) => r.name));
  }

  /**
   * The union of permission names a user holds on a server, across every role
   * assigned to them (user_roles → server_role_permissions → permissions).
   *
   * The organizing account of the server's hackathon and platform admins are
   * super-users: they receive the FULL permission catalog. A user who holds no
   * role on the server (and is neither organizer nor admin) gets an empty set.
   */
  async getServerPermissions(
    serverId: string,
    userId: string,
  ): Promise<Set<string>> {
    if (
      (await this.isServerOrganizer(serverId, userId)) ||
      (await this.isAdmin(userId))
    ) {
      return this.allPermissionNames();
    }

    const rows = await this.db
      .select({ name: permissions.name })
      .from(userRoles)
      .innerJoin(
        serverRoles,
        eq(serverRoles.serverRoleId, userRoles.serverRoleId),
      )
      .innerJoin(
        serverRolePermissions,
        eq(serverRolePermissions.serverRoleId, serverRoles.serverRoleId),
      )
      .innerJoin(
        permissions,
        eq(permissions.permissionId, serverRolePermissions.permissionId),
      )
      .where(
        and(eq(serverRoles.serverId, serverId), eq(userRoles.userId, userId)),
      );
    return new Set(rows.map((r) => r.name));
  }

  /** Throw 403 unless the user holds `permission` on the given server. */
  async assertServerPermission(
    serverId: string,
    userId: string,
    permission: string,
  ): Promise<void> {
    const perms = await this.getServerPermissions(serverId, userId);
    if (!perms.has(permission)) {
      throw new ForbiddenException(
        `You lack the "${permission}" permission on this server`,
      );
    }
  }

  /**
   * Resolve a channel's owning server id (channels → channel_groups → servers).
   * Throws 404 if the channel does not exist. Used by message/channel routes
   * that authorize against the server.
   */
  async serverIdForChannel(channelId: string): Promise<string> {
    const [row] = await this.db
      .select({ serverId: channelGroups.serverId })
      .from(channels)
      .innerJoin(channelGroups, eq(channelGroups.groupId, channels.groupId))
      .where(eq(channels.channelId, channelId))
      .limit(1);
    if (!row) throw new NotFoundException("Channel not found");
    return row.serverId;
  }
}
