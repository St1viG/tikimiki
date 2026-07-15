import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { activeTeamMember } from "../common/team.predicates";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import {
  badges,
  bounties,
  bountySubmissions,
  hackathonPrizes,
  hackathonResults,
  hackathons,
  pointTransactions,
  projects,
  teamMembers,
  teams,
  userBadges,
} from "../db/schema";
import { AuthzService } from "../common/authz.service";
import { PointsService, type DrizzleTx } from "../common/points.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { CreateBountyInput, PublishResultsInput, UpdateBountyInput } from "./dto";

/** Placement → XP points by hackathon podium rank. Only the top 3 earn points/badges. */
const PLACEMENT_POINTS: Record<number, number> = { 1: 5000, 2: 3000, 3: 1500 };
/** XP awarded to every member of a sponsor bounty's winning team. */
const BOUNTY_WINNER_POINTS = 1000;
/** Badge awarded for any hackathon podium or bounty placement (matched by name, seeded). */
const WINNER_BADGE_NAME = "Pobednik";

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
    private readonly points: PointsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Active (non-left, non-deleted) member ids of a team. */
  private async activeMemberIds(teamId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), activeTeamMember));
    return rows.map((r) => r.userId);
  }

  /**
   * Credit `points` to `userId` for a placement, unless they were already
   * credited for this exact `(type, referenceId)` before — makes re-publishing
   * results idempotent instead of re-awarding on every correction. Returns
   * whether this call actually awarded points.
   */
  private async creditPlacementOnce(
    tx: DrizzleTx,
    userId: string,
    points: number,
    type: "hackathon_placement" | "bounty_placement",
    referenceId: string,
    note: string,
  ): Promise<boolean> {
    const [existing] = await tx
      .select({ transactionId: pointTransactions.transactionId })
      .from(pointTransactions)
      .where(
        and(
          eq(pointTransactions.userId, userId),
          eq(pointTransactions.type, type),
          eq(pointTransactions.referenceId, referenceId),
        ),
      )
      .limit(1);
    if (existing) return false;
    await this.points.credit(tx, userId, points, { type, referenceId, note });
    return true;
  }

  /** Award a badge by name (same match-by-name pattern as GamesService); idempotent via the PK. */
  private async awardBadgeOnce(tx: DrizzleTx, userId: string, badgeName: string): Promise<boolean> {
    const [badge] = await tx
      .select({ badgeId: badges.badgeId })
      .from(badges)
      .where(eq(badges.name, badgeName))
      .limit(1);
    if (!badge) return false;
    const inserted = await tx
      .insert(userBadges)
      .values({ userId, badgeId: badge.badgeId })
      .onConflictDoNothing()
      .returning({ badgeId: userBadges.badgeId });
    return inserted.length > 0;
  }

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

  async listBounties(hackathonId: string, userId: string | null): Promise<BountyDto[]> {
    const viewerProject = userId ? await this.callersProjectInHackathon(hackathonId, userId) : null;
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
      .where(and(eq(bounties.bountyId, bountyId), eq(bounties.hackathonId, hackathonId)))
      .limit(1);
    if (!bounty) {
      throw new NotFoundException("Bounty not found");
    }
    return bounty;
  }

  async apply(hackathonId: string, bountyId: string, userId: string): Promise<ApplyResultDto> {
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

  async unapply(hackathonId: string, bountyId: string, userId: string): Promise<ApplyResultDto> {
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

  /* ── Bounty CRUD (organizer/admin, SSU16) ────────────────── */

  async createBounty(
    hackathonId: string,
    userId: string,
    input: CreateBountyInput,
  ): Promise<BountyDto> {
    await this.authz.assertHackathonOwnerOrAdmin(hackathonId, userId);

    let bountyId = "";
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(bounties)
        .values({
          hackathonId,
          sponsorName: input.sponsorName,
          title: input.title,
          theme: input.theme ?? null,
          description: input.description ?? null,
        })
        .returning({ bountyId: bounties.bountyId });
      bountyId = row.bountyId;

      // A prizeAward mirrors the bounty into hackathon_prizes (same shape the
      // seed uses), so results/prize surfaces see the sponsor award too.
      if (input.prizeAward !== undefined) {
        await tx.insert(hackathonPrizes).values({
          hackathonId,
          bountyId: row.bountyId,
          sponsorName: input.sponsorName,
          title: input.title,
          description: input.description ?? null,
          awardValue: input.prizeAward,
        });
      }
    });

    return {
      bountyId,
      sponsorName: input.sponsorName,
      title: input.title,
      theme: input.theme ?? null,
      description: input.description ?? null,
      prizeAward: input.prizeAward ?? null,
      applicantCount: 0,
      hasApplied: false,
    };
  }

  async updateBounty(
    hackathonId: string,
    bountyId: string,
    userId: string,
    input: UpdateBountyInput,
  ): Promise<BountyDto> {
    await this.authz.assertHackathonOwnerOrAdmin(hackathonId, userId);

    const [existing] = await this.db
      .select({
        sponsorName: bounties.sponsorName,
        title: bounties.title,
        theme: bounties.theme,
        description: bounties.description,
      })
      .from(bounties)
      .where(and(eq(bounties.bountyId, bountyId), eq(bounties.hackathonId, hackathonId)))
      .limit(1);
    if (!existing) {
      throw new NotFoundException("Bounty not found");
    }

    // Merge the patch over the current row so the mirrored prize row can be
    // kept in sync with the final field values.
    const next = {
      sponsorName: input.sponsorName ?? existing.sponsorName,
      title: input.title ?? existing.title,
      theme: input.theme === undefined ? existing.theme : input.theme,
      description: input.description === undefined ? existing.description : input.description,
    };

    await this.db.transaction(async (tx) => {
      await tx
        .update(bounties)
        .set({ ...next, updatedAt: new Date() })
        .where(eq(bounties.bountyId, bountyId));

      if (input.prizeAward === null) {
        // Clearing the award removes the mirrored prize row entirely.
        await tx.delete(hackathonPrizes).where(eq(hackathonPrizes.bountyId, bountyId));
      } else {
        // Keep the mirrored prize row in sync with the bounty fields; a new
        // prizeAward updates the existing row or inserts one if missing.
        const updated = await tx
          .update(hackathonPrizes)
          .set({
            sponsorName: next.sponsorName,
            title: next.title,
            description: next.description,
            ...(input.prizeAward !== undefined ? { awardValue: input.prizeAward } : {}),
          })
          .where(eq(hackathonPrizes.bountyId, bountyId))
          .returning({ prizeId: hackathonPrizes.prizeId });
        if (updated.length === 0 && input.prizeAward !== undefined) {
          await tx.insert(hackathonPrizes).values({
            hackathonId,
            bountyId,
            sponsorName: next.sponsorName,
            title: next.title,
            description: next.description,
            awardValue: input.prizeAward,
          });
        }
      }
    });

    const [prize] = await this.db
      .select({ awardValue: hackathonPrizes.awardValue })
      .from(hackathonPrizes)
      .where(eq(hackathonPrizes.bountyId, bountyId))
      .limit(1);

    return {
      bountyId,
      sponsorName: next.sponsorName,
      title: next.title,
      theme: next.theme,
      description: next.description,
      prizeAward: prize?.awardValue ?? null,
      applicantCount: await this.bountyApplicantCount(bountyId),
      hasApplied: false,
    };
  }

  /**
   * Delete a bounty. Its prize row, submissions and results all cascade via
   * FK (`on delete cascade` on hackathon_prizes / bounty_submissions /
   * hackathon_results), so a single delete suffices.
   */
  async deleteBounty(
    hackathonId: string,
    bountyId: string,
    userId: string,
  ): Promise<{ success: true }> {
    await this.authz.assertHackathonOwnerOrAdmin(hackathonId, userId);
    await this.getBountyInHackathon(hackathonId, bountyId);

    await this.db.delete(bounties).where(eq(bounties.bountyId, bountyId));

    return { success: true };
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
      .where(and(isNull(hackathonResults.bountyId), eq(teams.hackathonId, hackathonId)))
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

    // `published` is derived from whether any podium rows exist — there is no
    // separate boolean column; publishing results means inserting result rows.
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
        .where(and(inArray(projects.projectId, projectIds), eq(teams.hackathonId, hackathonId)));
      const validIds = new Set(valid.map((p) => p.projectId));
      for (const id of projectIds) {
        if (!validIds.has(id)) {
          throw new BadRequestException("All projects must belong to a team in this hackathon");
        }
      }
    }

    // Every project in this hackathon with its team (scopes the results
    // delete, and resolves whose members get awarded/notified below).
    const hackathonProjects = await this.db
      .select({ projectId: projects.projectId, teamId: teams.teamId, teamName: teams.name })
      .from(projects)
      .innerJoin(teams, eq(teams.teamId, projects.teamId))
      .where(eq(teams.hackathonId, hackathonId));
    const hackathonProjectIds = hackathonProjects.map((p) => p.projectId);

    const rankByProject = new Map(input.rankings.map((r) => [r.projectId, r.rank]));
    // userId -> points newly awarded this call, so the post-commit
    // notifications can say what each member actually won.
    const newlyAwarded = new Map<string, number>();

    await this.db.transaction(async (tx) => {
      // Delete only the overall-podium rows for this hackathon; bounty-winner
      // rows (bountyId IS NOT NULL) are untouched so setBountyWinner state is preserved.
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

        // Publishing a podium means the event has concluded (SSU15).
        await tx
          .update(hackathons)
          .set({ status: "finished", updatedAt: new Date() })
          .where(and(eq(hackathons.hackathonId, hackathonId), ne(hackathons.status, "cancelled")));

        for (const project of hackathonProjects) {
          const rank = rankByProject.get(project.projectId);
          const points = rank ? PLACEMENT_POINTS[rank] : undefined;
          if (!points) continue;

          for (const memberUserId of await this.activeMemberIds(project.teamId)) {
            const awarded = await this.creditPlacementOnce(
              tx,
              memberUserId,
              points,
              "hackathon_placement",
              hackathonId,
              `${project.teamName} — ${rank}. mesto`,
            );
            if (awarded) {
              await this.awardBadgeOnce(tx, memberUserId, WINNER_BADGE_NAME);
              newlyAwarded.set(memberUserId, points);
            }
          }
        }
      }
    });

    const resultsDto = await this.getResults(hackathonId);

    // Notify every participant, not just winners (SSU15 §2.2.1 step 6) —
    // outside the transaction, matching NotificationsService.create's own
    // commit + realtime push.
    if (input.rankings.length > 0) {
      for (const project of hackathonProjects) {
        const rank = rankByProject.get(project.projectId);
        for (const memberUserId of await this.activeMemberIds(project.teamId)) {
          const won = newlyAwarded.get(memberUserId);
          await this.notifications.create({
            userId: memberUserId,
            type: "hackathon_result_posted",
            title:
              rank && rank <= 3
                ? `Osvojili ste ${rank}. mesto!`
                : "Rezultati hakatona su objavljeni",
            body: won
              ? `${project.teamName} je osvojio/la ${rank}. mesto — dobili ste ${won} poena i bedž "${WINNER_BADGE_NAME}".`
              : "Pogledaj svoj plasman i rezultate na profilu.",
            entityType: "hackathon",
            entityId: hackathonId,
          });
        }
      }
    }

    return resultsDto;
  }

  /** Set (or clear, with null) the winning project of one bounty. Org/admin only. */
  async setBountyWinner(
    hackathonId: string,
    bountyId: string,
    userId: string,
    projectId: string | null,
  ): Promise<ResultsDto> {
    await this.authz.assertHackathonOwnerOrAdmin(hackathonId, userId);
    const [bounty] = await this.db
      .select({
        bountyId: bounties.bountyId,
        title: bounties.title,
        sponsorName: bounties.sponsorName,
      })
      .from(bounties)
      .where(and(eq(bounties.bountyId, bountyId), eq(bounties.hackathonId, hackathonId)))
      .limit(1);
    if (!bounty) {
      throw new NotFoundException("Bounty not found");
    }

    let winningTeam: { teamId: string; teamName: string } | null = null;
    if (projectId) {
      const [valid] = await this.db
        .select({ projectId: projects.projectId, teamId: teams.teamId, teamName: teams.name })
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
      // The winner must have actually applied to this bounty (SSU16).
      const [applied] = await this.db
        .select({ bountyId: bountySubmissions.bountyId })
        .from(bountySubmissions)
        .where(
          and(eq(bountySubmissions.bountyId, bountyId), eq(bountySubmissions.projectId, projectId)),
        )
        .limit(1);
      if (!applied) {
        throw new BadRequestException("The winning project has not applied to this bounty");
      }
      winningTeam = { teamId: valid.teamId, teamName: valid.teamName };
    }

    const newlyAwardedMemberIds: string[] = [];

    await this.db.transaction(async (tx) => {
      // One winner per bounty — clear any existing winner first.
      await tx.delete(hackathonResults).where(eq(hackathonResults.bountyId, bountyId));
      if (projectId) {
        await tx.insert(hackathonResults).values({ projectId, bountyId, rank: 1 });
      }

      if (winningTeam) {
        for (const memberUserId of await this.activeMemberIds(winningTeam.teamId)) {
          const awarded = await this.creditPlacementOnce(
            tx,
            memberUserId,
            BOUNTY_WINNER_POINTS,
            "bounty_placement",
            bountyId,
            `${bounty.title} (${bounty.sponsorName})`,
          );
          if (awarded) {
            await this.awardBadgeOnce(tx, memberUserId, WINNER_BADGE_NAME);
            newlyAwardedMemberIds.push(memberUserId);
          }
        }
      }
    });

    // Sponsor-prize notification, part of the same results-publishing flow (SSU16).
    for (const memberUserId of newlyAwardedMemberIds) {
      await this.notifications.create({
        userId: memberUserId,
        type: "bounty_result_posted",
        title: `Osvojili ste sponzorsku nagradu: ${bounty.title}`,
        body: `${bounty.sponsorName} vas je nagradio/la za "${bounty.title}" — dobili ste ${BOUNTY_WINNER_POINTS} poena i bedž "${WINNER_BADGE_NAME}".`,
        entityType: "bounty",
        entityId: bountyId,
      });
    }

    return this.getResults(hackathonId);
  }
}
