import {
  boolean,
  index,
  pgTable,
  primaryKey,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { members } from "./identity";

/* ── skills ───────────────────────────────────────────────── */
export const skills = pgTable(
  "skills",
  {
    skillId: uuid("skill_id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    category: varchar("category", { length: 50 }),
  },
  (t) => [uniqueIndex("uq_skills_name").on(t.name)],
);

/* ── member_skills ────────────────────────────────────────── */
export const memberSkills = pgTable(
  "member_skills",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => members.userId, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.skillId, { onDelete: "cascade" }),
    /** Where this skill tag came from — e.g. `"manual"` or `"github"`. */
    source: varchar("source", { length: 20 }).notNull().default("manual"),
    /** Whether an external source (e.g. GitHub activity) corroborates it. */
    verified: boolean("verified").notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.skillId] }),
    index("idx_member_skills_skill_id").on(t.skillId),
  ],
);
