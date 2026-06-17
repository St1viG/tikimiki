import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import {
  applicationQuestions,
  applications,
  hackathons,
  members,
  questionAnswers,
  serverRoles,
  servers,
  teams,
  userRoles,
  users,
} from "../db/schema";
import { AuthzService } from "../common/authz.service";
import { NotificationsService } from "../notifications/notifications.service";
import type {
  CreateApplicationInput,
  CreateQuestionInput,
  RejectApplicationInput,
  UpdateQuestionInput,
} from "./dto";

export type QuestionType =
  | "short_text"
  | "long_text"
  | "single_choice"
  | "multi_choice";

/** A custom question on a hackathon's application form. */
export interface ApplicationQuestionDto {
  questionId: string;
  hackathonId: string;
  prompt: string;
  type: QuestionType;
  options: string[] | null;
  required: boolean;
  position: number;
}

/** An applicant's answer, joined with its question (review view). */
export interface ApplicationAnswerDto {
  questionId: string;
  prompt: string;
  type: QuestionType;
  answer: string;
}

export type ApplicationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "waitlisted"
  | "withdrawn";

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
  ) {}

  async create(
    userId: string,
    input: CreateApplicationInput,
  ): Promise<ApplicationDto> {
    // Caller must be a member.
    const [member] = await this.db
      .select({ userId: members.userId })
      .from(members)
      .where(eq(members.userId, userId))
      .limit(1);
    if (!member) {
      throw new ForbiddenException("Only members can apply to hackathons");
    }

    // Hackathon must exist.
    const [hackathon] = await this.db
      .select({ hackathonId: hackathons.hackathonId })
      .from(hackathons)
      .where(eq(hackathons.hackathonId, input.hackathonId))
      .limit(1);
    if (!hackathon) {
      throw new NotFoundException("Hackathon not found");
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
      throw new ConflictException(
        "You already have an active application for this hackathon",
      );
    }

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

    return this.getOwnApplication(applicationId);
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

    const isChoice =
      input.type === "single_choice" || input.type === "multi_choice";
    const [row] = await this.db
      .insert(applicationQuestions)
      .values({
        hackathonId,
        prompt: input.prompt,
        type: input.type,
        options: isChoice ? (input.options ?? []) : null,
        required: input.required,
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
    const isChoice =
      effectiveType === "single_choice" || effectiveType === "multi_choice";

    // Effective options after the merge: provided > existing.
    const providedOptions = input.options;
    const existingOptions = (existing.options as string[] | null) ?? null;

    let nextOptions: string[] | null;
    if (isChoice) {
      const options = providedOptions ?? existingOptions;
      if (!options || options.length === 0) {
        throw new BadRequestException(
          "Choice questions require a non-empty options array",
        );
      }
      nextOptions = options;
    } else {
      // Text types never carry options (DB CHECK forbids non-null here only
      // implicitly — we normalise to null so the column stays clean).
      nextOptions = null;
    }

    const patch: Record<string, unknown> = {};
    if (input.prompt !== undefined) patch.prompt = input.prompt;
    if (input.type !== undefined) patch.type = input.type;
    if (input.required !== undefined) patch.required = input.required;
    if (input.position !== undefined) patch.position = input.position;
    // options is always recomputed when type or options touched, or when the
    // effective type is text (to clear stale options).
    if (
      input.options !== undefined ||
      input.type !== undefined ||
      !isChoice
    ) {
      patch.options = nextOptions;
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
      position: row.position,
    };
  }

  /**
   * Delete a form question (owner-or-admin via its hackathon). The
   * `question_answers.question_id` FK is ON DELETE CASCADE, so any existing
   * answers to this question are removed automatically by the database.
   */
  async deleteQuestion(
    questionId: string,
    userId: string,
  ): Promise<{ success: true }> {
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

  async getAnswers(
    applicationId: string,
    userId: string,
  ): Promise<ApplicationAnswerDto[]> {
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
      .innerJoin(
        hackathons,
        eq(hackathons.hackathonId, applications.hackathonId),
      )
      .leftJoin(teams, eq(teams.teamId, applications.teamId))
      .where(
        and(eq(applications.userId, userId), isNull(applications.deletedAt)),
      )
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

  async listForHackathon(
    hackathonId: string,
    userId: string,
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
      .where(
        and(
          eq(applications.hackathonId, hackathonId),
          isNull(applications.deletedAt),
        ),
      )
      .orderBy(desc(applications.createdAt));

    return rows.map((r) => ({
      applicationId: r.applicationId,
      userId: r.userId,
      username: r.username,
      avatarUrl: r.avatarUrl,
      bio: r.bio,
      teamId: r.teamId,
      teamName: r.teamName,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async statsForHackathon(
    hackathonId: string,
    userId: string,
  ): Promise<ApplicationStatsDto> {
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
      .where(
        and(
          eq(applications.hackathonId, hackathonId),
          isNull(applications.deletedAt),
        ),
      );

    return {
      total: stats?.total ?? 0,
      pending: stats?.pending ?? 0,
      approved: stats?.approved ?? 0,
      rejected: stats?.rejected ?? 0,
      waitlisted: stats?.waitlisted ?? 0,
      maxParticipants: hackathon.maxParticipants,
    };
  }

  async approve(
    applicationId: string,
    reviewerId: string,
  ): Promise<ApplicationDto> {
    const [existing] = await this.db
      .select({
        applicationId: applications.applicationId,
        userId: applications.userId,
        hackathonId: applications.hackathonId,
      })
      .from(applications)
      .where(
        and(
          eq(applications.applicationId, applicationId),
          isNull(applications.deletedAt),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new NotFoundException("Application not found");
    }

    await this.authz.assertHackathonOwnerOrAdmin(
      existing.hackathonId,
      reviewerId,
    );

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

    // Approval grants cohor server access (role-based, not status-derived).
    await this.grantServerMembership(existing.hackathonId, existing.userId);

    await this.notifyDecision(existing.userId, existing.hackathonId, "approved");
    return this.getOwnApplication(applicationId);
  }

  /**
   * Grant the applicant a "Participant" role in the hackathon's cohor server so
   * server access follows acceptance. No-op when the hackathon has no server or
   * the user is not a platform member. Best-effort — never blocks approval.
   */
  private async grantServerMembership(
    hackathonId: string,
    userId: string,
  ): Promise<void> {
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
        .where(
          and(
            eq(serverRoles.serverId, server.serverId),
            eq(serverRoles.name, "Participant"),
          ),
        )
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
    await this.notifications.create({
      userId,
      type:
        decision === "approved"
          ? "application_approved"
          : "application_rejected",
      title:
        decision === "approved" ? "Prijava odobrena" : "Prijava odbijena",
      body:
        decision === "approved"
          ? `Tvoja prijava za ${title} je odobrena. 🎉`
          : `Tvoja prijava za ${title} je odbijena.${reason ? ` Razlog: ${reason}` : ""}`,
      entityType: "hackathon",
      entityId: hackathonId,
    });
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
      .where(
        and(
          eq(applications.applicationId, applicationId),
          isNull(applications.deletedAt),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new NotFoundException("Application not found");
    }

    await this.authz.assertHackathonOwnerOrAdmin(
      existing.hackathonId,
      reviewerId,
    );

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

    await this.notifyDecision(
      existing.userId,
      existing.hackathonId,
      "rejected",
      input.reason,
    );
    return this.getOwnApplication(applicationId);
  }

  /** Loads a single application in the applicant-facing ApplicationDto shape. */
  private async getOwnApplication(
    applicationId: string,
  ): Promise<ApplicationDto> {
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
      .innerJoin(
        hackathons,
        eq(hackathons.hackathonId, applications.hackathonId),
      )
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
