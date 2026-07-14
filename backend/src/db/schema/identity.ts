import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { friendshipStatus, orgVerificationStatus, profileVisibility } from "./_enums";

const tz = { withTimezone: true } as const;

/* ── 1. users ─────────────────────────────────────────────── */
export const users = pgTable(
  "users",
  {
    userId: uuid("user_id").primaryKey().defaultRandom(),
    username: varchar("username", { length: 32 }).notNull(),
    displayName: varchar("display_name", { length: 80 }),
    email: varchar("email", { length: 254 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    isEmailVerified: boolean("is_email_verified").notNull().default(false),
    googleId: text("google_id"),
    githubId: text("github_id"),
    githubUsername: varchar("github_username", { length: 39 }),
    // Raw GitHub OAuth access token, refreshed on every login. Stored in
    // plaintext for now (dev/hackathon phase) — encrypt at rest before prod.
    githubAccessToken: text("github_access_token"),
    linkedinId: text("linkedin_id"),
    avatarUrl: text("avatar_url"),
    bannerUrl: text("banner_url"),
    bio: text("bio"),
    // Bumped on password change/reset; refresh tokens carry the version they
    // were minted with, so a bump invalidates every other device's session.
    tokenVersion: integer("token_version").notNull().default(0),
    lastLoginAt: timestamp("last_login_at", tz),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", tz),
  },
  (t) => [
    uniqueIndex("uq_users_username").on(t.username),
    uniqueIndex("uq_users_email").on(t.email),
    // Partial unique indexes on OAuth IDs exclude NULL so multiple users can
    // have no linked account without colliding on the unique constraint.
    uniqueIndex("uq_users_github_id_nn")
      .on(t.githubId)
      .where(sql`${t.githubId} is not null`),
    uniqueIndex("uq_users_google_id_nn")
      .on(t.googleId)
      .where(sql`${t.googleId} is not null`),
    uniqueIndex("uq_users_linkedin_id_nn")
      .on(t.linkedinId)
      .where(sql`${t.linkedinId} is not null`),
    uniqueIndex("uq_users_github_username")
      .on(t.githubUsername)
      .where(sql`${t.githubUsername} is not null`),
    index("idx_users_deleted")
      .on(t.deletedAt)
      .where(sql`${t.deletedAt} is not null`),
  ],
);

/* ── 2. administrators (self-referencing granted_by) ──────── */
export const administrators = pgTable(
  "administrators",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.userId, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by"),
    grantedAt: timestamp("granted_at", tz).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.grantedBy],
      foreignColumns: [t.userId],
      name: "administrators_granted_by_fkey",
    }).onDelete("set null"),
  ],
);

/* ── 3. members ───────────────────────────────────────────── */
export const members = pgTable(
  "members",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.userId, { onDelete: "cascade" }),
    points: bigint("points", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    check("chk_members_points_non_negative", sql`${t.points} >= 0`),
    index("idx_members_points").on(t.points.desc()),
  ],
);

/* ── 4. organizations ─────────────────────────────────────── */
export const organizations = pgTable(
  "organizations",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.userId, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    websiteUrl: text("website_url"),
    logoUrl: text("logo_url"),
    contactEmail: varchar("contact_email", { length: 254 }),
    verificationStatus: orgVerificationStatus("verification_status").notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => administrators.userId, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", tz),
    rejectionReason: text("rejection_reason"),
  },
  (t) => [
    uniqueIndex("uq_organizations_name").on(t.name),
    check(
      "chk_orgs_approved_fields",
      sql`${t.verificationStatus} <> 'approved' or (${t.reviewedBy} is not null and ${t.reviewedAt} is not null)`,
    ),
    check(
      "chk_orgs_rejected_fields",
      sql`${t.verificationStatus} <> 'rejected' or (${t.rejectionReason} is not null and ${t.reviewedBy} is not null and ${t.reviewedAt} is not null)`,
    ),
    check(
      "chk_orgs_pending_fields",
      sql`${t.verificationStatus} <> 'pending' or (${t.reviewedBy} is null and ${t.reviewedAt} is null and ${t.rejectionReason} is null)`,
    ),
  ],
);

/* ── 5. user_bans ─────────────────────────────────────────── */
export const userBans = pgTable(
  "user_bans",
  {
    banId: uuid("ban_id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    bannedBy: uuid("banned_by")
      .notNull()
      .references(() => administrators.userId, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    bannedAt: timestamp("banned_at", tz).notNull().defaultNow(),
    liftedAt: timestamp("lifted_at", tz),
    liftedBy: uuid("lifted_by").references(() => administrators.userId, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("idx_user_bans_user_id").on(t.userId),
    uniqueIndex("uq_user_bans_active_per_user")
      .on(t.userId)
      .where(sql`${t.liftedAt} is null`),
    check("chk_user_bans_lift_consistency", sql`(${t.liftedAt} is null) = (${t.liftedBy} is null)`),
  ],
);

/* ── 6. follows (directional, user → user) ────────────────── */
export const follows = pgTable(
  "follows",
  {
    followerId: uuid("follower_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    followeeId: uuid("followee_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    check("chk_follows_no_self", sql`${t.followerId} <> ${t.followeeId}`),
    index("idx_follows_followee_id").on(t.followeeId),
  ],
);

/* ── 7. friendships (mutual, member ↔ member) ─────────────── */
export const friendships = pgTable(
  "friendships",
  {
    userIdA: uuid("user_id_a")
      .notNull()
      .references(() => members.userId, { onDelete: "cascade" }),
    userIdB: uuid("user_id_b")
      .notNull()
      .references(() => members.userId, { onDelete: "cascade" }),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => members.userId, { onDelete: "cascade" }),
    status: friendshipStatus("status").notNull().default("pending"),
    requestedAt: timestamp("requested_at", tz).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", tz),
  },
  (t) => [
    primaryKey({ columns: [t.userIdA, t.userIdB] }),
    // Canonical ordering (A < B) ensures there is exactly one row per pair,
    // preventing both (X,Y) and (Y,X) from existing as separate friendships.
    check("chk_friendships_canonical_order", sql`${t.userIdA} < ${t.userIdB}`),
    check(
      "chk_friendships_requester",
      sql`${t.requesterId} = ${t.userIdA} or ${t.requesterId} = ${t.userIdB}`,
    ),
    check(
      "chk_friendships_responded_consistency",
      sql`(${t.status} = 'accepted') = (${t.respondedAt} is not null)`,
    ),
    index("idx_friendships_user_id_b").on(t.userIdB),
    index("idx_friendships_requester").on(t.requesterId),
  ],
);

/* ── user_settings (privacy + notification preferences) ───── */
export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.userId, { onDelete: "cascade" }),
  profileVisibility: profileVisibility("profile_visibility").notNull().default("all"),
  visibleToRecruiters: boolean("visible_to_recruiters").notNull().default(true),
  showEmail: boolean("show_email").notNull().default(false),
  showLocation: boolean("show_location").notNull().default(true),
  emailNotifications: boolean("email_notifications").notNull().default(true),
  pushNotifications: boolean("push_notifications").notNull().default(true),
  updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
});

/* ── user_blocks (directional: blocker → blocked) ─────────── */
export const userBlocks = pgTable(
  "user_blocks",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    index("idx_user_blocks_blocker").on(t.blockerId),
    check("chk_user_blocks_not_self", sql`${t.blockerId} <> ${t.blockedId}`),
  ],
);
