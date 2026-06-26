import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { AuthzService } from "../common/authz.service";
import { DAY_MS } from "../common/constants";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import {
  appeals,
  auditLog,
  hackathons,
  organizations,
  posts,
  reports,
  teams,
  userBans,
  users,
} from "../db/schema";
import type {
  BanUserInput,
  ListUsersQuery,
  RejectOrgInput,
  ResolveAppealInput,
} from "./dto";

export type AdminUserRole = "admin" | "organization" | "member";
export type OrgVerificationStatus = "pending" | "approved" | "rejected";

export interface AdminMetrics {
  totalUsers: number;
  newRegistrations7d: number;
  activeHackathons: number;
  openReports: number;
  /** New registrations per day for the last 7 days (oldest first). */
  activity: { date: string; count: number }[];
  /** Content reports grouped by target type over the last 30 days. */
  reportsByCategory: { category: string; count: number }[];
  health: AdminHealth;
}

export interface AdminHealth {
  totalPosts: number;
  totalTeams: number;
  totalHackathons: number;
  pendingAppeals: number;
  bannedUsers: number;
}

export interface UserRowDto {
  userId: string;
  username: string;
  email: string;
  role: AdminUserRole;
  banned: boolean;
  createdAt: string;
}

export interface OrgDto {
  userId: string;
  name: string;
  websiteUrl: string | null;
  contactEmail: string | null;
  verificationStatus: OrgVerificationStatus;
  reviewedAt: string | null;
}

export interface OrganizationsResponse {
  pending: OrgDto[];
  verified: OrgDto[];
}

export interface SuccessResponse {
  success: true;
}

export interface AuditEntryDto {
  logId: string;
  actorUsername: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  summary: string;
  createdAt: string;
}

export type AppealStatus = "pending" | "approved" | "rejected";

export interface AppealDto {
  appealId: string;
  userId: string;
  username: string;
  reason: string;
  status: AppealStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface AppealsResponse {
  pending: AppealDto[];
  closed: AppealDto[];
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly authz: AuthzService,
  ) {}

  /** Append an entry to the moderation audit log (best-effort, non-blocking). */
  private async audit(
    actorId: string,
    action: string,
    targetType: string | null,
    targetId: string | null,
    summary: string,
  ): Promise<void> {
    await this.db
      .insert(auditLog)
      .values({ actorId, action, targetType, targetId, summary });
  }

  async getMetrics(callerId: string): Promise<AdminMetrics> {
    await this.authz.assertAdmin(callerId);

    const since = new Date(Date.now() - 7 * DAY_MS);

    const [totalUsersRow] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(users)
      .where(isNull(users.deletedAt));

    const [newRegistrationsRow] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(users)
      .where(and(isNull(users.deletedAt), gte(users.createdAt, since)));

    const [activeHackathonsRow] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(hackathons)
      .where(inArray(hackathons.status, ["ongoing", "upcoming"]));

    const [openReportsRow] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(reports)
      .where(eq(reports.status, "pending"));

    // ── Activity: new registrations bucketed by day (last 7 days) ──
    const activityRows = await this.db
      .select({
        date: sql<string>`to_char(date_trunc('day', ${users.createdAt}), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(and(isNull(users.deletedAt), gte(users.createdAt, since)))
      .groupBy(sql`1`);
    const byDate = new Map(
      activityRows.map((r) => [r.date, Number(r.count)]),
    );
    const activity: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const key = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10);
      activity.push({ date: key, count: byDate.get(key) ?? 0 });
    }

    // ── Reports grouped by category (last 30 days) ──
    const reportsByCategoryRows = await this.db
      .select({
        category: reports.targetType,
        count: sql<number>`count(*)::int`,
      })
      .from(reports)
      .where(gte(reports.createdAt, new Date(Date.now() - 30 * DAY_MS)))
      .groupBy(reports.targetType);
    const reportsByCategory = reportsByCategoryRows.map((r) => ({
      category: r.category as string,
      count: Number(r.count),
    }));

    // ── System health counts ──
    const [postsRow] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(posts)
      .where(isNull(posts.deletedAt));
    const [teamsRow] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(teams)
      .where(isNull(teams.deletedAt));
    const [hkCountRow] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(hackathons);
    const totalPosts = postsRow?.value ?? 0;
    const totalTeams = teamsRow?.value ?? 0;
    const totalHackathons = hkCountRow?.value ?? 0;
    const [pendingAppealsRow] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(appeals)
      .where(eq(appeals.status, "pending"));
    const [bannedUsersRow] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(userBans)
      .where(isNull(userBans.liftedAt));

    return {
      totalUsers: totalUsersRow?.value ?? 0,
      newRegistrations7d: newRegistrationsRow?.value ?? 0,
      activeHackathons: activeHackathonsRow?.value ?? 0,
      openReports: openReportsRow?.value ?? 0,
      activity,
      reportsByCategory,
      health: {
        totalPosts,
        totalTeams,
        totalHackathons,
        pendingAppeals: pendingAppealsRow?.value ?? 0,
        bannedUsers: bannedUsersRow?.value ?? 0,
      },
    };
  }

  async listUsers(
    callerId: string,
    query: ListUsersQuery,
  ): Promise<UserRowDto[]> {
    await this.authz.assertAdmin(callerId);

    const conditions = [isNull(users.deletedAt)];
    if (query.search) {
      const pattern = `%${query.search}%`;
      const searchClause = or(
        ilike(users.username, pattern),
        ilike(users.email, pattern),
      );
      if (searchClause) conditions.push(searchClause);
    }

    const rows = await this.db
      .select({
        userId: users.userId,
        username: users.username,
        email: users.email,
        createdAt: users.createdAt,
        isAdmin: sql<boolean>`exists (select 1 from administrators a where a.user_id = ${users.userId})`,
        isOrg: sql<boolean>`exists (select 1 from organizations o where o.user_id = ${users.userId})`,
        banned: sql<boolean>`exists (select 1 from user_bans b where b.user_id = ${users.userId} and b.lifted_at is null)`,
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(users.username)
      .limit(100);

    return rows.map((r) => ({
      userId: r.userId,
      username: r.username,
      email: r.email,
      role: r.isAdmin ? "admin" : r.isOrg ? "organization" : "member",
      banned: r.banned,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async listOrganizations(callerId: string): Promise<OrganizationsResponse> {
    await this.authz.assertAdmin(callerId);

    const rows = await this.db
      .select({
        userId: organizations.userId,
        name: organizations.name,
        websiteUrl: organizations.websiteUrl,
        contactEmail: organizations.contactEmail,
        verificationStatus: organizations.verificationStatus,
        reviewedAt: organizations.reviewedAt,
      })
      .from(organizations)
      .orderBy(organizations.name);

    const mapped = rows.map(
      (r): OrgDto => ({
        userId: r.userId,
        name: r.name,
        websiteUrl: r.websiteUrl,
        contactEmail: r.contactEmail,
        verificationStatus: r.verificationStatus,
        reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      }),
    );

    return {
      pending: mapped.filter((o) => o.verificationStatus === "pending"),
      verified: mapped.filter((o) => o.verificationStatus === "approved"),
    };
  }

  async verifyOrganization(
    callerId: string,
    targetUserId: string,
  ): Promise<OrgDto> {
    await this.authz.assertAdmin(callerId);

    const now = new Date();
    const [row] = await this.db
      .update(organizations)
      .set({
        verificationStatus: "approved",
        reviewedBy: callerId,
        reviewedAt: now,
        rejectionReason: null,
      })
      .where(eq(organizations.userId, targetUserId))
      .returning({
        userId: organizations.userId,
        name: organizations.name,
        websiteUrl: organizations.websiteUrl,
        contactEmail: organizations.contactEmail,
        verificationStatus: organizations.verificationStatus,
        reviewedAt: organizations.reviewedAt,
      });

    if (!row) {
      throw new NotFoundException("Organization not found");
    }

    await this.audit(
      callerId,
      "org.verify",
      "organization",
      targetUserId,
      `Verified organization "${row.name}"`,
    );

    return {
      userId: row.userId,
      name: row.name,
      websiteUrl: row.websiteUrl,
      contactEmail: row.contactEmail,
      verificationStatus: row.verificationStatus,
      reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    };
  }

  async rejectOrganization(
    callerId: string,
    targetUserId: string,
    body: RejectOrgInput,
  ): Promise<OrgDto> {
    await this.authz.assertAdmin(callerId);

    const now = new Date();
    const [row] = await this.db
      .update(organizations)
      .set({
        verificationStatus: "rejected",
        rejectionReason: body.reason,
        reviewedBy: callerId,
        reviewedAt: now,
      })
      .where(eq(organizations.userId, targetUserId))
      .returning({
        userId: organizations.userId,
        name: organizations.name,
        websiteUrl: organizations.websiteUrl,
        contactEmail: organizations.contactEmail,
        verificationStatus: organizations.verificationStatus,
        reviewedAt: organizations.reviewedAt,
      });

    if (!row) {
      throw new NotFoundException("Organization not found");
    }

    await this.audit(
      callerId,
      "org.reject",
      "organization",
      targetUserId,
      `Rejected organization "${row.name}": ${body.reason}`,
    );

    return {
      userId: row.userId,
      name: row.name,
      websiteUrl: row.websiteUrl,
      contactEmail: row.contactEmail,
      verificationStatus: row.verificationStatus,
      reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    };
  }

  async banUser(
    callerId: string,
    targetUserId: string,
    body: BanUserInput,
  ): Promise<SuccessResponse> {
    await this.authz.assertAdmin(callerId);

    const [target] = await this.db
      .select({ userId: users.userId })
      .from(users)
      .where(eq(users.userId, targetUserId))
      .limit(1);
    if (!target) {
      throw new NotFoundException("User not found");
    }

    const [existing] = await this.db
      .select({ banId: userBans.banId })
      .from(userBans)
      .where(
        and(eq(userBans.userId, targetUserId), isNull(userBans.liftedAt)),
      )
      .limit(1);
    if (existing) {
      throw new ConflictException("User already has an active ban");
    }

    await this.db.insert(userBans).values({
      userId: targetUserId,
      bannedBy: callerId,
      reason: body.reason,
    });

    await this.audit(
      callerId,
      "user.ban",
      "user",
      targetUserId,
      `Banned user: ${body.reason}`,
    );

    return { success: true };
  }

  async unbanUser(
    callerId: string,
    targetUserId: string,
  ): Promise<SuccessResponse> {
    await this.authz.assertAdmin(callerId);

    const now = new Date();
    const [lifted] = await this.db
      .update(userBans)
      .set({ liftedAt: now, liftedBy: callerId })
      .where(
        and(eq(userBans.userId, targetUserId), isNull(userBans.liftedAt)),
      )
      .returning({ banId: userBans.banId });

    if (!lifted) {
      throw new NotFoundException("No active ban found for this user");
    }

    await this.audit(
      callerId,
      "user.unban",
      "user",
      targetUserId,
      "Lifted the user's active ban",
    );

    return { success: true };
  }

  /* ── Audit log ────────────────────────────────────────────── */

  async listAudit(
    callerId: string,
    search?: string,
  ): Promise<AuditEntryDto[]> {
    await this.authz.assertAdmin(callerId);

    const where = search
      ? or(
          ilike(auditLog.summary, `%${search}%`),
          ilike(auditLog.action, `%${search}%`),
        )
      : undefined;

    const rows = await this.db
      .select({
        logId: auditLog.logId,
        actorUsername: users.username,
        action: auditLog.action,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
        summary: auditLog.summary,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.userId, auditLog.actorId))
      .where(where)
      .orderBy(sql`${auditLog.createdAt} desc`)
      .limit(100);

    return rows.map((r) => ({
      logId: r.logId,
      actorUsername: r.actorUsername,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      summary: r.summary,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /* ── Appeals ──────────────────────────────────────────────── */

  async listAppeals(callerId: string): Promise<AppealsResponse> {
    await this.authz.assertAdmin(callerId);

    const rows = await this.db
      .select({
        appealId: appeals.appealId,
        userId: appeals.userId,
        username: users.username,
        reason: appeals.reason,
        status: appeals.status,
        reviewNote: appeals.reviewNote,
        reviewedAt: appeals.reviewedAt,
        createdAt: appeals.createdAt,
      })
      .from(appeals)
      .innerJoin(users, eq(users.userId, appeals.userId))
      .orderBy(sql`${appeals.createdAt} desc`)
      .limit(100);

    const mapped = rows.map(
      (r): AppealDto => ({
        appealId: r.appealId,
        userId: r.userId,
        username: r.username,
        reason: r.reason,
        status: r.status,
        reviewNote: r.reviewNote,
        reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      }),
    );

    return {
      pending: mapped.filter((a) => a.status === "pending"),
      closed: mapped.filter((a) => a.status !== "pending"),
    };
  }

  async resolveAppeal(
    callerId: string,
    appealId: string,
    body: ResolveAppealInput,
  ): Promise<AppealDto> {
    await this.authz.assertAdmin(callerId);

    const [appeal] = await this.db
      .select({
        appealId: appeals.appealId,
        userId: appeals.userId,
        status: appeals.status,
      })
      .from(appeals)
      .where(eq(appeals.appealId, appealId))
      .limit(1);
    if (!appeal) throw new NotFoundException("Appeal not found");
    if (appeal.status !== "pending") {
      throw new ConflictException("Appeal already resolved");
    }

    const approve = body.decision === "approve";
    const now = new Date();

    // Approving an appeal lifts the user's active ban (if any).
    if (approve) {
      await this.db
        .update(userBans)
        .set({ liftedAt: now, liftedBy: callerId })
        .where(
          and(eq(userBans.userId, appeal.userId), isNull(userBans.liftedAt)),
        );
    }

    const [updated] = await this.db
      .update(appeals)
      .set({
        status: approve ? "approved" : "rejected",
        reviewedBy: callerId,
        reviewedAt: now,
        reviewNote: body.note ?? null,
      })
      .where(eq(appeals.appealId, appealId))
      .returning();

    const [user] = await this.db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.userId, appeal.userId))
      .limit(1);

    await this.audit(
      callerId,
      approve ? "appeal.approve" : "appeal.reject",
      "user",
      appeal.userId,
      `${approve ? "Approved" : "Rejected"} ban appeal for ${user?.username ?? "user"}`,
    );

    return {
      appealId: updated.appealId,
      userId: updated.userId,
      username: user?.username ?? "",
      reason: updated.reason,
      status: updated.status,
      reviewNote: updated.reviewNote,
      reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
    };
  }
}
