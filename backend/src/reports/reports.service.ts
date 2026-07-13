import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { AdminService } from "../admin/admin.service";
import { AuthzService } from "../common/authz.service";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { comments, posts, reports, users } from "../db/schema";
import { EngagementService } from "../engagement/engagement.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PostsService } from "../posts/posts.service";
import type { CreateReportInput, ListReportsQuery, ResolveReportInput } from "./dto";

export type ReportTargetType = "user" | "post" | "comment" | "message" | "hackathon";
export type ReportStatus = "pending" | "reviewed" | "resolved" | "dismissed";
export type ReportCategory = "spam" | "harassment" | "inappropriate_content" | "other";

export interface ReportDto {
  reportId: string;
  reporterId: string;
  reporterUsername: string;
  targetType: ReportTargetType;
  targetId: string;
  category: ReportCategory;
  reason: string | null;
  status: ReportStatus;
  resolutionNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface ReportStats {
  open: number;
  resolvedToday: number;
  total: number;
}

export interface ListReportsResponse {
  reports: ReportDto[];
  stats: ReportStats;
}

interface ReportRow {
  reportId: string;
  reporterId: string;
  reporterUsername: string;
  targetType: ReportTargetType;
  targetId: string;
  category: ReportCategory;
  reason: string | null;
  status: ReportStatus;
  resolutionNote: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
}

const reportColumns = {
  reportId: reports.reportId,
  reporterId: reports.reporterId,
  reporterUsername: users.username,
  targetType: reports.targetType,
  targetId: reports.targetId,
  category: reports.category,
  reason: reports.reason,
  status: reports.status,
  resolutionNote: reports.resolutionNote,
  createdAt: reports.createdAt,
  reviewedAt: reports.reviewedAt,
};

function toReportDto(r: ReportRow): ReportDto {
  return {
    reportId: r.reportId,
    reporterId: r.reporterId,
    reporterUsername: r.reporterUsername,
    targetType: r.targetType,
    targetId: r.targetId,
    category: r.category,
    reason: r.reason,
    status: r.status,
    resolutionNote: r.resolutionNote,
    createdAt: r.createdAt.toISOString(),
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
  };
}

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly authz: AuthzService,
    private readonly posts: PostsService,
    private readonly engagement: EngagementService,
    private readonly admin: AdminService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(reporterId: string, input: CreateReportInput): Promise<ReportDto> {
    const existing = await this.db
      .select({ reportId: reports.reportId })
      .from(reports)
      .where(
        and(
          eq(reports.reporterId, reporterId),
          eq(reports.targetType, input.targetType),
          eq(reports.targetId, input.targetId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException("You have already reported this target");
    }

    let inserted: { reportId: string };
    try {
      const [row] = await this.db
        .insert(reports)
        .values({
          reporterId,
          targetType: input.targetType,
          targetId: input.targetId,
          category: input.category,
          reason: input.reason,
          status: "pending",
        })
        .returning({ reportId: reports.reportId });
      inserted = row;
    } catch {
      // Unique index race: reporter + target already exists.
      throw new ConflictException("You have already reported this target");
    }

    const [created] = await this.db
      .select(reportColumns)
      .from(reports)
      .innerJoin(users, eq(reports.reporterId, users.userId))
      .where(eq(reports.reportId, inserted.reportId))
      .limit(1);

    return toReportDto(created);
  }

  async list(userId: string, query: ListReportsQuery): Promise<ListReportsResponse> {
    await this.authz.assertAdmin(userId);
    const baseWhere =
      query.status === "all"
        ? undefined
        : query.status === "pending"
          ? eq(reports.status, "pending")
          : inArray(reports.status, ["resolved", "dismissed"]);

    const rows = await this.db
      .select(reportColumns)
      .from(reports)
      .innerJoin(users, eq(reports.reporterId, users.userId))
      .where(baseWhere)
      .orderBy(desc(reports.createdAt))
      .limit(200);

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const [openRow] = await this.db
      .select({ value: count() })
      .from(reports)
      .where(eq(reports.status, "pending"));

    const [resolvedTodayRow] = await this.db
      .select({ value: count() })
      .from(reports)
      .where(
        and(
          inArray(reports.status, ["resolved", "dismissed"]),
          gte(reports.reviewedAt, startOfToday),
        ),
      );

    const [totalRow] = await this.db.select({ value: count() }).from(reports);

    return {
      reports: rows.map(toReportDto),
      stats: {
        open: openRow.value,
        resolvedToday: resolvedTodayRow.value,
        total: totalRow.value,
      },
    };
  }

  /** The user id whose content is being reported, for banning purposes. */
  private async resolveAuthorId(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<string | null> {
    if (targetType === "user") return targetId;
    if (targetType === "post") {
      const [row] = await this.db
        .select({ userId: posts.userId })
        .from(posts)
        .where(eq(posts.postId, targetId))
        .limit(1);
      return row?.userId ?? null;
    }
    if (targetType === "comment") {
      const [row] = await this.db
        .select({ userId: comments.userId })
        .from(comments)
        .where(eq(comments.commentId, targetId))
        .limit(1);
      return row?.userId ?? null;
    }
    throw new BadRequestException("Banning is not supported for this report's target type");
  }

  private async removeContent(
    targetType: ReportTargetType,
    targetId: string,
    reviewerId: string,
  ): Promise<void> {
    if (targetType === "post") {
      await this.posts.remove(reviewerId, targetId).catch((err) => {
        if (!(err instanceof NotFoundException)) throw err;
      });
      return;
    }
    if (targetType === "comment") {
      await this.engagement.deleteComment(reviewerId, targetId).catch((err) => {
        if (!(err instanceof NotFoundException)) throw err;
      });
      return;
    }
    throw new BadRequestException("Content removal is not supported for this report's target type");
  }

  async resolve(
    reviewerId: string,
    reportId: string,
    input: ResolveReportInput,
  ): Promise<ReportDto> {
    await this.authz.assertAdmin(reviewerId);

    const [report] = await this.db
      .select(reportColumns)
      .from(reports)
      .innerJoin(users, eq(reports.reporterId, users.userId))
      .where(eq(reports.reportId, reportId))
      .limit(1);
    if (!report) {
      throw new NotFoundException("Report not found");
    }

    if (input.status === "resolved" && input.removeContent) {
      await this.removeContent(report.targetType, report.targetId, reviewerId);
    }

    if (input.status === "resolved" && input.banUser) {
      const authorId = await this.resolveAuthorId(report.targetType, report.targetId);
      if (authorId) {
        await this.admin
          .banUser(reviewerId, authorId, { reason: input.note ?? `Resolved report ${reportId}` })
          .catch((err) => {
            // Already banned by another report/action — not fatal, resolution continues.
            if (!(err instanceof ConflictException)) throw err;
          });
      }
    }

    const reviewedAt = new Date();
    const [updated] = await this.db
      .update(reports)
      .set({
        status: input.status,
        reviewedBy: reviewerId,
        reviewedAt,
        resolutionNote: input.note ?? null,
      })
      .where(eq(reports.reportId, reportId))
      .returning({ reportId: reports.reportId });

    if (!updated) {
      throw new NotFoundException("Report not found");
    }

    // Deliberately scoped to just this one report: other pending reports on
    // the same target are left untouched (no auto-close), even when this
    // resolution results in the content being removed or the user banned.
    await this.notifications.create({
      userId: report.reporterId,
      type: input.status === "resolved" ? "report_resolved" : "report_dismissed",
      title: input.status === "resolved" ? "Prijava rešena" : "Prijava odbačena",
      body: this.notificationBody(input),
      entityType: report.targetType,
      entityId: report.targetId,
    });

    const [row] = await this.db
      .select(reportColumns)
      .from(reports)
      .innerJoin(users, eq(reports.reporterId, users.userId))
      .where(eq(reports.reportId, reportId))
      .limit(1);

    return toReportDto(row);
  }

  private notificationBody(input: ResolveReportInput): string {
    if (input.status === "dismissed") {
      return "Vaša prijava je pregledana. Nije pronađena povreda pravila.";
    }
    if (input.removeContent && input.banUser) {
      return "Prijavljeni sadržaj je uklonjen, a korisnik je banovan.";
    }
    if (input.removeContent) {
      return "Prijavljeni sadržaj je uklonjen.";
    }
    if (input.banUser) {
      return "Prijavljeni korisnik je banovan.";
    }
    return "Vaša prijava je pregledana i rešena.";
  }
}
