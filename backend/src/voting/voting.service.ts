import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { hackathons, members, projects, teams, votes } from "../db/schema";

/** One project entry in the audience-voting list. */
export interface ProjectVoteDto {
  projectId: string;
  teamId: string;
  teamName: string;
  title: string;
  description: string | null;
  voteCount: number;
  hasUserVoted: boolean;
}

/** Result of casting a vote. */
export interface CastVoteResult {
  success: true;
  voteCount: number;
}

/** The project the caller voted for in a hackathon (or null). */
export interface MyVoteResult {
  projectId: string | null;
}

/** Whether audience voting is currently open, plus the configured window. */
export interface VotingStatusDto {
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  serverTime: string;
}

type ProjectVoteRow = {
  projectId: string;
  teamId: string;
  teamName: string;
  title: string;
  description: string | null;
  voteCount: number;
  hasUserVoted: boolean;
};

@Injectable()
export class VotingService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * Voting is open only when the organizer has configured a window AND now is
   * inside it. No window (opensAt null) means voting has not been opened.
   */
  private isWindowOpen(opensAt: Date | null, closesAt: Date | null, now: Date): boolean {
    if (!opensAt) return false;
    if (now < opensAt) return false;
    if (closesAt && now > closesAt) return false;
    return true;
  }

  async votingStatus(hackathonId: string): Promise<VotingStatusDto> {
    const [hk] = await this.db
      .select({
        opensAt: hackathons.votingOpensAt,
        closesAt: hackathons.votingClosesAt,
      })
      .from(hackathons)
      .where(eq(hackathons.hackathonId, hackathonId))
      .limit(1);
    if (!hk) throw new NotFoundException("Hackathon not found");
    const now = new Date();
    return {
      isOpen: this.isWindowOpen(hk.opensAt, hk.closesAt, now),
      opensAt: hk.opensAt ? hk.opensAt.toISOString() : null,
      closesAt: hk.closesAt ? hk.closesAt.toISOString() : null,
      serverTime: now.toISOString(),
    };
  }

  private projectColumns(viewerId: string | null) {
    return {
      projectId: projects.projectId,
      teamId: projects.teamId,
      teamName: teams.name,
      title: projects.title,
      description: projects.description,
      voteCount: sql<number>`(
        select count(*)::int from votes v
        where v.project_id = ${projects.projectId}
      )`,
      hasUserVoted: viewerId
        ? sql<boolean>`exists(
            select 1 from votes v
            where v.project_id = ${projects.projectId} and v.voter_id = ${viewerId}
          )`
        : sql<boolean>`false`,
    };
  }

  private toProjectVoteDto(r: ProjectVoteRow): ProjectVoteDto {
    return {
      projectId: r.projectId,
      teamId: r.teamId,
      teamName: r.teamName,
      title: r.title,
      description: r.description,
      voteCount: Number(r.voteCount),
      hasUserVoted: Boolean(r.hasUserVoted),
    };
  }

  async listProjects(hackathonId: string, viewerId: string | null): Promise<ProjectVoteDto[]> {
    const rows = await this.db
      .select(this.projectColumns(viewerId))
      .from(projects)
      .innerJoin(teams, eq(projects.teamId, teams.teamId))
      .where(
        and(
          eq(teams.hackathonId, hackathonId),
          isNull(teams.deletedAt),
          isNull(projects.deletedAt),
        ),
      )
      .orderBy(asc(projects.createdAt));
    return rows.map((r) => this.toProjectVoteDto(r));
  }

  async castVote(hackathonId: string, projectId: string, voterId: string): Promise<CastVoteResult> {
    // Caller must be a member to participate in audience voting.
    const [member] = await this.db
      .select({ userId: members.userId })
      .from(members)
      .where(eq(members.userId, voterId))
      .limit(1);
    if (!member) {
      throw new BadRequestException("Only members can vote");
    }

    // Enforce the organizer's voting window.
    const [hk] = await this.db
      .select({
        opensAt: hackathons.votingOpensAt,
        closesAt: hackathons.votingClosesAt,
      })
      .from(hackathons)
      .where(eq(hackathons.hackathonId, hackathonId))
      .limit(1);
    if (!hk) throw new NotFoundException("Hackathon not found");
    if (!this.isWindowOpen(hk.opensAt, hk.closesAt, new Date())) {
      throw new ForbiddenException("Voting is not open");
    }

    // The project must belong to this hackathon (and be live).
    const [project] = await this.db
      .select({ projectId: projects.projectId })
      .from(projects)
      .innerJoin(teams, eq(projects.teamId, teams.teamId))
      .where(
        and(
          eq(projects.projectId, projectId),
          eq(teams.hackathonId, hackathonId),
          isNull(teams.deletedAt),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);
    if (!project) {
      throw new NotFoundException("Project not found in this hackathon");
    }

    return this.db.transaction(async (tx) => {
      // One vote per member per hackathon (any project).
      const [existing] = await tx
        .select({ voteId: votes.voteId })
        .from(votes)
        .where(and(eq(votes.hackathonId, hackathonId), eq(votes.voterId, voterId)))
        .limit(1);
      if (existing) {
        throw new ConflictException("Already voted in this hackathon");
      }

      await tx.insert(votes).values({ hackathonId, projectId, voterId });

      const [{ voteCount }] = await tx
        .select({ voteCount: sql<number>`count(*)::int` })
        .from(votes)
        .where(eq(votes.projectId, projectId));

      return { success: true as const, voteCount: Number(voteCount) };
    });
  }

  async myVote(hackathonId: string, voterId: string): Promise<MyVoteResult> {
    const [row] = await this.db
      .select({ projectId: votes.projectId })
      .from(votes)
      .where(and(eq(votes.hackathonId, hackathonId), eq(votes.voterId, voterId)))
      .limit(1);
    return { projectId: row?.projectId ?? null };
  }
}
