import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { activeTeamMember } from "../common/team.predicates";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import {
  applications,
  memberSkills,
  members,
  skills,
  teamMembers,
  teams,
  users,
} from "../db/schema";

/** A platform member available to team up for a hackathon. */
export interface FreeAgentDto {
  userId: string;
  username: string;
  displayName: string | null;
  skills: string[];
}

@Injectable()
export class MatchingService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

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
}
