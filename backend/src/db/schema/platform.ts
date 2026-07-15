import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  appealStatus,
  entityType,
  notificationType,
  reportCategory,
  reportStatus,
  reportTargetType,
} from "./_enums";
import { administrators, userBans, users } from "./identity";

const tz = { withTimezone: true } as const;

/* ── reports ──────────────────────────────────────────────── */
export const reports = pgTable(
  "reports",
  {
    reportId: uuid("report_id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    targetType: reportTargetType("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    // Default "other" exists only to satisfy NOT NULL during the migration that
    // added this column to an existing table; the app layer always sends an
    // explicit value via createReportSchema and never relies on this default.
    category: reportCategory("category").notNull().default("other"),
    reason: text("reason"),
    status: reportStatus("status").notNull().default("pending"),
    // reviewedBy references users (not administrators) because message reports
    // can be resolved by a hackathon organizer or server Moderator, not only
    // by platform admins — see ReportsService.resolve() for the access check.
    reviewedBy: uuid("reviewed_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", tz),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_reports_reporter_target").on(t.reporterId, t.targetType, t.targetId),
    check(
      "chk_reports_review_consistency",
      sql`(${t.reviewedAt} is null) = (${t.reviewedBy} is null)`,
    ),
    check(
      "chk_reports_resolution_note",
      sql`${t.resolutionNote} is null or ${t.status} in ('resolved', 'dismissed')`,
    ),
    index("idx_reports_status").on(t.status),
    index("idx_reports_reporter_id").on(t.reporterId),
    index("idx_reports_target").on(t.targetType, t.targetId),
  ],
);

/* ── notifications ────────────────────────────────────────── */
export const notifications = pgTable(
  "notifications",
  {
    notificationId: uuid("notification_id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    type: notificationType("type").notNull(),
    title: varchar("title", { length: 100 }).notNull(),
    body: text("body"),
    entityType: entityType("entity_type"),
    entityId: uuid("entity_id"),
    readAt: timestamp("read_at", tz),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [
    check(
      "chk_notifications_entity_consistency",
      sql`(${t.entityType} is null) = (${t.entityId} is null)`,
    ),
    index("idx_notifications_user_id").on(t.userId),
    index("idx_notifications_unread")
      .on(t.userId, t.createdAt.desc())
      .where(sql`${t.readAt} is null`),
  ],
);

/* ── audit_log (admin moderation actions) ─────────────────── */
export const auditLog = pgTable(
  "audit_log",
  {
    logId: uuid("log_id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => administrators.userId, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 64 }).notNull(),
    targetType: varchar("target_type", { length: 32 }),
    targetId: uuid("target_id"),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [index("idx_audit_log_created_at").on(t.createdAt.desc())],
);

/* ── appeals (against a ban) ──────────────────────────────── */
export const appeals = pgTable(
  "appeals",
  {
    appealId: uuid("appeal_id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    banId: uuid("ban_id").references(() => userBans.banId, {
      onDelete: "set null",
    }),
    reason: text("reason").notNull(),
    status: appealStatus("status").notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => administrators.userId, {
      onDelete: "set null",
    }),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", tz),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [index("idx_appeals_status").on(t.status), index("idx_appeals_user_id").on(t.userId)],
);
