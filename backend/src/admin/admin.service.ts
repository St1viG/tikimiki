import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AuthzService } from "../common/authz.service";
import { DAY_MS } from "../common/constants";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { MailService } from "../mail/mail.service";
import {
  appeals,
  auditLog,
  hackathons,
  organizations,
  posts,
  reports,
  servers,
  teams,
  userBans,
  users,
} from "../db/schema";
import type { BanUserInput, ListUsersQuery, RejectOrgInput, ResolveAppealInput } from "./dto";

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

/** One row in the admin panel's directory of per-hackathon moderator pages. */
export interface ModerationServerDto {
  hackathonId: string;
  hackathonTitle: string;
  serverId: string;
  organizationName: string;
  openReportCount: number;
}

export interface OrgDto {
  userId: string;
  name: string;
  websiteUrl: string | null;
  contactEmail: string | null;
  verificationStatus: OrgVerificationStatus;
  reviewedAt: string | null;
  rejectionReason: string | null;
  /** Owning account details shown on the request (SSU2 review step). */
  username: string;
  accountEmail: string;
  /** The request is created at registration, so this is the account createdAt. */
  submittedAt: string;
}

export interface OrganizationsResponse {
  pending: OrgDto[];
  verified: OrgDto[];
  rejected: OrgDto[];
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
    private readonly mail: MailService,
  ) {}

  /**
   * Emails an organization about a verification outcome, preferring its
   * `contactEmail` and falling back to the owning user's account email.
   * Best-effort — logs and swallows any failure so it never blocks the
   * verify/reject flow.
   */
  private async notifyOrgVerification(
    targetUserId: string,
    contactEmail: string | null,
    subject: string,
    body: string,
  ): Promise<void> {
    try {
      let to = contactEmail;
      if (!to) {
        const [user] = await this.db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.userId, targetUserId))
          .limit(1);
        to = user?.email ?? null;
      }
      if (to) {
        await this.mail.sendMail(to, subject, `<p>${body}</p>`);
      }
    } catch (err) {
      console.error(`[admin] failed to send org verification email to user ${targetUserId}:`, err);
    }
  }

  /** Append an entry to the moderation audit log (best-effort, non-blocking). */
  private async audit(
    actorId: string,
    action: string,
    targetType: string | null,
    targetId: string | null,
    summary: string,
  ): Promise<void> {
    await this.db.insert(auditLog).values({ actorId, action, targetType, targetId, summary });
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
    const byDate = new Map(activityRows.map((r) => [r.date, Number(r.count)]));
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
      .where(
        and(
          isNull(userBans.liftedAt),
          or(isNull(userBans.expiresAt), gte(userBans.expiresAt, new Date())),
        ),
      );

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

  async listUsers(callerId: string, query: ListUsersQuery): Promise<UserRowDto[]> {
    await this.authz.assertAdmin(callerId);

    // Aliased so the correlated EXISTS subqueries below qualify the outer
    // user_id as "u"."user_id" — left unaliased, drizzle emits a bare
    // "user_id" that Postgres resolves against the subquery's OWN table
    // (which also has a user_id column), turning e.g. "does this admin row
    // belong to this user" into "does any admin row exist" for every user.
    const u = alias(users, "u");

    const conditions = [isNull(u.deletedAt)];
    if (query.search) {
      const pattern = `%${query.search}%`;
      const searchClause = or(ilike(u.username, pattern), ilike(u.email, pattern));
      if (searchClause) conditions.push(searchClause);
    }

    const rows = await this.db
      .select({
        userId: u.userId,
        username: u.username,
        email: u.email,
        createdAt: u.createdAt,
        isAdmin: sql<boolean>`exists (select 1 from administrators a where a.user_id = u.user_id)`,
        isOrg: sql<boolean>`exists (select 1 from organizations o where o.user_id = u.user_id)`,
        banned: sql<boolean>`exists (select 1 from user_bans b where b.user_id = u.user_id and b.lifted_at is null and (b.expires_at is null or b.expires_at > now()))`,
      })
      .from(u)
      .where(and(...conditions))
      .orderBy(u.username)
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

  /**
   * Every hackathon's Cohor server, for the admin panel's "moderator pages"
   * directory (each row deep-links to /moderator?server=<serverId>).
   */
  async listModerationServers(callerId: string): Promise<ModerationServerDto[]> {
    await this.authz.assertAdmin(callerId);

    // Aliased for the same reason as listUsers above: the correlated count
    // subquery has its own channel_groups.server_id column, so the outer
    // reference must be qualified as "srv"."server_id" (written literally
    // below, not interpolated) or Postgres resolves it against the subquery.
    const srv = alias(servers, "srv");

    const rows = await this.db
      .select({
        hackathonId: hackathons.hackathonId,
        hackathonTitle: hackathons.title,
        serverId: srv.serverId,
        organizationName: organizations.name,
        openReportCount: sql<number>`(
          select count(*)::int
          from reports r
          inner join channel_messages cm on cm.message_id = r.target_id
          inner join channels c on c.channel_id = cm.channel_id
          inner join channel_groups cg on cg.group_id = c.group_id
          where r.target_type = 'message'
            and cg.server_id = srv.server_id
            and r.status = 'pending'
        )`,
      })
      .from(srv)
      .innerJoin(hackathons, eq(hackathons.hackathonId, srv.hackathonId))
      .innerJoin(organizations, eq(organizations.userId, hackathons.organizationId))
      .orderBy(hackathons.title);

    return rows;
  }

  /** Select one organization joined with its owning account, as an OrgDto. */
  private async orgDto(targetUserId: string): Promise<OrgDto | null> {
    const [r] = await this.orgRowsQuery().where(eq(organizations.userId, targetUserId)).limit(1);
    return r ? this.toOrgDto(r) : null;
  }

  private orgRowsQuery() {
    return this.db
      .select({
        userId: organizations.userId,
        name: organizations.name,
        websiteUrl: organizations.websiteUrl,
        contactEmail: organizations.contactEmail,
        verificationStatus: organizations.verificationStatus,
        reviewedAt: organizations.reviewedAt,
        rejectionReason: organizations.rejectionReason,
        username: users.username,
        accountEmail: users.email,
        submittedAt: users.createdAt,
      })
      .from(organizations)
      .innerJoin(users, eq(organizations.userId, users.userId));
  }

  private toOrgDto(r: {
    userId: string;
    name: string;
    websiteUrl: string | null;
    contactEmail: string | null;
    verificationStatus: OrgVerificationStatus;
    reviewedAt: Date | null;
    rejectionReason: string | null;
    username: string;
    accountEmail: string;
    submittedAt: Date;
  }): OrgDto {
    return {
      userId: r.userId,
      name: r.name,
      websiteUrl: r.websiteUrl,
      contactEmail: r.contactEmail,
      verificationStatus: r.verificationStatus,
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      rejectionReason: r.rejectionReason,
      username: r.username,
      accountEmail: r.accountEmail,
      submittedAt: r.submittedAt.toISOString(),
    };
  }

  async listOrganizations(callerId: string): Promise<OrganizationsResponse> {
    await this.authz.assertAdmin(callerId);

    const rows = await this.orgRowsQuery().orderBy(organizations.name);
    const mapped = rows.map((r) => this.toOrgDto(r));

    // All three states are listed so the admin sees the full request history
    // (SSU2 step 3: pending / approved / rejected).
    return {
      pending: mapped.filter((o) => o.verificationStatus === "pending"),
      verified: mapped.filter((o) => o.verificationStatus === "approved"),
      rejected: mapped.filter((o) => o.verificationStatus === "rejected"),
    };
  }

  async verifyOrganization(callerId: string, targetUserId: string): Promise<OrgDto> {
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
      .returning({ name: organizations.name, contactEmail: organizations.contactEmail });

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

    await this.notifyOrgVerification(
      targetUserId,
      row.contactEmail,
      "Organizacija verifikovana",
      `Vaša organizacija „${row.name}" je verifikovana.`,
    );

    return (await this.orgDto(targetUserId))!;
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
      .returning({ name: organizations.name, contactEmail: organizations.contactEmail });

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

    await this.notifyOrgVerification(
      targetUserId,
      row.contactEmail,
      "Organizacija odbijena",
      `Vaša organizacija „${row.name}" je odbijena. Razlog: ${body.reason}`,
    );

    return (await this.orgDto(targetUserId))!;
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

    // Optional time-limited ban (SSU21): the expiry must lie in the future.
    const now = new Date();
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestException("Ban expiry must be in the future");
    }

    // An expired-but-not-yet-swept ban still holds the "one active ban per
    // user" partial unique index; mark it lifted so a new ban can be issued.
    await this.db
      .update(userBans)
      .set({ liftedAt: now })
      .where(
        and(
          eq(userBans.userId, targetUserId),
          isNull(userBans.liftedAt),
          lte(userBans.expiresAt, now),
        ),
      );

    const [existing] = await this.db
      .select({ banId: userBans.banId })
      .from(userBans)
      .where(and(eq(userBans.userId, targetUserId), isNull(userBans.liftedAt)))
      .limit(1);
    if (existing) {
      throw new ConflictException("User already has an active ban");
    }

    await this.db.insert(userBans).values({
      userId: targetUserId,
      bannedBy: callerId,
      reason: body.reason,
      expiresAt,
    });

    await this.audit(
      callerId,
      "user.ban",
      "user",
      targetUserId,
      `Banned user${expiresAt ? ` until ${expiresAt.toISOString()}` : " permanently"}: ${body.reason}`,
    );

    return { success: true };
  }

  async unbanUser(callerId: string, targetUserId: string): Promise<SuccessResponse> {
    await this.authz.assertAdmin(callerId);

    const now = new Date();
    const [lifted] = await this.db
      .update(userBans)
      .set({ liftedAt: now, liftedBy: callerId })
      .where(and(eq(userBans.userId, targetUserId), isNull(userBans.liftedAt)))
      .returning({ banId: userBans.banId });

    if (!lifted) {
      throw new NotFoundException("No active ban found for this user");
    }

    await this.audit(callerId, "user.unban", "user", targetUserId, "Lifted the user's active ban");

    return { success: true };
  }

  /* ── Audit log ────────────────────────────────────────────── */

  async listAudit(callerId: string, search?: string): Promise<AuditEntryDto[]> {
    await this.authz.assertAdmin(callerId);

    const where = search
      ? or(ilike(auditLog.summary, `%${search}%`), ilike(auditLog.action, `%${search}%`))
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

    const mapped = rows.map((r): AppealDto => ({
      appealId: r.appealId,
      userId: r.userId,
      username: r.username,
      reason: r.reason,
      status: r.status,
      reviewNote: r.reviewNote,
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));

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
        .where(and(eq(userBans.userId, appeal.userId), isNull(userBans.liftedAt)));
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
