/**
 * Autor: Dimitrije Pesic (2023/0014)
 */
import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { activeTeamMember } from "../common/team.predicates";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import {
  applications,
  hackathons,
  memberSkills,
  members,
  skills,
  teamMembers,
  teams,
  users,
} from "../db/schema";
import { TeamsService, type OpenTeamDto, type TeamDto } from "../teams/teams.service";

/** A platform member available to team up for a hackathon. */
export interface FreeAgentDto {
  userId: string;
  username: string;
  displayName: string | null;
  skills: string[];
}

/** A free agent paired with how well they'd complement a team. */
export interface ScoredFreeAgentDto extends FreeAgentDto {
  score: number;
}

/** An open (joinable) team paired with how well the caller would complement it. */
export interface ScoredOpenTeamDto extends OpenTeamDto {
  score: number;
}

/** Response of `GET /hackathons/:id/team-suggestions`. */
export interface TeamSuggestionsDto {
  teammates: ScoredFreeAgentDto[];
  teams: ScoredOpenTeamDto[];
}

/** Response of `POST /hackathons/:id/team-proposal` (SSU12 — one AI-assembled combination). */
export interface TeamProposalDto {
  members: ScoredFreeAgentDto[];
  noCandidates: boolean;
}

const TEAMMATE_SUGGESTION_LIMIT = 10;
const TEAM_SUGGESTION_LIMIT = 5;

@Injectable()
export class MatchingService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly teamsService: TeamsService,
  ) {}

  /**
   * Members relevant to `hackathonId` — they applied (pending/approved) or
   * have sat on a team there — who are not currently an active member of any
   * team for that hackathon. Excludes `excludeUserId` (the caller).
   */
  async freeAgentsForHackathon(
    hackathonId: string,
    excludeUserId: string,
  ): Promise<FreeAgentDto[]> {
    const activeTeamInHackathonSql = sql<boolean>`exists (
      select 1 from team_members
      inner join teams on ${eq(teams.teamId, teamMembers.teamId)}
      where ${eq(teamMembers.userId, members.userId)}
        and ${eq(teams.hackathonId, hackathonId)}
        and ${activeTeamMember}
    )`;

    const anyTeamInHackathonSql = sql<boolean>`exists (
      select 1 from team_members
      inner join teams on ${eq(teams.teamId, teamMembers.teamId)}
      where ${eq(teamMembers.userId, members.userId)}
        and ${eq(teams.hackathonId, hackathonId)}
    )`;

    const appliedToHackathonSql = sql<boolean>`exists (
      select 1 from applications
      where ${eq(applications.userId, members.userId)}
        and ${eq(applications.hackathonId, hackathonId)}
        and ${inArray(applications.status, ["pending", "approved"])}
    )`;

    const rows = await this.db
      .select({
        userId: members.userId,
        username: users.username,
        displayName: users.displayName,
      })
      .from(members)
      .innerJoin(users, eq(members.userId, users.userId))
      .where(
        and(
          isNull(users.deletedAt),
          ne(members.userId, excludeUserId),
          sql`not ${activeTeamInHackathonSql}`,
          sql`(${appliedToHackathonSql} or ${anyTeamInHackathonSql})`,
        ),
      )
      .orderBy(asc(users.username));

    if (rows.length === 0) return [];

    const skillRows = await this.db
      .select({
        userId: memberSkills.userId,
        name: skills.name,
      })
      .from(memberSkills)
      .innerJoin(skills, eq(memberSkills.skillId, skills.skillId))
      .where(
        inArray(
          memberSkills.userId,
          rows.map((r) => r.userId),
        ),
      );

    const skillMap = new Map<string, string[]>();
    for (const s of skillRows) {
      const list = skillMap.get(s.userId) ?? [];
      list.push(s.name);
      skillMap.set(s.userId, list);
    }

    return rows.map((r) => ({
      userId: r.userId,
      username: r.username,
      displayName: r.displayName,
      skills: skillMap.get(r.userId) ?? [],
    }));
  }

  /**
   * Distinct skill names covered by `teamId`'s active members.
   * `selectDistinct` collapses duplicate skill names when two members share one.
   */
  async teamSkills(teamId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ name: skills.name })
      .from(teamMembers)
      .innerJoin(memberSkills, eq(memberSkills.userId, teamMembers.userId))
      .innerJoin(skills, eq(skills.skillId, memberSkills.skillId))
      .where(and(eq(teamMembers.teamId, teamId), activeTeamMember));

    return rows.map((r) => r.name);
  }

  /**
   * How well `candidateSkills` complements a team currently covering
   * `existingSkills`: the count of distinct candidate skills not already
   * covered. A candidate who only repeats skills the team already has scores
   * 0, regardless of how many skills they list.
   */
  complementarityScore(candidateSkills: string[], existingSkills: Iterable<string>): number {
    const covered = new Set(existingSkills);
    return new Set(candidateSkills.filter((s) => !covered.has(s))).size;
  }

  /**
   * `freeAgents` ranked by how much they'd complement a team currently
   * covering `existingSkills` — highest score first, ties broken
   * alphabetically by username for a stable order.
   */
  rankByComplementarity(
    freeAgents: FreeAgentDto[],
    existingSkills: Iterable<string>,
  ): ScoredFreeAgentDto[] {
    const covered = new Set(existingSkills);
    return freeAgents
      .map((agent) => ({ ...agent, score: this.complementarityScore(agent.skills, covered) }))
      .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username));
  }

  /** Distinct skill names tagged on `userId`'s own profile. */
  async skillsForUser(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ name: skills.name })
      .from(memberSkills)
      .innerJoin(skills, eq(skills.skillId, memberSkills.skillId))
      .where(eq(memberSkills.userId, userId));

    return rows.map((r) => r.name);
  }

  /** `userId`'s active team within `hackathonId`, if any. */
  async myActiveTeamId(hackathonId: string, userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.teamId, teamMembers.teamId))
      .where(
        and(eq(teamMembers.userId, userId), eq(teams.hackathonId, hackathonId), activeTeamMember),
      )
      .limit(1);

    return row?.teamId ?? null;
  }

  /**
   * `GET /hackathons/:id/team-suggestions`. If the caller already leads/sits
   * on a team for this hackathon, suggests free agents that best complement
   * that team's existing skills. Otherwise suggests both free agents and
   * open teams that best complement the caller's own skills.
   */
  async teamSuggestions(hackathonId: string, userId: string): Promise<TeamSuggestionsDto> {
    const freeAgents = await this.freeAgentsForHackathon(hackathonId, userId);
    const myTeamId = await this.myActiveTeamId(hackathonId, userId);

    // Members who already have a team only see teammate suggestions (free agents
    // that fill the team's skill gaps), never open-team suggestions.
    if (myTeamId) {
      const teammates = this.rankByComplementarity(
        freeAgents,
        await this.teamSkills(myTeamId),
      ).slice(0, TEAMMATE_SUGGESTION_LIMIT);
      return { teammates, teams: [] };
    }

    const mySkills = await this.skillsForUser(userId);
    const teammates = this.rankByComplementarity(freeAgents, mySkills).slice(
      0,
      TEAMMATE_SUGGESTION_LIMIT,
    );

    const openTeams = (await this.teamsService.openTeams(userId)).filter(
      (t) => t.hackathonId === hackathonId,
    );
    const scoredTeams = await Promise.all(
      openTeams.map(async (team) => ({
        ...team,
        score: this.complementarityScore(mySkills, await this.teamSkills(team.teamId)),
      })),
    );
    scoredTeams.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    return { teammates, teams: scoredTeams.slice(0, TEAM_SUGGESTION_LIMIT) };
  }

  /** Throws unless `userId` is approved for `hackathonId` and has no team there yet. */
  private async assertApprovedAndTeamless(hackathonId: string, userId: string): Promise<void> {
    const [app] = await this.db
      .select({ status: applications.status })
      .from(applications)
      .where(and(eq(applications.hackathonId, hackathonId), eq(applications.userId, userId)))
      .limit(1);
    if (!app || app.status !== "approved") {
      throw new ForbiddenException("You must be approved for this hackathon first");
    }
    if (await this.myActiveTeamId(hackathonId, userId)) {
      throw new BadRequestException("You already have a team for this hackathon");
    }
  }

  /**
   * `POST /hackathons/:id/team-proposal` (SSU12). Greedily assembles ONE
   * concrete team combination — up to `maxTeamSize - 1` free agents — by
   * repeatedly picking whoever best complements the skills covered so far
   * (caller's own skills, then each pick's skills). `excludeUserIds` lets the
   * caller re-roll (alt-flow 2) without repeating a rejected combination.
   */
  async proposeTeam(
    hackathonId: string,
    userId: string,
    excludeUserIds: string[],
  ): Promise<TeamProposalDto> {
    await this.assertApprovedAndTeamless(hackathonId, userId);

    const [hackathon] = await this.db
      .select({ maxTeamSize: hackathons.maxTeamSize })
      .from(hackathons)
      .where(eq(hackathons.hackathonId, hackathonId))
      .limit(1);
    if (!hackathon) throw new BadRequestException("Hackathon not found");

    const excluded = new Set(excludeUserIds);
    const remaining = (await this.freeAgentsForHackathon(hackathonId, userId)).filter(
      (a) => !excluded.has(a.userId),
    );
    if (remaining.length === 0) return { members: [], noCandidates: true };

    const targetSize = Math.max(0, hackathon.maxTeamSize - 1);
    const covered = new Set(await this.skillsForUser(userId));
    const picked: ScoredFreeAgentDto[] = [];

    while (picked.length < targetSize && remaining.length > 0) {
      const best = this.rankByComplementarity(remaining, covered)[0];
      picked.push(best);
      best.skills.forEach((s) => covered.add(s));
      remaining.splice(
        remaining.findIndex((a) => a.userId === best.userId),
        1,
      );
    }

    return { members: picked, noCandidates: false };
  }

  /**
   * `POST /hackathons/:id/team-proposal/accept` (SSU12). Creates the team
   * (caller becomes leader — reuses `TeamsService.create`, which also wires
   * up the hackathon server's team channel) and sends a normal team
   * invitation to each proposed member; the team is only ever as "formed" as
   * however many of those invitations get accepted, same as a manually
   * created team. A member who can no longer be invited (e.g. they grabbed a
   * team in the meantime) is skipped rather than aborting the whole request.
   */
  async acceptProposal(
    hackathonId: string,
    userId: string,
    teamName: string,
    memberUserIds: string[],
  ): Promise<TeamDto> {
    await this.assertApprovedAndTeamless(hackathonId, userId);

    const team = await this.teamsService.create(userId, { name: teamName, hackathonId });

    for (const memberId of memberUserIds) {
      if (memberId === userId) continue;
      await this.teamsService
        .invite(team.teamId, userId, {
          userId: memberId,
          message: "AI predlog: tvoje veštine dobro dopunjuju ovaj tim.",
        })
        .catch(() => undefined);
    }

    return team;
  }
}
