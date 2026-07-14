import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { AuthzService } from "../common/authz.service";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import {
  hackathons,
  members,
  permissions,
  serverRolePermissions,
  serverRoles,
  servers,
  userRoles,
} from "../db/schema";
import type { CreateRoleInput, PermissionDto, ServerRoleDto, UpdateRoleInput } from "./dto";

/**
 * Canonical permission catalog. Bootstrapped idempotently into the (otherwise
 * empty) `permissions` table on module init so every environment self-provisions
 * the same set. Permission logic everywhere keys off these NAMES, never on
 * hardcoded ids.
 */
const PERMISSION_CATALOG: { name: string; description: string }[] = [
  {
    name: "manage_server",
    description: "Edit server settings (name, logo, banner)",
  },
  {
    name: "manage_channels",
    description: "Create, edit, and delete channels and channel groups",
  },
  {
    name: "manage_roles",
    description: "Create and edit roles, set their permissions, assign and remove members",
  },
  { name: "manage_messages", description: "Delete any member's messages" },
  { name: "kick_members", description: "Remove members from the server" },
];

/**
 * Canonical per-server "Moderator" role, provisioned lazily on first assign.
 * Carries exactly the permission the scoped report surfaces key off
 * (`manage_messages` — see ReportsService.list/resolve), so an organizer can
 * hand off report handling in one step instead of hand-building a role.
 */
const MODERATOR_ROLE_NAME = "Moderator";
const MODERATOR_ROLE_PERMISSIONS = ["manage_messages"];

@Injectable()
export class ModerationService implements OnModuleInit {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly authz: AuthzService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Self-provision the permission catalog (idempotent). */
  async onModuleInit(): Promise<void> {
    await this.db
      .insert(permissions)
      .values(PERMISSION_CATALOG)
      .onConflictDoNothing({ target: permissions.name });
  }

  /* ── Catalog ────────────────────────────────────────────── */

  async listPermissions(): Promise<PermissionDto[]> {
    const rows = await this.db
      .select({
        permissionId: permissions.permissionId,
        name: permissions.name,
        description: permissions.description,
      })
      .from(permissions)
      .orderBy(asc(permissions.name));
    return rows;
  }

  async myPermissions(serverId: string, userId: string): Promise<{ permissions: string[] }> {
    await this.assertServerMember(serverId, userId);
    const perms = await this.authz.getServerPermissions(serverId, userId);
    return { permissions: [...perms].sort() };
  }

  /* ── Roles ──────────────────────────────────────────────── */

  async listRoles(serverId: string, userId: string): Promise<ServerRoleDto[]> {
    await this.assertServerMember(serverId, userId);

    const roleRows = await this.db
      .select({
        serverRoleId: serverRoles.serverRoleId,
        name: serverRoles.name,
        createdAt: serverRoles.createdAt,
      })
      .from(serverRoles)
      .where(eq(serverRoles.serverId, serverId))
      .orderBy(asc(serverRoles.name));
    if (roleRows.length === 0) return [];

    const roleIds = roleRows.map((r) => r.serverRoleId);

    const permRows = await this.db
      .select({
        serverRoleId: serverRolePermissions.serverRoleId,
        name: permissions.name,
      })
      .from(serverRolePermissions)
      .innerJoin(permissions, eq(permissions.permissionId, serverRolePermissions.permissionId))
      .where(inArray(serverRolePermissions.serverRoleId, roleIds));
    const permsByRole = new Map<string, string[]>();
    for (const p of permRows) {
      const list = permsByRole.get(p.serverRoleId) ?? [];
      list.push(p.name);
      permsByRole.set(p.serverRoleId, list);
    }

    const countRows = await this.db
      .select({
        serverRoleId: userRoles.serverRoleId,
        count: sql<number>`count(*)::int`,
      })
      .from(userRoles)
      .where(inArray(userRoles.serverRoleId, roleIds))
      .groupBy(userRoles.serverRoleId);
    const countByRole = new Map<string, number>();
    for (const c of countRows) {
      countByRole.set(c.serverRoleId, Number(c.count));
    }

    return roleRows.map((r) => ({
      serverRoleId: r.serverRoleId,
      name: r.name,
      permissions: (permsByRole.get(r.serverRoleId) ?? []).sort(),
      memberCount: countByRole.get(r.serverRoleId) ?? 0,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async createRole(
    serverId: string,
    userId: string,
    input: CreateRoleInput,
  ): Promise<ServerRoleDto> {
    await this.authz.assertServerPermission(serverId, userId, "manage_roles");
    await this.assertServerExists(serverId);
    const permIds = await this.resolvePermissionIds(input.permissions);

    const created = await this.db.transaction(async (tx) => {
      let role;
      try {
        [role] = await tx.insert(serverRoles).values({ serverId, name: input.name }).returning({
          serverRoleId: serverRoles.serverRoleId,
          name: serverRoles.name,
          createdAt: serverRoles.createdAt,
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictException("A role with that name already exists on this server");
        }
        throw err;
      }
      if (permIds.length > 0) {
        await tx.insert(serverRolePermissions).values(
          permIds.map((permissionId) => ({
            serverRoleId: role.serverRoleId,
            permissionId,
          })),
        );
      }
      return role;
    });

    this.realtime.emitServerEvent(serverId, "rolesChanged", {
      serverId,
      roleId: created.serverRoleId,
    });

    return {
      serverRoleId: created.serverRoleId,
      name: created.name,
      permissions: input.permissions.slice().sort(),
      memberCount: 0,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async updateRole(
    serverId: string,
    roleId: string,
    userId: string,
    input: UpdateRoleInput,
  ): Promise<ServerRoleDto> {
    await this.authz.assertServerPermission(serverId, userId, "manage_roles");
    await this.assertRoleInServer(serverId, roleId);

    const permIds =
      input.permissions !== undefined
        ? await this.resolvePermissionIds(input.permissions)
        : undefined;

    await this.db.transaction(async (tx) => {
      if (input.name !== undefined) {
        try {
          await tx
            .update(serverRoles)
            .set({ name: input.name })
            .where(eq(serverRoles.serverRoleId, roleId));
        } catch (err) {
          if (isUniqueViolation(err)) {
            throw new ConflictException("A role with that name already exists on this server");
          }
          throw err;
        }
      }
      if (permIds !== undefined) {
        await tx
          .delete(serverRolePermissions)
          .where(eq(serverRolePermissions.serverRoleId, roleId));
        if (permIds.length > 0) {
          await tx.insert(serverRolePermissions).values(
            permIds.map((permissionId) => ({
              serverRoleId: roleId,
              permissionId,
            })),
          );
        }
      }
    });

    this.realtime.emitServerEvent(serverId, "rolesChanged", {
      serverId,
      roleId,
    });

    return this.getRoleDto(serverId, roleId);
  }

  async deleteRole(serverId: string, roleId: string, userId: string): Promise<{ success: true }> {
    await this.authz.assertServerPermission(serverId, userId, "manage_roles");
    await this.assertRoleInServer(serverId, roleId);
    // ON DELETE CASCADE on user_roles and server_role_permissions means the
    // database removes all member assignments and permission links automatically.
    await this.db.delete(serverRoles).where(eq(serverRoles.serverRoleId, roleId));

    this.realtime.emitServerEvent(serverId, "rolesChanged", {
      serverId,
      roleId,
    });
    return { success: true };
  }

  /* ── Role membership ────────────────────────────────────── */

  async addRoleMember(
    serverId: string,
    roleId: string,
    userId: string,
    targetUserId: string,
  ): Promise<{ success: true }> {
    await this.authz.assertServerPermission(serverId, userId, "manage_roles");
    await this.assertRoleInServer(serverId, roleId);

    const [member] = await this.db
      .select({ userId: members.userId })
      .from(members)
      .where(eq(members.userId, targetUserId))
      .limit(1);
    if (!member) {
      throw new BadRequestException("Target user is not a member account");
    }

    await this.db
      .insert(userRoles)
      .values({ serverRoleId: roleId, userId: targetUserId, assignedBy: userId })
      .onConflictDoNothing();

    this.realtime.emitServerEvent(serverId, "rolesChanged", {
      serverId,
      roleId,
      userId: targetUserId,
    });
    return { success: true };
  }

  async removeRoleMember(
    serverId: string,
    roleId: string,
    userId: string,
    targetUserId: string,
  ): Promise<{ success: true }> {
    await this.authz.assertServerPermission(serverId, userId, "manage_roles");
    await this.assertRoleInServer(serverId, roleId);

    await this.db
      .delete(userRoles)
      .where(and(eq(userRoles.serverRoleId, roleId), eq(userRoles.userId, targetUserId)));

    this.realtime.emitServerEvent(serverId, "rolesChanged", {
      serverId,
      roleId,
      userId: targetUserId,
    });
    return { success: true };
  }

  /* ── Moderators (canonical "Moderator" role) ────────────── */

  /**
   * One-step moderator hand-off: assign the canonical "Moderator" role to a
   * member, provisioning the role (with `manage_messages`) on first use.
   * Gated on `manage_roles`, which the organizer and admins hold implicitly —
   * same gate as the generic role-membership endpoints this shortcuts.
   */
  async assignModerator(
    serverId: string,
    actorId: string,
    targetUserId: string,
  ): Promise<{ success: true }> {
    await this.authz.assertServerPermission(serverId, actorId, "manage_roles");
    await this.assertServerExists(serverId);

    const [member] = await this.db
      .select({ userId: members.userId })
      .from(members)
      .where(eq(members.userId, targetUserId))
      .limit(1);
    if (!member) {
      throw new BadRequestException("Target user is not a member account");
    }

    const roleId = await this.ensureModeratorRole(serverId);
    await this.db
      .insert(userRoles)
      .values({ serverRoleId: roleId, userId: targetUserId, assignedBy: actorId })
      .onConflictDoNothing();

    this.realtime.emitServerEvent(serverId, "rolesChanged", {
      serverId,
      roleId,
      userId: targetUserId,
    });
    return { success: true };
  }

  /** Take the canonical "Moderator" role away from a member (idempotent). */
  async removeModerator(
    serverId: string,
    actorId: string,
    targetUserId: string,
  ): Promise<{ success: true }> {
    await this.authz.assertServerPermission(serverId, actorId, "manage_roles");
    await this.assertServerExists(serverId);

    const roleId = await this.findModeratorRole(serverId);
    // If no Moderator role exists yet the user provably isn't a moderator, so
    // the removal is a no-op success — consistent with DELETE-returning-0-rows.
    if (roleId) {
      await this.db
        .delete(userRoles)
        .where(and(eq(userRoles.serverRoleId, roleId), eq(userRoles.userId, targetUserId)));
      this.realtime.emitServerEvent(serverId, "rolesChanged", {
        serverId,
        roleId,
        userId: targetUserId,
      });
    }
    return { success: true };
  }

  private async findModeratorRole(serverId: string): Promise<string | null> {
    const [role] = await this.db
      .select({ serverRoleId: serverRoles.serverRoleId })
      .from(serverRoles)
      .where(and(eq(serverRoles.serverId, serverId), eq(serverRoles.name, MODERATOR_ROLE_NAME)))
      .limit(1);
    return role?.serverRoleId ?? null;
  }

  /**
   * Find-or-create the canonical Moderator role, then idempotently guarantee
   * it carries MODERATOR_ROLE_PERMISSIONS — covering both a fresh role and a
   * hand-made "Moderator" that was stripped of the permission. Survives a
   * concurrent create via the (server_id, name) unique index.
   */
  private async ensureModeratorRole(serverId: string): Promise<string> {
    let roleId = await this.findModeratorRole(serverId);
    if (!roleId) {
      try {
        const [role] = await this.db
          .insert(serverRoles)
          .values({ serverId, name: MODERATOR_ROLE_NAME })
          .returning({ serverRoleId: serverRoles.serverRoleId });
        roleId = role.serverRoleId;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        roleId = await this.findModeratorRole(serverId);
        // Race: another request created the role between our check and insert; re-read it.
        if (!roleId) throw err;
      }
    }

    const permIds = await this.resolvePermissionIds(MODERATOR_ROLE_PERMISSIONS);
    await this.db
      .insert(serverRolePermissions)
      .values(permIds.map((permissionId) => ({ serverRoleId: roleId!, permissionId })))
      .onConflictDoNothing();
    return roleId;
  }

  /** Remove ALL of a user's role memberships on the server (full kick). */
  async kickMember(
    serverId: string,
    userId: string,
    targetUserId: string,
  ): Promise<{ success: true }> {
    await this.authz.assertServerPermission(serverId, userId, "kick_members");

    const [srv] = await this.db
      .select({ orgId: hackathons.organizationId })
      .from(servers)
      .innerJoin(hackathons, eq(hackathons.hackathonId, servers.hackathonId))
      .where(eq(servers.serverId, serverId))
      .limit(1);
    if (!srv) throw new NotFoundException("Server not found");
    if (srv.orgId === targetUserId) {
      throw new BadRequestException("The organizing account cannot be kicked from the server");
    }

    const roleIds = (
      await this.db
        .select({ serverRoleId: serverRoles.serverRoleId })
        .from(serverRoles)
        .where(eq(serverRoles.serverId, serverId))
    ).map((r) => r.serverRoleId);
    if (roleIds.length > 0) {
      await this.db
        .delete(userRoles)
        .where(and(inArray(userRoles.serverRoleId, roleIds), eq(userRoles.userId, targetUserId)));
    }

    this.realtime.emitServerEvent(serverId, "rolesChanged", {
      serverId,
      userId: targetUserId,
    });
    return { success: true };
  }

  /* ── Internal helpers ───────────────────────────────────── */

  private async assertServerExists(serverId: string): Promise<void> {
    const [srv] = await this.db
      .select({ serverId: servers.serverId })
      .from(servers)
      .where(eq(servers.serverId, serverId))
      .limit(1);
    if (!srv) throw new NotFoundException("Server not found");
  }

  /** Membership: holds any permission set OR is a member (organizer/role). */
  private async assertServerMember(serverId: string, userId: string): Promise<void> {
    await this.assertServerExists(serverId);
    const [role] = await this.db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(serverRoles, eq(serverRoles.serverRoleId, userRoles.serverRoleId))
      .where(and(eq(serverRoles.serverId, serverId), eq(userRoles.userId, userId)))
      .limit(1);
    if (role) return;

    const [own] = await this.db
      .select({ orgId: hackathons.organizationId })
      .from(servers)
      .innerJoin(hackathons, eq(hackathons.hackathonId, servers.hackathonId))
      .where(eq(servers.serverId, serverId))
      .limit(1);
    if (own?.orgId === userId) return;
    throw new NotFoundException("You are not a member of this server");
  }

  /** Validate the role exists AND belongs to this server (404 otherwise). */
  private async assertRoleInServer(serverId: string, roleId: string): Promise<void> {
    const [role] = await this.db
      .select({ serverRoleId: serverRoles.serverRoleId })
      .from(serverRoles)
      .where(and(eq(serverRoles.serverRoleId, roleId), eq(serverRoles.serverId, serverId)))
      .limit(1);
    if (!role) throw new NotFoundException("Role not found on this server");
  }

  /** Map permission NAMES → ids, rejecting any name not in the catalog. */
  private async resolvePermissionIds(names: string[]): Promise<string[]> {
    const unique = [...new Set(names)];
    if (unique.length === 0) return [];
    const rows = await this.db
      .select({ permissionId: permissions.permissionId, name: permissions.name })
      .from(permissions)
      .where(inArray(permissions.name, unique));
    const found = new Set(rows.map((r) => r.name));
    const missing = unique.filter((n) => !found.has(n));
    if (missing.length > 0) {
      throw new BadRequestException(`Unknown permission(s): ${missing.join(", ")}`);
    }
    return rows.map((r) => r.permissionId);
  }

  private async getRoleDto(serverId: string, roleId: string): Promise<ServerRoleDto> {
    const [role] = await this.db
      .select({
        serverRoleId: serverRoles.serverRoleId,
        name: serverRoles.name,
        createdAt: serverRoles.createdAt,
      })
      .from(serverRoles)
      .where(eq(serverRoles.serverRoleId, roleId))
      .limit(1);
    if (!role) throw new NotFoundException("Role not found on this server");

    const permRows = await this.db
      .select({ name: permissions.name })
      .from(serverRolePermissions)
      .innerJoin(permissions, eq(permissions.permissionId, serverRolePermissions.permissionId))
      .where(eq(serverRolePermissions.serverRoleId, roleId));

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(userRoles)
      .where(eq(userRoles.serverRoleId, roleId));

    return {
      serverRoleId: role.serverRoleId,
      name: role.name,
      permissions: permRows.map((p) => p.name).sort(),
      memberCount: Number(count),
      createdAt: role.createdAt.toISOString(),
    };
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
