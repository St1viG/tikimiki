import {
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
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.skillId] }),
    index("idx_member_skills_skill_id").on(t.skillId),
  ],
);
