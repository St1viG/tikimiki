import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./identity";

const tz = { withTimezone: true } as const;

/* ── posts ────────────────────────────────────────────────── */
export const posts = pgTable(
  "posts",
  {
    postId: uuid("post_id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId),
    content: text("content").notNull().default(""),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    editedAt: timestamp("edited_at", tz),
    deletedAt: timestamp("deleted_at", tz),
  },
  (t) => [
    index("idx_posts_user_id").on(t.userId),
    index("idx_posts_created_at").on(t.createdAt.desc()),
  ],
);

/* ── post_attachments ─────────────────────────────────────── */
export const postAttachments = pgTable(
  "post_attachments",
  {
    attachmentId: uuid("attachment_id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.postId, { onDelete: "cascade" }),
    url: text("url").notNull(),
    filename: varchar("filename", { length: 255 }),
    position: smallint("position").notNull().default(0),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [index("idx_post_attachments_post_id").on(t.postId)],
);

/* ── post_reactions ───────────────────────────────────────── */
export const postReactions = pgTable(
  "post_reactions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.postId, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.postId, t.symbol] }),
    check("chk_post_reaction_symbol_length", sql`char_length(${t.symbol}) <= 8`),
    index("idx_post_reactions_post_id").on(t.postId),
  ],
);

/* ── comments (self-referencing parent_comment_id) ────────── */
export const comments = pgTable(
  "comments",
  {
    commentId: uuid("comment_id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.postId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId),
    parentCommentId: uuid("parent_comment_id"),
    content: text("content").notNull().default(""),
    editedAt: timestamp("edited_at", tz),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", tz),
  },
  (t) => [
    foreignKey({
      columns: [t.parentCommentId],
      foreignColumns: [t.commentId],
      name: "comments_parent_comment_id_fkey",
    }).onDelete("cascade"),
    index("idx_comments_post_id").on(t.postId),
    index("idx_comments_user_id").on(t.userId),
    index("idx_comments_parent_comment_id")
      .on(t.parentCommentId)
      .where(sql`${t.parentCommentId} is not null`),
  ],
);

/* ── comment_attachments ──────────────────────────────────── */
export const commentAttachments = pgTable(
  "comment_attachments",
  {
    attachmentId: uuid("attachment_id").primaryKey().defaultRandom(),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.commentId, { onDelete: "cascade" }),
    url: text("url").notNull(),
    filename: varchar("filename", { length: 255 }),
    position: smallint("position").notNull().default(0),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [index("idx_comment_attachments_comment_id").on(t.commentId)],
);

/* ── comment_reactions ────────────────────────────────────── */
export const commentReactions = pgTable(
  "comment_reactions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.commentId, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.commentId, t.symbol] }),
    check(
      "chk_comment_reaction_symbol_length",
      sql`char_length(${t.symbol}) <= 8`,
    ),
    index("idx_comment_reactions_comment_id").on(t.commentId),
  ],
);
