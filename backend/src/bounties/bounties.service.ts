import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { activeTeamMember } from "../common/team.predicates";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import {
  bounties,
  bountySubmissions,
  hackathonPrizes,
  hackathonResults,
  projects,
  teamMembers,
  teams,
} from "../db/schema";
import { AuthzService } from "../common/authz.service";
import type { PublishResultsInput } from "./dto";

/** A sponsor bounty as shown on a hackathon's bounties tab. */
export interface BountyDto {
  bountyId: string;
  sponsorName: string;
  title: string;
  theme: string | null;
  description: string | null;
  /** Award value of the matching prize row for this bounty, or null. */
  prizeAward: string | null;
  /** Number of distinct projects that have applied to this bounty. */
  applicantCount: number;
  /** Whether the viewer's project has applied (false if anon / no project). */
  hasApplied: boolean;
}

/** Result of applying / un-applying a project to a bounty. */
export interface ApplyResultDto {
  success: true;
  applicantCount: number;
}

/** A row in the overall podium. */
export interface PodiumEntryDto {
  rank: number | null;
  projectId: string;
  teamName: string;
  title: string;
}

/** A bounty winner row. */
export interface BountyWinnerDto {
  bountyId: string;
  bountyTitle: string;
  sponsorName: string;
  projectId: string;
  teamName: string;
  title: string;
}

/** Official results for a hackathon (overall podium + bounty winners). */
export interface ResultsDto {
  published: boolean;
  podium: PodiumEntryDto[];
  bountyWinners: BountyWinnerDto[];
}

@Injectable()
export class BountiesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly authz: AuthzService,
  ) {}

  /**
   * Find the caller's active team in this hackathon (active membership →
   * non-deleted team scoped to the hackathon) then that team's non-deleted
   * project. Returns null if the caller has no such project.
   */
  private async callersProjectInHackathon(
    hackathonId: string,
    userId: string,
  ): Promise<{ teamId: string; projectId: string } | null> {
    const [row] = await this.db
      .select({
        teamId: teams.teamId,
        projectId: projects.projectId,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.teamId, teamMembers.teamId))
      .innerJoin(projects, eq(projects.teamId, teams.teamId))
      .where(
        and(
          eq(teamMembers.userId, userId),
          activeTeamMember,
          eq(teams.hackathonId, hackathonId),
          isNull(teams.deletedAt),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /* ── Bounties ────────────────────────────────────────────── */

  async listBounties(
    hackathonId: string,
    userId: string | null,
  ): Promise<BountyDto[]> {
    const viewerProject = userId
      ? await this.callersProjectInHackathon(hackathonId, userId)
      : null;
    const viewerProjectId = viewerProject?.projectId ?? null;

    const bountyRows = await this.db
      .select({
        bountyId: bounties.bountyId,
        sponsorName: bounties.sponsorName,
        title: bounties.title,
        theme: bounties.theme,
        description: bounties.description,
      })
      .from(bounties)
      .where(eq(bounties.hackathonId, hackathonId))
      .orderBy(asc(bounties.title));

    const bountyIds = bountyRows.map((b) => b.bountyId);
    if (bountyIds.length === 0) return [];

    // Prize award value per bounty.
    const prizeRows = await this.db
      .select({
        bountyId: hackathonPrizes.bountyId,
        awardValue: hackathonPrizes.awardValue,
      })
      .from(hackathonPrizes)
      .where(inArray(hackathonPrizes.bountyId, bountyIds));
    const prizeByBounty = new Map<string, string | null>();
    for (const p of prizeRows) {
      if (p.bountyId) prizeByBounty.set(p.bountyId, p.awardValue);
    }

    // Applicant count per bounty.
    const countRows = await this.db
      .select({
        bountyId: bountySubmissions.bountyId,
        count: sql<number>`count(*)::int`,
      })
      .from(bountySubmissions)
      .where(inArray(bountySubmissions.bountyId, bountyIds))
      .groupBy(bountySubmissions.bountyId);
    const countByBounty = new Map<string, number>();
    for (const c of countRows) countByBounty.set(c.bountyId, Number(c.count));

    // Bounties the viewer's project has applied to.
    const appliedSet = new Set<string>();
    if (viewerProjectId) {
      const appliedRows = await this.db
        .select({ bountyId: bountySubmissions.bountyId })
        .from(bountySubmissions)
        .where(
          and(
            inArray(bountySubmissions.bountyId, bountyIds),
            eq(bountySubmissions.projectId, viewerProjectId),
          ),
        );
      for (const a of appliedRows) appliedSet.add(a.bountyId);
    }

    return bountyRows.map((b) => ({
      bountyId: b.bountyId,
      sponsorName: b.sponsorName,
      title: b.title,
      theme: b.theme,
      description: b.description,
      prizeAward: prizeByBounty.get(b.bountyId) ?? null,
      applicantCount: countByBounty.get(b.bountyId) ?? 0,
      hasApplied: appliedSet.has(b.bountyId),
    }));
  }

  /** Count distinct projects submitted to a bounty. */
  private async bountyApplicantCount(bountyId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(bountySubmissions)
      .where(eq(bountySubmissions.bountyId, bountyId));
    return row?.count ?? 0;
  }

  /** Load a bounty and assert it belongs to the given hackathon. */
  private async getBountyInHackathon(
    hackathonId: string,
    bountyId: string,
  ): Promise<{ bountyId: string }> {
    const [bounty] = await this.db
      .select({ bountyId: bounties.bountyId })
      .from(bounties)
      .where(
        and(
          eq(bounties.bountyId, bountyId),
          eq(bounties.hackathonId, hackathonId),
        ),
      )
      .limit(1);
    if (!bounty) {
      throw new NotFoundException("Bounty not found");
    }
    return bounty;
  }

  async apply(
    hackathonId: string,
    bountyId: string,
    userId: string,
  ): Promise<ApplyResultDto> {
    await this.getBountyInHackathon(hackathonId, bountyId);

    const project = await this.callersProjectInHackathon(hackathonId, userId);
    if (!project) {
      throw new BadRequestException("Submit a project first");
    }

    await this.db
      .insert(bountySubmissions)
      .values({ bountyId, projectId: project.projectId })
      .onConflictDoNothing();

    return {
      success: true,
      applicantCount: await this.bountyApplicantCount(bountyId),
    };
  }

  async unapply(
    hackathonId: string,
    bountyId: string,
    userId: string,
  ): Promise<ApplyResultDto> {
    await this.getBountyInHackathon(hackathonId, bountyId);

    const project = await this.callersProjectInHackathon(hackathonId, userId);
    if (!project) {
      throw new BadRequestException("Submit a project first");
    }

    await this.db
      .delete(bountySubmissions)
      .where(
        and(
          eq(bountySubmissions.bountyId, bountyId),
          eq(bountySubmissions.projectId, project.projectId),
        ),
      );

    return {
      success: true,
      applicantCount: await this.bountyApplicantCount(bountyId),
    };
  }

  /* ── Results ─────────────────────────────────────────────── */

  async getResults(hackathonId: string): Promise<ResultsDto> {
    // Overall podium: results with no bounty, joined to this hackathon's teams.
    const podiumRows = await this.db
      .select({
        rank: hackathonResults.rank,
        projectId: hackathonResults.projectId,
        teamName: teams.name,
        title: projects.title,
      })
      .from(hackathonResults)
      .innerJoin(projects, eq(projects.projectId, hackathonResults.projectId))
      .innerJoin(teams, eq(teams.teamId, projects.teamId))
      .where(
        and(
          isNull(hackathonResults.bountyId),
          eq(teams.hackathonId, hackathonId),
        ),
      )
      .orderBy(asc(hackathonResults.rank));

    // Bounty winners: results tied to one of this hackathon's bounties.
    const bountyWinnerRows = await this.db
      .select({
        bountyId: bounties.bountyId,
        bountyTitle: bounties.title,
        sponsorName: bounties.sponsorName,
        rank: hackathonResults.rank,
        projectId: hackathonResults.projectId,
        teamName: teams.name,
        title: projects.title,
      })
      .from(hackathonResults)
      .innerJoin(bounties, eq(bounties.bountyId, hackathonResults.bountyId))
      .innerJoin(projects, eq(projects.projectId, hackathonResults.projectId))
      .innerJoin(teams, eq(teams.teamId, projects.teamId))
      .where(eq(bounties.hackathonId, hackathonId))
      .orderBy(asc(bounties.title), asc(hackathonResults.rank));

    return {
      published: podiumRows.length > 0,
      podium: podiumRows.map((r) => ({
        rank: r.rank,
        projectId: r.projectId,
        teamName: r.teamName,
        title: r.title,
      })),
      bountyWinners: bountyWinnerRows.map((r) => ({
        bountyId: r.bountyId,
        bountyTitle: r.bountyTitle,
        sponsorName: r.sponsorName,
        projectId: r.projectId,
        teamName: r.teamName,
        title: r.title,
      })),
    };
  }

  async publishResults(
    hackathonId: string,
    userId: string,
    input: PublishResultsInput,
  ): Promise<ResultsDto> {
    await this.authz.assertHackathonOwnerOrAdmin(hackathonId, userId);

    const projectIds = input.rankings.map((r) => r.projectId);

    if (projectIds.length > 0) {
      // Every provided project must belong to a team in this hackathon.
      const valid = await this.db
        .select({ projectId: projects.projectId })
        .from(projects)
        .innerJoin(teams, eq(teams.teamId, projects.teamId))
        .where(
          and(
            inArray(projects.projectId, projectIds),
            eq(teams.hackathonId, hackathonId),
          ),
        );
      const validIds = new Set(valid.map((p) => p.projectId));
      for (const id of projectIds) {
        if (!validIds.has(id)) {
          throw new BadRequestException(
            "All projects must belong to a team in this hackathon",
          );
        }
      }
    }

    // The project ids of every project in this hackathon (to scope the delete).
    const hackathonProjects = await this.db
      .select({ projectId: projects.projectId })
      .from(projects)
      .innerJoin(teams, eq(teams.teamId, projects.teamId))
      .where(eq(teams.hackathonId, hackathonId));
    const hackathonProjectIds = hackathonProjects.map((p) => p.projectId);

    await this.db.transaction(async (tx) => {
      if (hackathonProjectIds.length > 0) {
        await tx
          .delete(hackathonResults)
          .where(
            and(
              isNull(hackathonResults.bountyId),
              inArray(hackathonResults.projectId, hackathonProjectIds),
            ),
          );
      }

      if (input.rankings.length > 0) {
        await tx.insert(hackathonResults).values(
          input.rankings.map((r) => ({
            projectId: r.projectId,
            bountyId: null,
            rank: r.rank,
          })),
        );
      }
    });

    return this.getResults(hackathonId);
  }

  /** Set (or clear, with null) the winning project of one bounty. Org/admin only. */
  async setBountyWinner(
    hackathonId: string,
    bountyId: string,
    userId: string,
    projectId: string | null,
  ): Promise<ResultsDto> {
    await this.authz.assertHackathonOwnerOrAdmin(hackathonId, userId);
    await this.getBountyInHackathon(hackathonId, bountyId);

    if (projectId) {
      const [valid] = await this.db
        .select({ projectId: projects.projectId })
        .from(projects)
        .innerJoin(teams, eq(teams.teamId, projects.teamId))
        .where(
          and(
            eq(projects.projectId, projectId),
            eq(teams.hackathonId, hackathonId),
            isNull(projects.deletedAt),
          ),
        )
        .limit(1);
      if (!valid) {
        throw new BadRequestException(
          "The winning project must belong to a team in this hackathon",
        );
      }
    }

    await this.db.transaction(async (tx) => {
      // One winner per bounty — clear any existing winner first.
      await tx
        .delete(hackathonResults)
        .where(eq(hackathonResults.bountyId, bountyId));
      if (projectId) {
        await tx
          .insert(hackathonResults)
          .values({ projectId, bountyId, rank: 1 });
      }
    });

    return this.getResults(hackathonId);
  }
}
