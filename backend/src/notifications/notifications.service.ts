import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { renderNotification, type NotificationTemplateRef } from "@tikimiki/types";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { notifications, users } from "../db/schema";
import { extractMentions } from "../common/mentions";
import { RealtimeGateway } from "../realtime/realtime.gateway";

/** Possible values for a notification's `type` column (notification_type enum). */
export type NotificationType =
  | "application_approved"
  | "application_rejected"
  | "application_waitlisted"
  | "badge_awarded"
  | "hackathon_result_posted"
  | "hackathon_starting_soon"
  | "organization_verified"
  | "organization_rejected"
  | "new_direct_message"
  | "position_assigned"
  | "bounty_result_posted"
  | "merch_order_shipped"
  | "new_follower"
  | "friend_request_received"
  | "friend_request_accepted"
  | "team_invitation_received"
  | "team_invitation_declined"
  | "team_request_received"
  | "team_request_accepted"
  | "post_comment"
  | "post_reaction"
  | "mention"
  | "new_application"
  | "report_resolved"
  | "report_dismissed";

/** Possible values for a notification's `entityType` column (entity_type enum). */
export type NotificationEntityType =
  | "user"
  | "hackathon"
  | "application"
  | "team"
  | "project"
  | "post"
  | "comment"
  | "badge"
  | "message"
  | "bounty"
  | "game";

/** A single notification belonging to the caller. */
export interface NotificationDto {
  notificationId: string;
  type: NotificationType;
  /** Serbian fallback rendering; clients with the template catalogue prefer `template`. */
  title: string;
  body: string | null;
  /** i18n payload ({ key, params }) — null on rows created before templates existed. */
  template: NotificationTemplateRef | null;
  entityType: NotificationEntityType | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Response for GET /notifications/unread-count. */
export interface UnreadCountDto {
  count: number;
}

/** Response for POST /notifications/mark-all-read. */
export interface MarkAllReadDto {
  markedCount: number;
}

/** Input for {@link NotificationsService.create}. */
export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  /** Which catalogue entry to render, plus its dynamic values. */
  template: NotificationTemplateRef;
  entityType?: NotificationEntityType | null;
  entityId?: string | null;
}

type NotificationRow = {
  notificationId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  template: NotificationTemplateRef | null;
  entityType: NotificationEntityType | null;
  entityId: string | null;
  readAt: Date | null;
  createdAt: Date;
};

const selection = {
  notificationId: notifications.notificationId,
  type: notifications.type,
  title: notifications.title,
  body: notifications.body,
  template: notifications.template,
  entityType: notifications.entityType,
  entityId: notifications.entityId,
  readAt: notifications.readAt,
  createdAt: notifications.createdAt,
};

/**
 * Render the stored Serbian fallback strings for a template. The title column
 * is varchar(100), so the rendered title is clamped to fit.
 */
export function renderFallbackText(template: NotificationTemplateRef): {
  title: string;
  body: string | null;
} {
  const rendered = renderNotification(template.key, template.params, "sr");
  // The catalogue always knows its own keys; guard only against future drift.
  if (!rendered) return { title: template.key, body: null };
  return { title: rendered.title.slice(0, 100), body: rendered.body };
}

function toDto(r: NotificationRow): NotificationDto {
  return {
    notificationId: r.notificationId,
    type: r.type,
    title: r.title,
    body: r.body,
    template: r.template,
    entityType: r.entityType,
    entityId: r.entityId,
    readAt: r.readAt ? r.readAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Persist a notification AND push it to the recipient's live socket room so
   * the bell badge / list update without a refresh. This is the single
   * chokepoint every feature service should use instead of inserting directly.
   */
  async create(input: CreateNotificationInput): Promise<NotificationDto> {
    const fallback = renderFallbackText(input.template);
    const [row] = await this.db
      .insert(notifications)
      .values({
        userId: input.userId,
        type: input.type,
        title: fallback.title,
        body: fallback.body,
        template: input.template,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      })
      .returning(selection);

    const dto = toDto(row);
    this.realtime.emitNotification(input.userId, dto);
    return dto;
  }

  /**
   * Parse `@username` mentions out of `content` and notify each mentioned
   * account (type `mention`). Skips the actor's own handle and silently drops
   * unknown usernames. `restrictToUserIds`, when given, limits notifications to
   * that set — used by chat so you can only ping members of the channel /
   * conversation the message lives in.
   */
  async notifyMentions(opts: {
    actorId: string;
    actorUsername: string;
    content: string;
    entityType: NotificationEntityType;
    entityId: string;
    restrictToUserIds?: string[];
  }): Promise<void> {
    const handles = extractMentions(opts.content);
    if (handles.length === 0) return;

    const rows = await this.db
      .select({ userId: users.userId })
      .from(users)
      .where(inArray(sql`lower(${users.username})`, handles));

    const restrict = opts.restrictToUserIds ? new Set(opts.restrictToUserIds) : null;

    for (const r of rows) {
      if (r.userId === opts.actorId) continue;
      if (restrict && !restrict.has(r.userId)) continue;
      await this.create({
        userId: r.userId,
        type: "mention",
        template: { key: "mention", params: { username: opts.actorUsername } },
        entityType: opts.entityType,
        entityId: opts.entityId,
      });
    }
  }

  /** List the caller's notifications, optionally only unread, newest first. */
  async list(userId: string, filter: "all" | "unread"): Promise<NotificationDto[]> {
    const where =
      filter === "unread"
        ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
        : eq(notifications.userId, userId);

    const rows = await this.db
      .select(selection)
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(100);

    return rows.map(toDto);
  }

  /** Count the caller's unread notifications. */
  async unreadCount(userId: string): Promise<UnreadCountDto> {
    const [row] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return { count: row?.value ?? 0 };
  }

  /** Mark a single notification read (sets readAt if currently null). */
  async markRead(userId: string, notificationId: string): Promise<NotificationDto> {
    const [existing] = await this.db
      .select(selection)
      .from(notifications)
      .where(
        and(eq(notifications.notificationId, notificationId), eq(notifications.userId, userId)),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException("Notification not found");
    }

    // Already read — return early to avoid a no-op UPDATE.
    if (existing.readAt) {
      return toDto(existing);
    }

    const [updated] = await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.notificationId, notificationId),
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
        ),
      )
      .returning(selection);

    // If a concurrent request already marked it read, fall back to the row we have.
    return toDto(updated ?? existing);
  }

  /** Mark every unread notification for the caller as read. */
  async markAllRead(userId: string): Promise<MarkAllReadDto> {
    const updated = await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      .returning({ notificationId: notifications.notificationId });

    return { markedCount: updated.length };
  }
}
