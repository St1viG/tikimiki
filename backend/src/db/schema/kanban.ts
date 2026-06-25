import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { members } from "./identity";
import { teams } from "./hackathons";

const tz = { withTimezone: true } as const;

/* ── kanban_boards ────────────────────────────────────────── */
export const kanbanBoards = pgTable(
  "kanban_boards",
  {
    boardId: uuid("board_id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.teamId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_kanban_boards_team").on(t.teamId)],
);

/* ── kanban_columns ───────────────────────────────────────── */
export const kanbanColumns = pgTable(
  "kanban_columns",
  {
    columnId: uuid("column_id").primaryKey().defaultRandom(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => kanbanBoards.boardId, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    position: real("position").notNull().default(0),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [
    check("chk_kanban_columns_position", sql`${t.position} >= 0.0`),
    index("idx_kanban_columns_board_id").on(t.boardId),
  ],
);

/* ── kanban_cards ─────────────────────────────────────────── */
export const kanbanCards = pgTable(
  "kanban_cards",
  {
    cardId: uuid("card_id").primaryKey().defaultRandom(),
    columnId: uuid("column_id")
      .notNull()
      .references(() => kanbanColumns.columnId, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => members.userId, { onDelete: "cascade" }),
    assignedTo: uuid("assigned_to").references(() => members.userId, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    position: real("position").notNull().default(0),
    dueAt: timestamp("due_at", tz),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", tz),
  },
  (t) => [
    check("chk_kanban_cards_position", sql`${t.position} >= 0.0`),
    uniqueIndex("uq_kanban_cards_active_position")
      .on(t.columnId, t.position)
      .where(sql`${t.deletedAt} is null`),
    index("idx_kanban_cards_column_id").on(t.columnId),
    index("idx_kanban_cards_assigned_to").on(t.assignedTo),
  ],
);
