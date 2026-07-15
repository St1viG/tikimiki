import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, sql } from "drizzle-orm";
import { gatedAvatarUrl } from "../subscriptions/premium-personalization";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { members, pointTransactions, teamMembers, teams, userBadges, users } from "../db/schema";

export type LeaderboardPeriod = "all" | "month" | "week";

/** One ranked row on the member leaderboard (SSU17). */
export interface LeaderboardEntryDto {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** Points for the requested period — all-time balance, or earned-in-window for month/week. */
  points: number;
  badgeCount: number;
  /** Distinct hackathons this member has been part of a team for. */
  hackathonCount: number;
}

@Injectable()
export class LeaderboardService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * Rank every member by points for `period`, optionally restricted to
   * members who took part (via any team) in `hackathonId`. Badge and
   * hackathon counts are always all-time — only the points column changes
   * with the period, matching SSU17 §2.2.3.
   */
  async get(period: LeaderboardPeriod, hackathonId?: string): Promise<LeaderboardEntryDto[]> {
    const [memberRows, periodPoints, badgeCounts, hackathonCounts, allowedUserIds] =
      await Promise.all([
        this.db
          .select({
            userId: users.userId,
            username: users.username,
            displayName: users.displayName,
            avatarUrl: gatedAvatarUrl(users.userId, users.avatarUrl),
            allTimePoints: members.points,
          })
          .from(members)
          .innerJoin(users, eq(users.userId, members.userId)),
        this.periodPoints(period),
        this.badgeCounts(),
        this.hackathonCounts(),
        hackathonId ? this.membersOfHackathon(hackathonId) : Promise.resolve(null),
      ]);

    return memberRows
      .filter((m) => !allowedUserIds || allowedUserIds.has(m.userId))
      .map((m) => ({
        userId: m.userId,
        username: m.username,
        displayName: m.displayName,
        avatarUrl: m.avatarUrl,
        points: period === "all" ? m.allTimePoints : (periodPoints.get(m.userId) ?? 0),
        badgeCount: badgeCounts.get(m.userId) ?? 0,
        hackathonCount: hackathonCounts.get(m.userId) ?? 0,
      }))
      .sort((a, b) => b.points - a.points);
  }

  /** userId -> points earned (positive deltas only) since the period start. All-time returns empty (unused). */
  private async periodPoints(period: LeaderboardPeriod): Promise<Map<string, number>> {
    if (period === "all") return new Map();

    const since = new Date();
    since.setDate(since.getDate() - (period === "week" ? 7 : 30));

    const rows = await this.db
      .select({
        userId: pointTransactions.userId,
        total: sql<number>`sum(${pointTransactions.delta})::int`,
      })
      .from(pointTransactions)
      .where(and(gte(pointTransactions.createdAt, since), sql`${pointTransactions.delta} > 0`))
      .groupBy(pointTransactions.userId);

    return new Map(rows.map((r) => [r.userId, Number(r.total)]));
  }

  /** userId -> total badges earned. */
  private async badgeCounts(): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ userId: userBadges.userId, count: sql<number>`count(*)::int` })
      .from(userBadges)
      .groupBy(userBadges.userId);
    return new Map(rows.map((r) => [r.userId, Number(r.count)]));
  }

  /** userId -> number of distinct hackathons they've had a team membership in. */
  private async hackathonCounts(): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        userId: teamMembers.userId,
        count: sql<number>`count(distinct ${teams.hackathonId})::int`,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.teamId, teamMembers.teamId))
      .groupBy(teamMembers.userId);
    return new Map(rows.map((r) => [r.userId, Number(r.count)]));
  }

  /** Every userId who has (or had) a team membership within the given hackathon. */
  private async membersOfHackathon(hackathonId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.teamId, teamMembers.teamId))
      .where(eq(teams.hackathonId, hackathonId));
    return new Set(rows.map((r) => r.userId));
  }
}
