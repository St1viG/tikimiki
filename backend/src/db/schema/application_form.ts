import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { applications, hackathons } from "./hackathons";

const tz = { withTimezone: true } as const;

/* ── application_questions ─────────────────────────────────────
 * Custom questions an organizer attaches to a hackathon's application form.
 * `type` drives the input widget; `options` holds choices for *_choice types. */
export const applicationQuestions = pgTable(
  "application_questions",
  {
    questionId: uuid("question_id").primaryKey().defaultRandom(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.hackathonId, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    type: varchar("type", { length: 20 }).notNull().default("short_text"),
    options: jsonb("options"),
    required: boolean("required").notNull().default(false),
    /** For *_choice types: expose an "Other" choice with a free-text field. */
    allowOther: boolean("allow_other").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [
    check(
      "chk_application_questions_type",
      sql`${t.type} in ('short_text', 'long_text', 'single_choice', 'multi_choice')`,
    ),
    check(
      "chk_application_questions_options",
      sql`${t.type} in ('short_text', 'long_text') or ${t.options} is not null`,
    ),
    index("idx_application_questions_hackathon_id").on(t.hackathonId),
  ],
);

/* ── question_answers ──────────────────────────────────────────
 * An applicant's answer to a single application question. For *_choice
 * questions the selected option(s) are stored as text / JSON-encoded text. */
export const questionAnswers = pgTable(
  "question_answers",
  {
    answerId: uuid("answer_id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.applicationId, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => applicationQuestions.questionId, { onDelete: "cascade" }),
    answer: text("answer").notNull().default(""),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_question_answers_application_question").on(t.applicationId, t.questionId),
    index("idx_question_answers_application_id").on(t.applicationId),
    index("idx_question_answers_question_id").on(t.questionId),
  ],
);
