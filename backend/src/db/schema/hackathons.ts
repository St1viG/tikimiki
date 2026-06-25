import { sql } from "drizzle-orm";
import {
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
import {
  applicationStatus,
  hackathonStatus,
  hackathonType,
  projectStatus,
  teamRole,
} from "./_enums";
import { geographyPoint } from "./_types";
import { members, organizations, users } from "./identity";
import { skills } from "./skills";

const tz = { withTimezone: true } as const;

/* ── hackathons ───────────────────────────────────────────── */
export const hackathons = pgTable(
  "hackathons",
  {
    hackathonId: uuid("hackathon_id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.userId),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull(),
    type: hackathonType("type").notNull(),
    status: hackathonStatus("status").notNull().default("upcoming"),
    theme: varchar("theme", { length: 100 }),
    startsAt: timestamp("starts_at", tz).notNull(),
    endsAt: timestamp("ends_at", tz).notNull(),
    registrationDeadline: timestamp("registration_deadline", tz).notNull(),
    votingOpensAt: timestamp("voting_opens_at", tz),
    votingClosesAt: timestamp("voting_closes_at", tz),
    maxParticipants: integer("max_participants"),
    minTeamSize: smallint("min_team_size").notNull().default(1),
    maxTeamSize: smallint("max_team_size").notNull(),
    location: varchar("location", { length: 200 }),
    coordinates: geographyPoint("coordinates"),
    logoUrl: text("logo_url"),
    bannerUrl: text("banner_url"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", tz),
  },
  (t) => [
    check("chk_hackathons_dates", sql`${t.startsAt} < ${t.endsAt}`),
    check(
      "chk_hackathons_registration_deadline",
      sql`${t.registrationDeadline} < ${t.startsAt}`,
    ),
    check(
      "chk_hackathons_max_participants",
      sql`${t.maxParticipants} is null or ${t.maxParticipants} > 0`,
    ),
    check(
      "chk_hackathons_team_size",
      sql`${t.minTeamSize} >= 1 and ${t.maxTeamSize} >= ${t.minTeamSize}`,
    ),
    check(
      "chk_hackathons_physical_location",
      sql`${t.type} = 'virtual' or (${t.location} is not null and ${t.coordinates} is not null)`,
    ),
    index("idx_hackathons_organization_id").on(t.organizationId),
    index("idx_hackathons_status").on(t.status),
    index("idx_hackathons_starts_at").on(t.startsAt),
    index("idx_hackathons_coordinates").using("gist", t.coordinates),
  ],
);

/* ── hackathon_required_skills ────────────────────────────── */
export const hackathonRequiredSkills = pgTable(
  "hackathon_required_skills",
  {
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.hackathonId, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.skillId, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.hackathonId, t.skillId] }),
    index("idx_hackathon_required_skills_skill_id").on(t.skillId),
  ],
);

/* ── bounties ─────────────────────────────────────────────── */
export const bounties = pgTable(
  "bounties",
  {
    bountyId: uuid("bounty_id").primaryKey().defaultRandom(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.hackathonId, { onDelete: "cascade" }),
    sponsorName: varchar("sponsor_name", { length: 100 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    theme: varchar("theme", { length: 100 }),
    description: text("description"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [index("idx_bounties_hackathon_id").on(t.hackathonId)],
);

/* ── hackathon_prizes ─────────────────────────────────────── */
export const hackathonPrizes = pgTable(
  "hackathon_prizes",
  {
    prizeId: uuid("prize_id").primaryKey().defaultRandom(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.hackathonId, { onDelete: "cascade" }),
    bountyId: uuid("bounty_id").references(() => bounties.bountyId, {
      onDelete: "cascade",
    }),
    sponsorName: varchar("sponsor_name", { length: 100 }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    rank: smallint("rank"),
    awardValue: text("award_value"),
  },
  (t) => [
    check("chk_prizes_rank", sql`${t.rank} is null or ${t.rank} > 0`),
    uniqueIndex("uq_prizes_hackathon_rank")
      .on(t.hackathonId, t.rank)
      .where(sql`${t.bountyId} is null and ${t.rank} is not null`),
    uniqueIndex("uq_prizes_bounty_rank")
      .on(t.bountyId, t.rank)
      .where(sql`${t.bountyId} is not null and ${t.rank} is not null`),
    index("idx_hackathon_prizes_hackathon_id").on(t.hackathonId),
  ],
);

/* ── teams ────────────────────────────────────────────────── */
export const teams = pgTable(
  "teams",
  {
    teamId: uuid("team_id").primaryKey().defaultRandom(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.hackathonId),
    name: varchar("name", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", tz),
  },
  (t) => [
    uniqueIndex("uq_teams_name_per_hackathon")
      .on(t.hackathonId, t.name)
      .where(sql`${t.deletedAt} is null`),
    index("idx_teams_hackathon_id").on(t.hackathonId),
  ],
);

/* ── team_members ─────────────────────────────────────────── */
export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.teamId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => members.userId, { onDelete: "cascade" }),
    role: teamRole("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", tz).notNull().defaultNow(),
    leftAt: timestamp("left_at", tz),
    deletedAt: timestamp("deleted_at", tz),
  },
  (t) => [
    primaryKey({ columns: [t.teamId, t.userId] }),
    check(
      "chk_team_members_exit_consistency",
      sql`not (${t.leftAt} is not null and ${t.deletedAt} is not null)`,
    ),
    uniqueIndex("uq_team_one_leader")
      .on(t.teamId)
      .where(sql`${t.role} = 'leader' and ${t.deletedAt} is null`),
    index("idx_team_members_user_id").on(t.userId),
  ],
);

/* ── applications ─────────────────────────────────────────── */
export const applications = pgTable(
  "applications",
  {
    applicationId: uuid("application_id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => members.userId),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.hackathonId),
    teamId: uuid("team_id").references(() => teams.teamId, {
      onDelete: "set null",
    }),
    status: applicationStatus("status").notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", tz),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", tz),
  },
  (t) => [
    check(
      "chk_applications_review_consistency",
      sql`(${t.reviewedAt} is null) = (${t.reviewedBy} is null)`,
    ),
    check(
      "chk_applications_rejection_reason",
      sql`${t.rejectionReason} is null or ${t.status} = 'rejected'`,
    ),
    uniqueIndex("uq_applications_user_hackathon")
      .on(t.userId, t.hackathonId)
      .where(sql`${t.deletedAt} is null`),
    index("idx_applications_user_id").on(t.userId),
    index("idx_applications_hackathon_id").on(t.hackathonId),
    index("idx_applications_hackathon_status").on(t.hackathonId, t.status),
  ],
);

/* ── projects ─────────────────────────────────────────────── */
export const projects = pgTable(
  "projects",
  {
    projectId: uuid("project_id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.teamId),
    status: projectStatus("status").notNull().default("draft"),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    repositoryUrl: text("repository_url"),
    videoUrl: text("video_url"),
    submittedAt: timestamp("submitted_at", tz),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", tz),
  },
  (t) => [
    check(
      "chk_projects_submitted_consistency",
      sql`(${t.status} = 'draft') = (${t.submittedAt} is null)`,
    ),
    index("idx_projects_team_id").on(t.teamId),
  ],
);

/* ── hackathon_results ────────────────────────────────────── */
export const hackathonResults = pgTable(
  "hackathon_results",
  {
    resultId: uuid("result_id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.projectId, { onDelete: "cascade" }),
    bountyId: uuid("bounty_id").references(() => bounties.bountyId, {
      onDelete: "cascade",
    }),
    rank: integer("rank"),
    prizeId: uuid("prize_id").references(() => hackathonPrizes.prizeId, {
      onDelete: "set null",
    }),
  },
  (t) => [
    check("chk_hackathon_results_rank", sql`${t.rank} is null or ${t.rank} > 0`),
    uniqueIndex("uq_hackathon_results_project")
      .on(t.projectId)
      .where(sql`${t.bountyId} is null`),
    uniqueIndex("uq_hackathon_results_bounty")
      .on(t.projectId, t.bountyId)
      .where(sql`${t.bountyId} is not null`),
    uniqueIndex("uq_hackathon_results_bounty_rank")
      .on(t.bountyId, t.rank)
      .where(sql`${t.bountyId} is not null and ${t.rank} is not null`),
    index("idx_hackathon_results_bounty_id")
      .on(t.bountyId)
      .where(sql`${t.bountyId} is not null`),
  ],
);

/* ── bounty_submissions ───────────────────────────────────── */
export const bountySubmissions = pgTable(
  "bounty_submissions",
  {
    bountyId: uuid("bounty_id")
      .notNull()
      .references(() => bounties.bountyId, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.projectId, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.bountyId, t.projectId] }),
    index("idx_bounty_submissions_project_id").on(t.projectId),
  ],
);

/* ── votes (audience "People's Choice", F-18) ─────────────── */
export const votes = pgTable(
  "votes",
  {
    voteId: uuid("vote_id").primaryKey().defaultRandom(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.hackathonId, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.projectId, { onDelete: "cascade" }),
    voterId: uuid("voter_id").references(() => users.userId, {
      onDelete: "cascade",
    }),
    voterFingerprint: text("voter_fingerprint"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [
    check(
      "chk_votes_voter_identity",
      sql`(${t.voterId} is null) <> (${t.voterFingerprint} is null)`,
    ),
    uniqueIndex("uq_votes_member_per_hackathon")
      .on(t.hackathonId, t.voterId)
      .where(sql`${t.voterId} is not null`),
    uniqueIndex("uq_votes_guest_per_hackathon")
      .on(t.hackathonId, t.voterFingerprint)
      .where(sql`${t.voterFingerprint} is not null`),
    index("idx_votes_project_id").on(t.projectId),
  ],
);
