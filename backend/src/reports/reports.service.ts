import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { AuthzService } from "../common/authz.service";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { reports, users } from "../db/schema";
import type {
  CreateReportInput,
  ListReportsQuery,
  ResolveReportInput,
} from "./dto";

export type ReportTargetType =
  | "user"
  | "post"
  | "comment"
  | "message"
  | "hackathon";
export type ReportStatus = "pending" | "reviewed" | "resolved" | "dismissed";

export interface ReportDto {
  reportId: string;
  reporterId: string;
  reporterUsername: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
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
  reason: string;
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
  ) {}

  async create(
    reporterId: string,
    input: CreateReportInput,
  ): Promise<ReportDto> {
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

  async list(
    userId: string,
    query: ListReportsQuery,
  ): Promise<ListReportsResponse> {
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

    const [totalRow] = await this.db
      .select({ value: count() })
      .from(reports);

    return {
      reports: rows.map(toReportDto),
      stats: {
        open: openRow.value,
        resolvedToday: resolvedTodayRow.value,
        total: totalRow.value,
      },
    };
  }

  async resolve(
    reviewerId: string,
    reportId: string,
    input: ResolveReportInput,
  ): Promise<ReportDto> {
    await this.authz.assertAdmin(reviewerId);
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

    const [row] = await this.db
      .select(reportColumns)
      .from(reports)
      .innerJoin(users, eq(reports.reporterId, users.userId))
      .where(eq(reports.reportId, reportId))
      .limit(1);

    return toReportDto(row);
  }
}
