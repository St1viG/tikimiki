import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { channelType } from "./_enums";
import { members, users } from "./identity";
import { hackathons, teams } from "./hackathons";

const tz = { withTimezone: true } as const;

/* ── servers (one per hackathon) ──────────────────────────── */
export const servers = pgTable(
  "servers",
  {
    serverId: uuid("server_id").primaryKey().defaultRandom(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.hackathonId),
    name: varchar("name", { length: 200 }).notNull(),
    logoUrl: text("logo_url"),
    bannerUrl: text("banner_url"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_servers_hackathon").on(t.hackathonId)],
);

/* ── server_roles ─────────────────────────────────────────── */
export const serverRoles = pgTable(
  "server_roles",
  {
    serverRoleId: uuid("server_role_id").primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.serverId, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_server_roles_name_per_server").on(t.serverId, t.name),
    index("idx_server_roles_server_id").on(t.serverId),
  ],
);

/* ── permissions ──────────────────────────────────────────── */
export const permissions = pgTable(
  "permissions",
  {
    permissionId: uuid("permission_id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description").notNull(),
  },
  (t) => [uniqueIndex("uq_permissions_name").on(t.name)],
);

/* ── server_role_permissions ──────────────────────────────── */
export const serverRolePermissions = pgTable(
  "server_role_permissions",
  {
    serverRoleId: uuid("server_role_id")
      .notNull()
      .references(() => serverRoles.serverRoleId, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.permissionId, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.serverRoleId, t.permissionId] }),
    index("idx_server_role_permissions_permission_id").on(t.permissionId),
  ],
);

/* ── user_roles ───────────────────────────────────────────── */
export const userRoles = pgTable(
  "user_roles",
  {
    serverRoleId: uuid("server_role_id")
      .notNull()
      .references(() => serverRoles.serverRoleId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => members.userId, { onDelete: "cascade" }),
    assignedBy: uuid("assigned_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    assignedAt: timestamp("assigned_at", tz).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.serverRoleId, t.userId] }),
    index("idx_user_roles_user_id").on(t.userId),
  ],
);

/* ── channel_groups ───────────────────────────────────────── */
export const channelGroups = pgTable(
  "channel_groups",
  {
    groupId: uuid("group_id").primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.serverId, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    position: real("position").notNull().default(0),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_channel_groups_name_per_server").on(t.serverId, t.name),
    check("chk_channel_groups_position", sql`${t.position} >= 0.0`),
    uniqueIndex("uq_channel_groups_position_per_server").on(
      t.serverId,
      t.position,
    ),
    index("idx_channel_groups_server_id").on(t.serverId),
  ],
);

/* ── channels ─────────────────────────────────────────────── */
export const channels = pgTable(
  "channels",
  {
    channelId: uuid("channel_id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => channelGroups.groupId, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.teamId),
    type: channelType("type").notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    position: real("position").notNull().default(0),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", tz),
  },
  (t) => [
    uniqueIndex("uq_channels_name_per_group").on(t.groupId, t.name),
    check(
      "chk_channels_team_consistency",
      sql`(${t.type} = 'team') = (${t.teamId} is not null)`,
    ),
    check("chk_channels_position", sql`${t.position} >= 0.0`),
    uniqueIndex("uq_channels_active_position_per_group")
      .on(t.groupId, t.position)
      .where(sql`${t.deletedAt} is null`),
    index("idx_channels_group_id").on(t.groupId),
  ],
);

/* ── messages (self-referencing reply_to_id) ──────────────── */
export const messages = pgTable(
  "messages",
  {
    messageId: uuid("message_id").primaryKey().defaultRandom(),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.userId),
    replyToId: uuid("reply_to_id"),
    content: text("content").notNull().default(""),
    sentAt: timestamp("sent_at", tz).notNull().defaultNow(),
    editedAt: timestamp("edited_at", tz),
    deletedAt: timestamp("deleted_at", tz),
    deletedBy: uuid("deleted_by").references(() => users.userId, {
      onDelete: "set null",
    }),
  },
  (t) => [
    foreignKey({
      columns: [t.replyToId],
      foreignColumns: [t.messageId],
      name: "messages_reply_to_id_fkey",
    }),
    check(
      "chk_messages_deleted_consistency",
      sql`(${t.deletedAt} is null) = (${t.deletedBy} is null)`,
    ),
    index("idx_messages_sender_id").on(t.senderId),
    index("idx_messages_sent_at").on(t.sentAt.desc()),
  ],
);

/* ── message_attachments ──────────────────────────────────── */
export const messageAttachments = pgTable(
  "message_attachments",
  {
    attachmentId: uuid("attachment_id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.messageId, { onDelete: "cascade" }),
    url: text("url").notNull(),
    filename: varchar("filename", { length: 255 }),
    position: smallint("position").notNull().default(0),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [index("idx_message_attachments_message_id").on(t.messageId)],
);

/* ── channel_messages ─────────────────────────────────────── */
export const channelMessages = pgTable(
  "channel_messages",
  {
    messageId: uuid("message_id")
      .primaryKey()
      .references(() => messages.messageId, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.channelId),
  },
  (t) => [index("idx_channel_messages_channel_id").on(t.channelId)],
);

/* ── conversations ────────────────────────────────────────── */
export const conversations = pgTable("conversations", {
  conversationId: uuid("conversation_id").primaryKey().defaultRandom(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.userId),
  /* Group chats may carry a custom name + emoji icon (null for 1-1 DMs). */
  name: varchar("name", { length: 100 }),
  icon: varchar("icon", { length: 512 }),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

/* ── conversation_members ─────────────────────────────────── */
export const conversationMembers = pgTable(
  "conversation_members",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.conversationId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", tz).notNull().defaultNow(),
    leftAt: timestamp("left_at", tz),
    lastReadAt: timestamp("last_read_at", tz),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    index("idx_conversation_members_user_id").on(t.userId),
  ],
);

/* ── direct_messages ──────────────────────────────────────── */
export const directMessages = pgTable(
  "direct_messages",
  {
    messageId: uuid("message_id")
      .primaryKey()
      .references(() => messages.messageId, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.conversationId),
  },
  (t) => [index("idx_direct_messages_conversation_id").on(t.conversationId)],
);

/* ── message_reactions ────────────────────────────────────── */
export const messageReactions = pgTable(
  "message_reactions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.messageId, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.messageId, t.symbol] }),
    check(
      "chk_message_reaction_symbol_length",
      sql`char_length(${t.symbol}) <= 8`,
    ),
    index("idx_message_reactions_message_id").on(t.messageId),
  ],
);

/* ── channel_pins ─────────────────────────────────────────── */
export const channelPins = pgTable(
  "channel_pins",
  {
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.channelId, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.messageId, { onDelete: "cascade" }),
    pinnedBy: uuid("pinned_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    pinnedAt: timestamp("pinned_at", tz).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.channelId, t.messageId] }),
    index("idx_channel_pins_channel_id").on(t.channelId),
  ],
);

/* ── server_mutes ─────────────────────────────────────────── */
export const serverMutes = pgTable(
  "server_mutes",
  {
    muteId: uuid("mute_id").primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.serverId, { onDelete: "cascade" }),
    mutedUserId: uuid("muted_user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    mutedBy: uuid("muted_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    mutedAt: timestamp("muted_at", tz).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", tz),
    reason: text("reason"),
  },
  (t) => [
    uniqueIndex("uq_server_mutes_active").on(t.serverId, t.mutedUserId),
    index("idx_server_mutes_server_id").on(t.serverId),
  ],
);

/* ── channel_members (private channel ACL) ────────────────── */
export const channelMembers = pgTable(
  "channel_members",
  {
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.channelId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    addedBy: uuid("added_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    addedAt: timestamp("added_at", tz).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.channelId, t.userId] }),
    index("idx_channel_members_channel_id").on(t.channelId),
  ],
);
