/**
 * Autor: Andrej Colić (2023/0492)
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import {
  applicationQuestions,
  applications,
  hackathons,
  memberSkills,
  members,
  questionAnswers,
  serverRoles,
  servers,
  skills,
  teamMembers,
  teams,
  userRoles,
  users,
} from "../db/schema";
import { activeTeamMember } from "../common/team.predicates";
import { AuthzService } from "../common/authz.service";
import { MailService } from "../mail/mail.service";
import { NotificationsService } from "../notifications/notifications.service";
import type {
  ApplicantFilterInput,
  CreateApplicationInput,
  CreateTeamApplicationInput,
  CreateQuestionInput,
  RejectApplicationInput,
  UpdateQuestionInput,
  WithdrawApplicationInput,
} from "./dto";

export type QuestionType = "short_text" | "long_text" | "single_choice" | "multi_choice";

/** A custom question on a hackathon's application form. */
export interface ApplicationQuestionDto {
  questionId: string;
  hackathonId: string;
  prompt: string;
  type: QuestionType;
  options: string[] | null;
  required: boolean;
  allowOther: boolean;
  position: number;
}

/** An applicant's answer, joined with its question (review view). */
export interface ApplicationAnswerDto {
  questionId: string;
  prompt: string;
  type: QuestionType;
  answer: string;
}

export type ApplicationStatus = "pending" | "approved" | "rejected" | "waitlisted" | "withdrawn";

/** Returned to the applicant (their own application). */
export interface ApplicationDto {
  applicationId: string;
  hackathonId: string;
  hackathonTitle: string;
  teamId: string | null;
  teamName: string | null;
  status: ApplicationStatus;
  rejectionReason: string | null;
  createdAt: string;
}

/** One of an applicant's tagged skills, as shown to a reviewer. */
export interface ApplicantSkillDto {
  name: string;
  /** Auto-verified from the applicant's GitHub activity (see GithubService). */
  verified: boolean;
}

/** Returned to the org/reviewer (one applicant for a hackathon). */
export interface ApplicantDto {
  applicationId: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  teamId: string | null;
  teamName: string | null;
  status: ApplicationStatus;
  createdAt: string;
  skills: ApplicantSkillDto[];
  githubVerifiedSkillCount: number;
}

export interface ApplicationStatsDto {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  waitlisted: number;
  maxParticipants: number | null;
}

@Injectable()
export class ApplicationsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly notifications: NotificationsService,
    private readonly authz: AuthzService,
    private readonly mail: MailService,
  ) {}

  async create(userId: string, input: CreateApplicationInput): Promise<ApplicationDto> {
    // Caller must be a member.
    const [member] = await this.db
      .select({ userId: members.userId })
      .from(members)
      .where(eq(members.userId, userId))
      .limit(1);
    if (!member) {
      throw new ForbiddenException("Only members can apply to hackathons");
    }

    // Hackathon must exist and be open for registration.
    const [hackathon] = await this.db
      .select({
        hackathonId: hackathons.hackathonId,
        organizationId: hackathons.organizationId,
        title: hackathons.title,
        registrationDeadline: hackathons.registrationDeadline,
        maxParticipants: hackathons.maxParticipants,
        status: hackathons.status,
      })
      .from(hackathons)
      .where(eq(hackathons.hackathonId, input.hackathonId))
      .limit(1);
    if (!hackathon) {
      throw new NotFoundException("Hackathon not found");
    }

    if (hackathon.status !== "upcoming") {
      throw new BadRequestException("Registration is closed — hackathon is no longer upcoming");
    }

    if (new Date() > hackathon.registrationDeadline) {
      throw new BadRequestException("Registration deadline has passed");
    }

    if (hackathon.maxParticipants !== null) {
      const [{ approvedCount }] = await this.db
        .select({
          approvedCount: sql<number>`count(*)::int`,
        })
        .from(applications)
        .where(
          and(
            eq(applications.hackathonId, input.hackathonId),
            eq(applications.status, "approved"),
            isNull(applications.deletedAt),
          ),
        );
      if (Number(approvedCount) >= hackathon.maxParticipants) {
        throw new BadRequestException("Hackathon is full — no more spots available");
      }
    }

    // No active (non-deleted) application by this caller for this hackathon.
    const [existing] = await this.db
      .select({ applicationId: applications.applicationId })
      .from(applications)
      .where(
        and(
          eq(applications.userId, userId),
          eq(applications.hackathonId, input.hackathonId),
          isNull(applications.deletedAt),
        ),
      )
      .limit(1);
    if (existing) {
      throw new ConflictException("You already have an active application for this hackathon");
    }

    await this.assertAnswersCompleteForm(input.hackathonId, input.answers);

    const applicationId = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(applications)
        .values({
          userId,
          hackathonId: input.hackathonId,
          teamId: input.teamId ?? null,
          status: "pending",
        })
        .returning({ applicationId: applications.applicationId });

      if (input.answers && input.answers.length > 0) {
        await tx.insert(questionAnswers).values(
          input.answers.map((a) => ({
            applicationId: created.applicationId,
            questionId: a.questionId,
            answer: a.answer,
          })),
        );
      }
      return created.applicationId;
    });

    // Notify the organizer about the new application (best-effort).
    this.notifications
      .create({
        userId: hackathon.organizationId,
        type: "new_application",
        title: "Nova prijava",
        body: `Novi korisnik je aplicirao na vaš hakaton „${hackathon.title}".`,
        entityType: "application",
        entityId: applicationId,
      })
      .catch(() => undefined);

    return this.getOwnApplication(applicationId);
  }

  /* ── Team application ────────────────────────────────────── */

  /**
   * Creates individual applications for every active team member.
   * Members who already have a non-deleted application for this hackathon are
   * silently skipped. Returns the newly created ApplicationDtos.
   */
  async createTeam(callerId: string, input: CreateTeamApplicationInput): Promise<ApplicationDto[]> {
    // Caller must be a member.
    const [member] = await this.db
      .select({ userId: members.userId })
      .from(members)
      .where(eq(members.userId, callerId))
      .limit(1);
    if (!member) {
      throw new ForbiddenException("Only members can apply to hackathons");
    }

    // Caller must be an active member of the team.
    const [callerMembership] = await this.db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, input.teamId),
          eq(teamMembers.userId, callerId),
          activeTeamMember,
        ),
      )
      .limit(1);
    if (!callerMembership) {
      throw new ForbiddenException("You are not an active member of this team");
    }

    // Validate hackathon.
    const [hackathon] = await this.db
      .select({
        hackathonId: hackathons.hackathonId,
        organizationId: hackathons.organizationId,
        title: hackathons.title,
        registrationDeadline: hackathons.registrationDeadline,
        maxParticipants: hackathons.maxParticipants,
        status: hackathons.status,
      })
      .from(hackathons)
      .where(eq(hackathons.hackathonId, input.hackathonId))
      .limit(1);
    if (!hackathon) throw new NotFoundException("Hackathon not found");

    if (hackathon.status !== "upcoming") {
      throw new BadRequestException("Registration is closed — hackathon is no longer upcoming");
    }
    if (new Date() > hackathon.registrationDeadline) {
      throw new BadRequestException("Registration deadline has passed");
    }

    await this.assertAnswersCompleteForm(input.hackathonId, input.answers);

    // Fetch all active team members.
    const teamMemberRows = await this.db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, input.teamId), activeTeamMember));

    if (teamMemberRows.length === 0) {
      throw new NotFoundException("Team has no active members");
    }

    const memberUserIds = teamMemberRows.map((r) => r.userId);

    // Find members who already have an active application.
    const existing = await this.db
      .select({ userId: applications.userId })
      .from(applications)
      .where(and(eq(applications.hackathonId, input.hackathonId), isNull(applications.deletedAt)));
    const alreadyApplied = new Set(existing.map((r) => r.userId));

    const toApply = memberUserIds.filter((uid) => !alreadyApplied.has(uid));
    if (toApply.length === 0) {
      return [];
    }

    const createdIds = await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(applications)
        .values(
          toApply.map((uid) => ({
            userId: uid,
            hackathonId: input.hackathonId,
            teamId: input.teamId,
            status: "pending" as const,
          })),
        )
        .returning({ applicationId: applications.applicationId });

      if (input.answers && input.answers.length > 0) {
        await tx.insert(questionAnswers).values(
          inserted.flatMap((app) =>
            input.answers!.map((a) => ({
              applicationId: app.applicationId,
              questionId: a.questionId,
              answer: a.answer,
            })),
          ),
        );
      }

      return inserted.map((r) => r.applicationId);
    });

    // Notify the organizer once about the batch.
    this.notifications
      .create({
        userId: hackathon.organizationId,
        type: "new_application",
        title: "Nova timska prijava",
        body: `Tim je aplicirao na vaš hakaton „${hackathon.title}" (${createdIds.length} ${createdIds.length === 1 ? "član" : "člana/članova"}).`,
        entityType: "hackathon",
        entityId: input.hackathonId,
      })
      .catch(() => undefined);

    return Promise.all(createdIds.map((id) => this.getOwnApplication(id)));
  }

  /**
   * Validates submitted answers against the hackathon's application form:
   * every answer must reference a question on this form (no duplicates), and
   * every required question must receive a non-blank answer.
   */
  private async assertAnswersCompleteForm(
    hackathonId: string,
    answers: { questionId: string; answer: string }[] | undefined,
  ): Promise<void> {
    const questions = await this.db
      .select({
        questionId: applicationQuestions.questionId,
        prompt: applicationQuestions.prompt,
        required: applicationQuestions.required,
      })
      .from(applicationQuestions)
      .where(eq(applicationQuestions.hackathonId, hackathonId));

    const known = new Set(questions.map((q) => q.questionId));
    const answered = new Map<string, string>();
    for (const a of answers ?? []) {
      if (!known.has(a.questionId)) {
        throw new BadRequestException(
          "Answer references a question that is not on this hackathon's application form",
        );
      }
      if (answered.has(a.questionId)) {
        throw new BadRequestException("Duplicate answer for the same question");
      }
      answered.set(a.questionId, a.answer);
    }

    const missing = questions.filter(
      (q) => q.required && (answered.get(q.questionId) ?? "").trim() === "",
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `All required questions must be answered (missing: ${missing
          .map((q) => `"${q.prompt}"`)
          .join(", ")})`,
      );
    }
  }

  /* ── Application-form questions ──────────────────────────── */

  async listQuestions(hackathonId: string): Promise<ApplicationQuestionDto[]> {
    const rows = await this.db
      .select({
        questionId: applicationQuestions.questionId,
        hackathonId: applicationQuestions.hackathonId,
        prompt: applicationQuestions.prompt,
        type: applicationQuestions.type,
        options: applicationQuestions.options,
        required: applicationQuestions.required,
        allowOther: applicationQuestions.allowOther,
        position: applicationQuestions.position,
      })
      .from(applicationQuestions)
      .where(eq(applicationQuestions.hackathonId, hackathonId))
      .orderBy(asc(applicationQuestions.position));

    return rows.map((r) => ({
      questionId: r.questionId,
      hackathonId: r.hackathonId,
      prompt: r.prompt,
      type: r.type as QuestionType,
      options: (r.options as string[] | null) ?? null,
      required: r.required,
      allowOther: r.allowOther,
      position: r.position,
    }));
  }

  async createQuestion(
    hackathonId: string,
    userId: string,
    input: CreateQuestionInput,
  ): Promise<ApplicationQuestionDto> {
    await this.authz.assertHackathonOwnerOrAdmin(hackathonId, userId);
    const [hackathon] = await this.db
      .select({ hackathonId: hackathons.hackathonId })
      .from(hackathons)
      .where(eq(hackathons.hackathonId, hackathonId))
      .limit(1);
    if (!hackathon) throw new NotFoundException("Hackathon not found");

    const isChoice = input.type === "single_choice" || input.type === "multi_choice";
    const [row] = await this.db
      .insert(applicationQuestions)
      .values({
        hackathonId,
        prompt: input.prompt,
        type: input.type,
        options: isChoice ? (input.options ?? []) : null,
        required: input.required,
        allowOther: isChoice ? input.allowOther : false,
        position: input.position ?? 0,
      })
      .returning();

    return {
      questionId: row.questionId,
      hackathonId: row.hackathonId,
      prompt: row.prompt,
      type: row.type as QuestionType,
      options: (row.options as string[] | null) ?? null,
      required: row.required,
      allowOther: row.allowOther,
      position: row.position,
    };
  }

  /**
   * Update a form question (owner-or-admin via its hackathon). Only provided
   * fields change. `options` is required for choice types and forbidden/cleared
   * for text types, validated against the *effective* (post-merge) type so a
   * single PATCH can change a text question into a choice one and vice-versa.
   */
  async updateQuestion(
    questionId: string,
    userId: string,
    input: UpdateQuestionInput,
  ): Promise<ApplicationQuestionDto> {
    const [existing] = await this.db
      .select({
        questionId: applicationQuestions.questionId,
        hackathonId: applicationQuestions.hackathonId,
        type: applicationQuestions.type,
        options: applicationQuestions.options,
      })
      .from(applicationQuestions)
      .where(eq(applicationQuestions.questionId, questionId))
      .limit(1);
    if (!existing) throw new NotFoundException("Question not found");
    await this.authz.assertHackathonOwnerOrAdmin(existing.hackathonId, userId);

    const effectiveType = (input.type ?? existing.type) as QuestionType;
    const isChoice = effectiveType === "single_choice" || effectiveType === "multi_choice";

    // Effective options after the merge: provided > existing.
    const providedOptions = input.options;
    const existingOptions = (existing.options as string[] | null) ?? null;

    let nextOptions: string[] | null;
    if (isChoice) {
      const options = providedOptions ?? existingOptions;
      if (!options || options.length === 0) {
        throw new BadRequestException("Choice questions require a non-empty options array");
      }
      nextOptions = options;
    } else {
      // Clear stale options when a choice question is changed to a text type;
      // there is no DB CHECK enforcing this so we normalise proactively.
      nextOptions = null;
    }

    const patch: Record<string, unknown> = {};
    if (input.prompt !== undefined) patch.prompt = input.prompt;
    if (input.type !== undefined) patch.type = input.type;
    if (input.required !== undefined) patch.required = input.required;
    if (input.position !== undefined) patch.position = input.position;
    // options is always recomputed when type or options touched, or when the
    // effective type is text (to clear stale options).
    if (input.options !== undefined || input.type !== undefined || !isChoice) {
      patch.options = nextOptions;
    }
    // allowOther only applies to choice types; clear it when text, else honour
    // the provided value.
    if (!isChoice) {
      patch.allowOther = false;
    } else if (input.allowOther !== undefined) {
      patch.allowOther = input.allowOther;
    }

    const [row] = await this.db
      .update(applicationQuestions)
      .set(patch)
      .where(eq(applicationQuestions.questionId, questionId))
      .returning();

    return {
      questionId: row.questionId,
      hackathonId: row.hackathonId,
      prompt: row.prompt,
      type: row.type as QuestionType,
      options: (row.options as string[] | null) ?? null,
      required: row.required,
      allowOther: row.allowOther,
      position: row.position,
    };
  }

  /**
   * Delete a form question (owner-or-admin via its hackathon). The
   * `question_answers.question_id` FK is ON DELETE CASCADE, so any existing
   * answers to this question are removed automatically by the database.
   */
  async deleteQuestion(questionId: string, userId: string): Promise<{ success: true }> {
    const [existing] = await this.db
      .select({ hackathonId: applicationQuestions.hackathonId })
      .from(applicationQuestions)
      .where(eq(applicationQuestions.questionId, questionId))
      .limit(1);
    if (!existing) throw new NotFoundException("Question not found");
    await this.authz.assertHackathonOwnerOrAdmin(existing.hackathonId, userId);

    await this.db
      .delete(applicationQuestions)
      .where(eq(applicationQuestions.questionId, questionId));

    return { success: true };
  }

  async getAnswers(applicationId: string, userId: string): Promise<ApplicationAnswerDto[]> {
    const [app] = await this.db
      .select({ hackathonId: applications.hackathonId })
      .from(applications)
      .where(eq(applications.applicationId, applicationId))
      .limit(1);
    if (!app) throw new NotFoundException("Application not found");
    await this.authz.assertHackathonOwnerOrAdmin(app.hackathonId, userId);

    const rows = await this.db
      .select({
        questionId: applicationQuestions.questionId,
        prompt: applicationQuestions.prompt,
        type: applicationQuestions.type,
        answer: questionAnswers.answer,
        position: applicationQuestions.position,
      })
      .from(questionAnswers)
      .innerJoin(
        applicationQuestions,
        eq(applicationQuestions.questionId, questionAnswers.questionId),
      )
      .where(eq(questionAnswers.applicationId, applicationId))
      .orderBy(asc(applicationQuestions.position));

    return rows.map((r) => ({
      questionId: r.questionId,
      prompt: r.prompt,
      type: r.type as QuestionType,
      answer: r.answer,
    }));
  }

  async listMine(userId: string): Promise<ApplicationDto[]> {
    const rows = await this.db
      .select({
        applicationId: applications.applicationId,
        hackathonId: applications.hackathonId,
        hackathonTitle: hackathons.title,
        teamId: applications.teamId,
        teamName: teams.name,
        status: applications.status,
        rejectionReason: applications.rejectionReason,
        createdAt: applications.createdAt,
      })
      .from(applications)
      .innerJoin(hackathons, eq(hackathons.hackathonId, applications.hackathonId))
      .leftJoin(teams, eq(teams.teamId, applications.teamId))
      .where(and(eq(applications.userId, userId), isNull(applications.deletedAt)))
      .orderBy(desc(applications.createdAt));

    return rows.map((r) => ({
      applicationId: r.applicationId,
      hackathonId: r.hackathonId,
      hackathonTitle: r.hackathonTitle,
      teamId: r.teamId,
      teamName: r.teamName,
      status: r.status,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * `GET /applications/hackathon/:hackathonId`, optionally narrowed by
   * `filter.skills` / `filter.githubVerified` and ordered by `filter.sortBy`
   * ("recent" — the default, most recent first — "skills", by matching-skill
   * count when `skills` is given (else total skill count), or "github", by
   * GitHub-verified skill count). Ties always fall back to most-recent-first.
   */
  async listForHackathon(
    hackathonId: string,
    userId: string,
    filter?: ApplicantFilterInput,
  ): Promise<ApplicantDto[]> {
    await this.authz.assertHackathonOwnerOrAdmin(hackathonId, userId);
    const rows = await this.db
      .select({
        applicationId: applications.applicationId,
        userId: applications.userId,
        username: users.username,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
        teamId: applications.teamId,
        teamName: teams.name,
        status: applications.status,
        createdAt: applications.createdAt,
      })
      .from(applications)
      .innerJoin(users, eq(users.userId, applications.userId))
      .leftJoin(teams, eq(teams.teamId, applications.teamId))
      .where(and(eq(applications.hackathonId, hackathonId), isNull(applications.deletedAt)))
      .orderBy(desc(applications.createdAt));

    if (rows.length === 0) return [];

    const skillRows = await this.db
      .select({
        userId: memberSkills.userId,
        name: skills.name,
        verified: memberSkills.verified,
      })
      .from(memberSkills)
      .innerJoin(skills, eq(skills.skillId, memberSkills.skillId))
      .where(
        inArray(
          memberSkills.userId,
          rows.map((r) => r.userId),
        ),
      );

    const skillMap = new Map<string, ApplicantSkillDto[]>();
    for (const s of skillRows) {
      const list = skillMap.get(s.userId) ?? [];
      list.push({ name: s.name, verified: s.verified });
      skillMap.set(s.userId, list);
    }

    const wantedSkills = new Set((filter?.skills ?? []).map((s) => s.toLowerCase()));

    let applicants = rows.map((r) => {
      const applicantSkills = skillMap.get(r.userId) ?? [];
      return {
        applicationId: r.applicationId,
        userId: r.userId,
        username: r.username,
        avatarUrl: r.avatarUrl,
        bio: r.bio,
        teamId: r.teamId,
        teamName: r.teamName,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        skills: applicantSkills,
        githubVerifiedSkillCount: applicantSkills.filter((s) => s.verified).length,
        matchedSkillCount: applicantSkills.filter((s) => wantedSkills.has(s.name.toLowerCase()))
          .length,
      };
    });

    if (wantedSkills.size > 0) {
      applicants = applicants.filter((a) => a.matchedSkillCount > 0);
    }
    if (filter?.githubVerified !== undefined) {
      applicants = applicants.filter(
        (a) => a.githubVerifiedSkillCount > 0 === filter.githubVerified,
      );
    }

    // JS sort is stable in V8; ties preserve the DB result's most-recent-first
    // order because the rows were fetched with orderBy(desc(createdAt)) above.
    const skillScore = (a: (typeof applicants)[number]) =>
      wantedSkills.size > 0 ? a.matchedSkillCount : a.skills.length;
    if (filter?.sortBy === "skills") {
      applicants.sort((a, b) => skillScore(b) - skillScore(a));
    } else if (filter?.sortBy === "github") {
      applicants.sort((a, b) => b.githubVerifiedSkillCount - a.githubVerifiedSkillCount);
    }

    return applicants.map(({ matchedSkillCount: _matchedSkillCount, ...a }) => a);
  }

  async statsForHackathon(hackathonId: string, userId: string): Promise<ApplicationStatsDto> {
    await this.authz.assertHackathonOwnerOrAdmin(hackathonId, userId);
    const [hackathon] = await this.db
      .select({ maxParticipants: hackathons.maxParticipants })
      .from(hackathons)
      .where(eq(hackathons.hackathonId, hackathonId))
      .limit(1);
    if (!hackathon) {
      throw new NotFoundException("Hackathon not found");
    }

    const [stats] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${applications.status} = 'pending')::int`,
        approved: sql<number>`count(*) filter (where ${applications.status} = 'approved')::int`,
        rejected: sql<number>`count(*) filter (where ${applications.status} = 'rejected')::int`,
        waitlisted: sql<number>`count(*) filter (where ${applications.status} = 'waitlisted')::int`,
      })
      .from(applications)
      .where(and(eq(applications.hackathonId, hackathonId), isNull(applications.deletedAt)));

    return {
      total: stats?.total ?? 0,
      pending: stats?.pending ?? 0,
      approved: stats?.approved ?? 0,
      rejected: stats?.rejected ?? 0,
      waitlisted: stats?.waitlisted ?? 0,
      maxParticipants: hackathon.maxParticipants,
    };
  }

  async approve(applicationId: string, reviewerId: string): Promise<ApplicationDto> {
    const [existing] = await this.db
      .select({
        applicationId: applications.applicationId,
        userId: applications.userId,
        hackathonId: applications.hackathonId,
        status: applications.status,
      })
      .from(applications)
      .where(and(eq(applications.applicationId, applicationId), isNull(applications.deletedAt)))
      .limit(1);
    if (!existing) {
      throw new NotFoundException("Application not found");
    }

    await this.authz.assertHackathonOwnerOrAdmin(existing.hackathonId, reviewerId);

    // SSU11: approvals must respect the hackathon's participant cap — the cap
    // is enforced at application time too, but approvals can outnumber spots
    // when more applications arrive than the hackathon can take.
    if (existing.status !== "approved") {
      const [hackathon] = await this.db
        .select({ maxParticipants: hackathons.maxParticipants })
        .from(hackathons)
        .where(eq(hackathons.hackathonId, existing.hackathonId))
        .limit(1);
      if (hackathon?.maxParticipants != null) {
        const [{ approvedCount }] = await this.db
          .select({ approvedCount: sql<number>`count(*)::int` })
          .from(applications)
          .where(
            and(
              eq(applications.hackathonId, existing.hackathonId),
              eq(applications.status, "approved"),
              isNull(applications.deletedAt),
            ),
          );
        if (Number(approvedCount) >= hackathon.maxParticipants) {
          throw new BadRequestException(
            "Hackathon is full — the maximum number of participants has been approved",
          );
        }
      }
    }

    await this.db
      .update(applications)
      .set({
        status: "approved",
        rejectionReason: null,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(applications.applicationId, applicationId));

    // Server access is an explicit role grant made at approval time; it is NOT
    // re-derived from application.status on each request (see isServerMember).
    await this.grantServerMembership(existing.hackathonId, existing.userId);

    await this.notifyDecision(existing.userId, existing.hackathonId, "approved");
    return this.getOwnApplication(applicationId);
  }

  /**
   * SSU11 "Odobri tim": approves every active (pending/waitlisted) application
   * that shares the given application's team in one action. Falls back to a
   * single approve when the application has no team. The hackathon's
   * `maxParticipants` cap counts the whole batch, so a team never squeezes
   * past the limit member-by-member.
   */
  async approveTeam(applicationId: string, reviewerId: string): Promise<ApplicationDto[]> {
    const [anchor] = await this.db
      .select({
        applicationId: applications.applicationId,
        userId: applications.userId,
        hackathonId: applications.hackathonId,
        teamId: applications.teamId,
      })
      .from(applications)
      .where(and(eq(applications.applicationId, applicationId), isNull(applications.deletedAt)))
      .limit(1);
    if (!anchor) {
      throw new NotFoundException("Application not found");
    }

    await this.authz.assertHackathonOwnerOrAdmin(anchor.hackathonId, reviewerId);

    if (!anchor.teamId) {
      return [await this.approve(applicationId, reviewerId)];
    }

    // Every still-open application from this team on this hackathon.
    const teamApps = await this.db
      .select({
        applicationId: applications.applicationId,
        userId: applications.userId,
        status: applications.status,
      })
      .from(applications)
      .where(
        and(
          eq(applications.hackathonId, anchor.hackathonId),
          eq(applications.teamId, anchor.teamId),
          isNull(applications.deletedAt),
        ),
      );
    const toApprove = teamApps.filter((a) => a.status === "pending" || a.status === "waitlisted");
    if (toApprove.length === 0) {
      throw new BadRequestException("Team has no open applications to approve");
    }

    const [hackathon] = await this.db
      .select({ maxParticipants: hackathons.maxParticipants })
      .from(hackathons)
      .where(eq(hackathons.hackathonId, anchor.hackathonId))
      .limit(1);
    if (hackathon?.maxParticipants != null) {
      const [{ approvedCount }] = await this.db
        .select({ approvedCount: sql<number>`count(*)::int` })
        .from(applications)
        .where(
          and(
            eq(applications.hackathonId, anchor.hackathonId),
            eq(applications.status, "approved"),
            isNull(applications.deletedAt),
          ),
        );
      if (Number(approvedCount) + toApprove.length > hackathon.maxParticipants) {
        throw new BadRequestException(
          "Approving the whole team would exceed the hackathon's participant limit",
        );
      }
    }

    await this.db
      .update(applications)
      .set({
        status: "approved",
        rejectionReason: null,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        inArray(
          applications.applicationId,
          toApprove.map((a) => a.applicationId),
        ),
      );

    for (const app of toApprove) {
      await this.grantServerMembership(anchor.hackathonId, app.userId);
      await this.notifyDecision(app.userId, anchor.hackathonId, "approved");
    }

    return Promise.all(toApprove.map((a) => this.getOwnApplication(a.applicationId)));
  }

  /**
   * Grant the applicant a "Participant" role in the hackathon's cohor server so
   * server access follows acceptance. No-op when the hackathon has no server or
   * the user is not a platform member. Best-effort — never blocks approval.
   */
  private async grantServerMembership(hackathonId: string, userId: string): Promise<void> {
    try {
      const [server] = await this.db
        .select({ serverId: servers.serverId })
        .from(servers)
        .where(eq(servers.hackathonId, hackathonId))
        .limit(1);
      if (!server) return;

      const [member] = await this.db
        .select({ userId: members.userId })
        .from(members)
        .where(eq(members.userId, userId))
        .limit(1);
      if (!member) return;

      let [role] = await this.db
        .select({ serverRoleId: serverRoles.serverRoleId })
        .from(serverRoles)
        .where(and(eq(serverRoles.serverId, server.serverId), eq(serverRoles.name, "Participant")))
        .limit(1);
      if (!role) {
        [role] = await this.db
          .insert(serverRoles)
          .values({ serverId: server.serverId, name: "Participant" })
          .returning({ serverRoleId: serverRoles.serverRoleId });
      }

      await this.db
        .insert(userRoles)
        .values({ serverRoleId: role.serverRoleId, userId })
        .onConflictDoNothing();
    } catch {
      /* membership grant is best-effort; never block approval */
    }
  }

  /** Inserts an application_approved / application_rejected notification. */
  private async notifyDecision(
    userId: string,
    hackathonId: string,
    decision: "approved" | "rejected",
    reason?: string,
  ): Promise<void> {
    const [hk] = await this.db
      .select({ title: hackathons.title })
      .from(hackathons)
      .where(eq(hackathons.hackathonId, hackathonId))
      .limit(1);
    const title = hk?.title ?? "hakaton";
    const subject = decision === "approved" ? "Prijava odobrena" : "Prijava odbijena";
    const body =
      decision === "approved"
        ? `Tvoja prijava za ${title} je odobrena. 🎉`
        : `Tvoja prijava za ${title} je odbijena.${reason ? ` Razlog: ${reason}` : ""}`;

    await this.notifications.create({
      userId,
      type: decision === "approved" ? "application_approved" : "application_rejected",
      title: subject,
      body,
      entityType: "hackathon",
      entityId: hackathonId,
    });

    try {
      const [user] = await this.db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.userId, userId))
        .limit(1);
      if (user?.email) {
        await this.mail.sendMail(user.email, subject, `<p>${body}</p>`);
      }
    } catch (err) {
      console.error(`[applications] failed to send ${decision} email to user ${userId}:`, err);
    }
  }

  async reject(
    applicationId: string,
    reviewerId: string,
    input: RejectApplicationInput,
  ): Promise<ApplicationDto> {
    const [existing] = await this.db
      .select({
        applicationId: applications.applicationId,
        userId: applications.userId,
        hackathonId: applications.hackathonId,
      })
      .from(applications)
      .where(and(eq(applications.applicationId, applicationId), isNull(applications.deletedAt)))
      .limit(1);
    if (!existing) {
      throw new NotFoundException("Application not found");
    }

    await this.authz.assertHackathonOwnerOrAdmin(existing.hackathonId, reviewerId);

    await this.db
      .update(applications)
      .set({
        status: "rejected",
        rejectionReason: input.reason ?? null,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(applications.applicationId, applicationId));

    await this.notifyDecision(existing.userId, existing.hackathonId, "rejected", input.reason);
    return this.getOwnApplication(applicationId);
  }

  async withdraw(
    applicationId: string,
    userId: string,
    input: WithdrawApplicationInput,
  ): Promise<ApplicationDto> {
    const [existing] = await this.db
      .select({
        applicationId: applications.applicationId,
        userId: applications.userId,
        status: applications.status,
        hackathonId: applications.hackathonId,
      })
      .from(applications)
      .where(eq(applications.applicationId, applicationId))
      .limit(1);

    if (!existing) throw new NotFoundException("Application not found");

    if (existing.userId !== userId) {
      throw new ForbiddenException("You can only withdraw your own application");
    }

    const withdrawable: ApplicationStatus[] = ["pending", "approved"];
    if (!withdrawable.includes(existing.status as ApplicationStatus)) {
      throw new BadRequestException(
        `Cannot withdraw an application with status '${existing.status}'`,
      );
    }

    await this.db
      .update(applications)
      .set({ status: "withdrawn", deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(applications.applicationId, applicationId));

    return this.getOwnApplication(applicationId);
  }

  /** Loads a single application in the applicant-facing ApplicationDto shape. */
  private async getOwnApplication(applicationId: string): Promise<ApplicationDto> {
    const [row] = await this.db
      .select({
        applicationId: applications.applicationId,
        hackathonId: applications.hackathonId,
        hackathonTitle: hackathons.title,
        teamId: applications.teamId,
        teamName: teams.name,
        status: applications.status,
        rejectionReason: applications.rejectionReason,
        createdAt: applications.createdAt,
      })
      .from(applications)
      .innerJoin(hackathons, eq(hackathons.hackathonId, applications.hackathonId))
      .leftJoin(teams, eq(teams.teamId, applications.teamId))
      .where(eq(applications.applicationId, applicationId))
      .limit(1);

    if (!row) {
      throw new NotFoundException("Application not found");
    }

    return {
      applicationId: row.applicationId,
      hackathonId: row.hackathonId,
      hackathonTitle: row.hackathonTitle,
      teamId: row.teamId,
      teamName: row.teamName,
      status: row.status,
      rejectionReason: row.rejectionReason,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
