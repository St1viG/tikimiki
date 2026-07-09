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
import { members, users } from "./identity";
import { teams } from "./hackathons";

const tz = { withTimezone: true } as const;

/* ── team_join_requests ────────────────────────────────────────
 * A member asks to join an open team; the team leader accepts/declines.
 * At most one pending request per (team, user). */
export const teamJoinRequests = pgTable(
  "team_join_requests",
  {
    requestId: uuid("request_id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.teamId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => members.userId, { onDelete: "cascade" }),
    message: text("message"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", tz),
    respondedBy: uuid("responded_by").references(() => users.userId, {
      onDelete: "set null",
    }),
  },
  (t) => [
    check("chk_team_join_requests_status", sql`${t.status} in ('pending', 'accepted', 'declined')`),
    uniqueIndex("uq_team_join_requests_pending")
      .on(t.teamId, t.userId)
      .where(sql`${t.status} = 'pending'`),
    index("idx_team_join_requests_team_id").on(t.teamId),
    index("idx_team_join_requests_user_id").on(t.userId),
  ],
);

/* ── team_invitations ──────────────────────────────────────────
 * A team leader invites a (solo) member; the invitee accepts/declines.
 * At most one pending invitation per (team, user). */
export const teamInvitations = pgTable(
  "team_invitations",
  {
    invitationId: uuid("invitation_id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.teamId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => members.userId, { onDelete: "cascade" }),
    invitedBy: uuid("invited_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    message: text("message"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", tz),
  },
  (t) => [
    check("chk_team_invitations_status", sql`${t.status} in ('pending', 'accepted', 'declined')`),
    uniqueIndex("uq_team_invitations_pending")
      .on(t.teamId, t.userId)
      .where(sql`${t.status} = 'pending'`),
    index("idx_team_invitations_team_id").on(t.teamId),
    index("idx_team_invitations_user_id").on(t.userId),
  ],
);
