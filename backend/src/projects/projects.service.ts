import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { unlink } from "fs/promises";
import { basename, join } from "path";
import { and, asc, eq, isNull } from "drizzle-orm";
import { activeTeamMember } from "../common/team.predicates";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { hackathons, projects, teamMembers, teams } from "../db/schema";
import type { CreateProjectInput, UpdateProjectInput } from "./dto";

export type ProjectStatus = "draft" | "submitted" | "under_review" | "judged";

/** A team's hackathon project. */
export interface ProjectDto {
  projectId: string;
  teamId: string;
  teamName: string;
  hackathonId: string;
  status: ProjectStatus;
  title: string;
  description: string | null;
  repositoryUrl: string | null;
  videoUrl: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A project row joined with its team name + owning hackathon. */
interface ProjectRow {
  projectId: string;
  teamId: string;
  teamName: string;
  hackathonId: string;
  status: ProjectStatus;
  title: string;
  description: string | null;
  repositoryUrl: string | null;
  videoUrl: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  endsAt: Date;
}

/** Absolute path to the directory served statically at "/uploads". */
const UPLOAD_DIR = join(process.cwd(), "uploads");

@Injectable()
export class ProjectsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /* ── helpers ──────────────────────────────────────────────── */

  /**
   * Best-effort removal of a replaced project video from disk so stale files
   * don't pile up in the uploads dir. Only locally-served "/uploads/<file>"
   * urls are touched; failures (already gone, locked, …) are ignored.
   */
  private async deleteUploadedVideo(videoUrl: string): Promise<void> {
    if (!videoUrl.startsWith("/uploads/")) return;
    try {
      // basename() strips any path segments so only files directly inside
      // UPLOAD_DIR can ever be unlinked.
      await unlink(join(UPLOAD_DIR, basename(videoUrl)));
    } catch {
      /* best-effort — ignore missing/locked files */
    }
  }

  private toDto(r: ProjectRow): ProjectDto {
    return {
      projectId: r.projectId,
      teamId: r.teamId,
      teamName: r.teamName,
      hackathonId: r.hackathonId,
      status: r.status,
      title: r.title,
      description: r.description,
      repositoryUrl: r.repositoryUrl,
      videoUrl: r.videoUrl,
      submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  /** Throw 403 unless `userId` is an active member of `teamId`. */
  private async assertTeamMember(teamId: string, userId: string): Promise<void> {
    const [row] = await this.db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId), activeTeamMember))
      .limit(1);
    if (!row) {
      throw new ForbiddenException("Not an active member of this team");
    }
  }

  /** The active team (404 if missing/deleted) with its owning hackathon. */
  private async loadTeam(teamId: string): Promise<{
    teamId: string;
    teamName: string;
    hackathonId: string;
    endsAt: Date;
  }> {
    const [row] = await this.db
      .select({
        teamId: teams.teamId,
        teamName: teams.name,
        hackathonId: teams.hackathonId,
        endsAt: hackathons.endsAt,
      })
      .from(teams)
      .innerJoin(hackathons, eq(hackathons.hackathonId, teams.hackathonId))
      .where(and(eq(teams.teamId, teamId), isNull(teams.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundException("Team not found");
    return row;
  }

  private projectColumns() {
    return {
      projectId: projects.projectId,
      teamId: projects.teamId,
      teamName: teams.name,
      hackathonId: teams.hackathonId,
      status: projects.status,
      title: projects.title,
      description: projects.description,
      repositoryUrl: projects.repositoryUrl,
      videoUrl: projects.videoUrl,
      submittedAt: projects.submittedAt,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      endsAt: hackathons.endsAt,
    };
  }

  /** Load one active project (404 if missing/deleted), joined to team+hackathon. */
  private async loadProject(projectId: string): Promise<ProjectRow> {
    const [row] = await this.db
      .select(this.projectColumns())
      .from(projects)
      .innerJoin(teams, eq(teams.teamId, projects.teamId))
      .innerJoin(hackathons, eq(hackathons.hackathonId, teams.hackathonId))
      .where(and(eq(projects.projectId, projectId), isNull(projects.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundException("Project not found");
    return row as ProjectRow;
  }

  /* ── team-scoped ──────────────────────────────────────────── */

  /** The caller's team's project (or null), team-member only. */
  async getTeamProject(teamId: string, userId: string): Promise<ProjectDto | null> {
    await this.assertTeamMember(teamId, userId);
    const [row] = await this.db
      .select(this.projectColumns())
      .from(projects)
      .innerJoin(teams, eq(teams.teamId, projects.teamId))
      .innerJoin(hackathons, eq(hackathons.hackathonId, teams.hackathonId))
      .where(and(eq(projects.teamId, teamId), isNull(projects.deletedAt)))
      .limit(1);
    return row ? this.toDto(row as ProjectRow) : null;
  }

  /**
   * Create the team's project (draft). A team has at most one active project —
   * a second create is a 409. Team-member only.
   */
  async createProject(
    teamId: string,
    userId: string,
    input: CreateProjectInput,
  ): Promise<ProjectDto> {
    await this.assertTeamMember(teamId, userId);
    await this.loadTeam(teamId);

    const [existing] = await this.db
      .select({ projectId: projects.projectId })
      .from(projects)
      .where(and(eq(projects.teamId, teamId), isNull(projects.deletedAt)))
      .limit(1);
    if (existing) {
      throw new ConflictException("This team already has a project");
    }

    const [created] = await this.db
      .insert(projects)
      .values({
        teamId,
        status: "draft",
        title: input.title,
        description: input.description ?? null,
        repositoryUrl: input.repositoryUrl ?? null,
        videoUrl: input.videoUrl ?? null,
      })
      .returning({ projectId: projects.projectId });

    return this.toDto(await this.loadProject(created.projectId));
  }

  /* ── project-scoped ───────────────────────────────────────── */

  /**
   * Public project detail. Submitted projects are visible to anyone (showcase /
   * judging); a draft is visible only to its own team members (otherwise 404,
   * so a draft's existence isn't leaked).
   */
  async getProject(projectId: string, viewerId: string | null): Promise<ProjectDto> {
    const row = await this.loadProject(projectId);
    if (row.status === "draft") {
      const isMember = viewerId != null && (await this.isTeamMember(row.teamId, viewerId));
      if (!isMember) throw new NotFoundException("Project not found");
    }
    return this.toDto(row);
  }

  private async isTeamMember(teamId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId), activeTeamMember))
      .limit(1);
    return Boolean(row);
  }

  /** Edit a project's details. Team-member only; not allowed once judged. */
  async updateProject(
    projectId: string,
    userId: string,
    input: UpdateProjectInput,
  ): Promise<ProjectDto> {
    const row = await this.loadProject(projectId);
    await this.assertTeamMember(row.teamId, userId);
    if (row.status === "judged") {
      throw new BadRequestException("A judged project can no longer be edited");
    }

    const patch: Partial<typeof projects.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.repositoryUrl !== undefined) patch.repositoryUrl = input.repositoryUrl;
    if (input.videoUrl !== undefined) patch.videoUrl = input.videoUrl;

    await this.db.update(projects).set(patch).where(eq(projects.projectId, projectId));

    // The old presentation video was replaced (or removed) — clean up its file.
    if (input.videoUrl !== undefined && row.videoUrl && row.videoUrl !== input.videoUrl) {
      await this.deleteUploadedVideo(row.videoUrl);
    }

    return this.toDto(await this.loadProject(projectId));
  }

  /**
   * Submit the project for judging (draft → submitted, stamps `submittedAt`).
   * Allowed only up to the hackathon's end. Re-submitting an already-submitted
   * project is a no-op; submitting one that is under review / judged is a 400.
   */
  async submitProject(projectId: string, userId: string): Promise<ProjectDto> {
    const row = await this.loadProject(projectId);
    await this.assertTeamMember(row.teamId, userId);

    if (row.status === "submitted") {
      return this.toDto(row);
    }
    if (row.status !== "draft") {
      throw new BadRequestException(
        "This project is already being judged and cannot be re-submitted",
      );
    }
    if (Date.now() > row.endsAt.getTime()) {
      throw new BadRequestException("The submission period for this hackathon has ended");
    }

    await this.db
      .update(projects)
      .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(projects.projectId, projectId));

    return this.toDto(await this.loadProject(projectId));
  }

  /**
   * Withdraw a submission back to draft (submitted → draft, clears
   * `submittedAt`). Team-member only; not allowed once judging has begun.
   */
  async withdrawProject(projectId: string, userId: string): Promise<ProjectDto> {
    const row = await this.loadProject(projectId);
    await this.assertTeamMember(row.teamId, userId);

    if (row.status === "draft") {
      return this.toDto(row);
    }
    if (row.status !== "submitted") {
      throw new BadRequestException("This project is being judged and can no longer be withdrawn");
    }

    await this.db
      .update(projects)
      .set({ status: "draft", submittedAt: null, updatedAt: new Date() })
      .where(eq(projects.projectId, projectId));

    return this.toDto(await this.loadProject(projectId));
  }

  /* ── hackathon showcase ───────────────────────────────────── */

  /** Every submitted (non-draft) project in a hackathon, newest first. Public. */
  async listSubmissions(hackathonId: string): Promise<ProjectDto[]> {
    const rows = await this.db
      .select(this.projectColumns())
      .from(projects)
      .innerJoin(teams, eq(teams.teamId, projects.teamId))
      .innerJoin(hackathons, eq(hackathons.hackathonId, teams.hackathonId))
      .where(
        and(
          eq(teams.hackathonId, hackathonId),
          isNull(projects.deletedAt),
          isNull(teams.deletedAt),
          // Anything past draft is a real submission.
          // (draft ⇔ submittedAt is null per the DB CHECK.)
        ),
      )
      .orderBy(asc(projects.submittedAt));

    return rows.filter((r) => r.status !== "draft").map((r) => this.toDto(r as ProjectRow));
  }
}
