import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { badgeCategory, pointTxnType } from "./_enums";
import { members } from "./identity";

const tz = { withTimezone: true } as const;

/* ── badges ───────────────────────────────────────────────── */
export const badges = pgTable(
  "badges",
  {
    badgeId: uuid("badge_id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description").notNull(),
    category: badgeCategory("category").notNull(),
    iconUrl: text("icon_url").notNull(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_badges_name").on(t.name)],
);

/* ── user_badges ──────────────────────────────────────────── */
export const userBadges = pgTable(
  "user_badges",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => members.userId, { onDelete: "cascade" }),
    badgeId: uuid("badge_id")
      .notNull()
      .references(() => badges.badgeId, { onDelete: "cascade" }),
    awardedAt: timestamp("awarded_at", tz).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.badgeId] }),
    index("idx_user_badges_badge_id").on(t.badgeId),
  ],
);

/* ── games (daily mini-games, F-21) ───────────────────────── */
export const games = pgTable(
  "games",
  {
    gameId: uuid("game_id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 50 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    thumbnailUrl: text("thumbnail_url"),
    isActive: boolean("is_active").notNull().default(true),
    baseDailyPlays: smallint("base_daily_plays").notNull().default(1),
    premiumDailyPlays: smallint("premium_daily_plays").notNull().default(3),
    maxPointsPerPlay: integer("max_points_per_play"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_games_slug").on(t.slug),
    uniqueIndex("uq_games_name").on(t.name),
    check("chk_games_base_daily_plays", sql`${t.baseDailyPlays} >= 1`),
    check("chk_games_premium_daily_plays", sql`${t.premiumDailyPlays} >= ${t.baseDailyPlays}`),
    check("chk_games_max_points", sql`${t.maxPointsPerPlay} is null or ${t.maxPointsPerPlay} > 0`),
    index("idx_games_active")
      .on(t.isActive)
      .where(sql`${t.isActive}`),
  ],
);

/* ── game_plays (results / leaderboard) ───────────────────── */
export const gamePlays = pgTable(
  "game_plays",
  {
    playId: uuid("play_id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.gameId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => members.userId, { onDelete: "cascade" }),
    score: integer("score").notNull().default(0),
    pointsAwarded: integer("points_awarded").notNull().default(0),
    playedAt: timestamp("played_at", tz).notNull().defaultNow(),
  },
  (t) => [
    check("chk_game_plays_score", sql`${t.score} >= 0`),
    check("chk_game_plays_points_awarded", sql`${t.pointsAwarded} >= 0`),
    index("idx_game_plays_user_id").on(t.userId),
    index("idx_game_plays_game_user_day").on(t.gameId, t.userId, t.playedAt.desc()),
    index("idx_game_plays_leaderboard").on(t.gameId, t.score.desc()),
  ],
);

/* ── point_transactions (append-only ledger, F-19/F-21) ───── */
export const pointTransactions = pgTable(
  "point_transactions",
  {
    transactionId: uuid("transaction_id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => members.userId, { onDelete: "cascade" }),
    type: pointTxnType("type").notNull(),
    delta: bigint("delta", { mode: "number" }).notNull(),
    balanceAfter: bigint("balance_after", { mode: "number" }).notNull(),
    referenceId: uuid("reference_id"),
    note: text("note"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [
    check("chk_point_transactions_delta", sql`${t.delta} <> 0`),
    check("chk_point_transactions_balance_after", sql`${t.balanceAfter} >= 0`),
    index("idx_point_transactions_user_id").on(t.userId, t.createdAt.desc()),
  ],
);
