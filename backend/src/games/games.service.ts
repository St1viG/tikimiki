import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { PointsService } from "../common/points.service";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { badges, games, gamePlays, members, userBadges, users } from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";

/** The achievement badge for finishing Grupe with zero mistakes (seeded/migrated by name). */
const GRUPE_PERFECT_BADGE = "Flawless4";
const GRUPE_SLUG = "grupe";
const GRUPE_GROUP_COUNT = 4;

/** A publicly visible active game. */
export interface GameDto {
  gameId: string;
  slug: string;
  name: string;
  description: string | null;
  thumbnailUrl: string | null;
  baseDailyPlays: number;
  maxPointsPerPlay: number | null;
}

/** Per-game daily play state for the current caller. */
export interface TodayStateDto {
  gameId: string;
  slug: string;
  name: string;
  playsUsedToday: number;
  playsAllowed: number;
  playedToday: boolean;
  bestScoreToday: number | null;
}

/** Result of recording a game play. */
export interface PlayResultDto {
  playId: string;
  score: number;
  pointsAwarded: number;
  newBalance: number;
}

/** A single leaderboard entry. */
export interface LeaderboardEntryDto {
  rank: number;
  userId: string;
  username: string;
  score: number;
  playedAt: string;
}

/** The leaderboard for a game (top plays today). */
export interface LeaderboardDto {
  entries: LeaderboardEntryDto[];
}

@Injectable()
export class GamesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly points: PointsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** UTC start-of-today, used for daily-limit comparisons. */
  private startOfTodayUtc(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  /** PUBLIC: list all active games. */
  async listGames(): Promise<GameDto[]> {
    const rows = await this.db
      .select({
        gameId: games.gameId,
        slug: games.slug,
        name: games.name,
        description: games.description,
        thumbnailUrl: games.thumbnailUrl,
        baseDailyPlays: games.baseDailyPlays,
        maxPointsPerPlay: games.maxPointsPerPlay,
      })
      .from(games)
      .where(eq(games.isActive, true))
      .orderBy(desc(games.createdAt));

    return rows.map((r) => ({
      gameId: r.gameId,
      slug: r.slug,
      name: r.name,
      description: r.description,
      thumbnailUrl: r.thumbnailUrl,
      baseDailyPlays: r.baseDailyPlays,
      maxPointsPerPlay: r.maxPointsPerPlay,
    }));
  }

  /** AUTH: per active game, the caller's play state for today. */
  async todayState(userId: string): Promise<TodayStateDto[]> {
    const startOfToday = this.startOfTodayUtc().toISOString();

    const rows = await this.db
      .select({
        gameId: games.gameId,
        slug: games.slug,
        name: games.name,
        baseDailyPlays: games.baseDailyPlays,
        playsUsedToday: sql<number>`(
          select count(*)::int from game_plays gp
          where gp.game_id = ${games.gameId}
            and gp.user_id = ${userId}
            and gp.played_at >= ${startOfToday}::timestamptz
        )`,
        bestScoreToday: sql<number | null>`(
          select max(gp.score) from game_plays gp
          where gp.game_id = ${games.gameId}
            and gp.user_id = ${userId}
            and gp.played_at >= ${startOfToday}::timestamptz
        )`,
      })
      .from(games)
      .where(eq(games.isActive, true))
      .orderBy(desc(games.createdAt));

    return rows.map((r) => {
      const playsUsedToday = Number(r.playsUsedToday);
      const bestScoreToday = r.bestScoreToday === null ? null : Number(r.bestScoreToday);
      return {
        gameId: r.gameId,
        slug: r.slug,
        name: r.name,
        playsUsedToday,
        playsAllowed: r.baseDailyPlays,
        playedToday: playsUsedToday > 0,
        bestScoreToday,
      };
    });
  }

  /**
   * AUTH: record a play and award points if the caller is a member.
   *
   * Points are computed **server-side** from the submitted `score` and the
   * game's `maxPointsPerPlay` cap — the client cannot dictate the reward.
   */
  async recordPlay(
    userId: string,
    gameId: string,
    score: number,
    perfect = false,
  ): Promise<PlayResultDto> {
    const [game] = await this.db
      .select({
        gameId: games.gameId,
        slug: games.slug,
        name: games.name,
        isActive: games.isActive,
        baseDailyPlays: games.baseDailyPlays,
        maxPointsPerPlay: games.maxPointsPerPlay,
      })
      .from(games)
      .where(eq(games.gameId, gameId))
      .limit(1);

    if (!game || !game.isActive) {
      throw new NotFoundException("Game not found");
    }

    const startOfToday = this.startOfTodayUtc();

    const [used] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(gamePlays)
      .where(
        and(
          eq(gamePlays.gameId, gameId),
          eq(gamePlays.userId, userId),
          gte(gamePlays.playedAt, startOfToday),
        ),
      );

    const playsUsedToday = Number(used?.count ?? 0);
    if (playsUsedToday >= game.baseDailyPlays) {
      throw new BadRequestException("Daily play limit reached for this game");
    }

    // Server-authoritative reward: derived from the submitted score and capped
    // by the game's maxPointsPerPlay. The client cannot influence the amount.
    const pointsAwarded =
      game.maxPointsPerPlay === null ? score : Math.min(score, game.maxPointsPerPlay);

    const { result, awardedBadgeId } = await this.db.transaction(async (tx) => {
      const [play] = await tx
        .insert(gamePlays)
        .values({ gameId, userId, score, pointsAwarded })
        .returning();

      // Only members carry a point balance; non-members simply record the play.
      const [member] = await tx
        .select({ points: members.points })
        .from(members)
        .where(eq(members.userId, userId))
        .limit(1);

      let newBalance = member ? member.points : 0;

      if (member && pointsAwarded > 0) {
        const credited = await this.points.credit(tx, userId, pointsAwarded, {
          type: "game_reward",
          referenceId: play.playId,
          note: game.name,
        });
        newBalance = credited.newBalance;
      }

      // Achievement: a flawless Grupe run (all 4 groups, zero mistakes) earns
      // the "Grupe bez greške" badge once. `perfect` comes from the client but
      // is gated on the game slug + a full-solve score; user_badges' PK makes
      // the award idempotent. Badges are member-only (FK → members).
      let badgeId: string | null = null;
      if (member && perfect && game.slug === GRUPE_SLUG && score >= GRUPE_GROUP_COUNT) {
        const [badge] = await tx
          .select({ badgeId: badges.badgeId })
          .from(badges)
          .where(eq(badges.name, GRUPE_PERFECT_BADGE))
          .limit(1);
        if (badge) {
          const inserted = await tx
            .insert(userBadges)
            .values({ userId, badgeId: badge.badgeId })
            .onConflictDoNothing()
            .returning({ badgeId: userBadges.badgeId });
          if (inserted.length > 0) badgeId = badge.badgeId;
        }
      }

      return {
        result: {
          playId: play.playId,
          score: play.score,
          pointsAwarded: play.pointsAwarded,
          newBalance,
        },
        awardedBadgeId: badgeId,
      };
    });

    // Notify outside the transaction so a rollback can't leave a stray
    // notification (create() writes through its own connection + socket push).
    if (awardedBadgeId) {
      await this.notifications.create({
        userId,
        type: "badge_awarded",
        title: `Osvojen bedž: ${GRUPE_PERFECT_BADGE}`,
        body: "Rešio/la si sve četiri grupe bez ijedne greške!",
        entityType: "badge",
        entityId: awardedBadgeId,
      });
    }

    return result;
  }

  /** PUBLIC: top 10 plays today for a game, by score desc. */
  async leaderboard(gameId: string): Promise<LeaderboardDto> {
    const startOfToday = this.startOfTodayUtc();

    const rows = await this.db
      .select({
        userId: gamePlays.userId,
        username: users.username,
        score: gamePlays.score,
        playedAt: gamePlays.playedAt,
      })
      .from(gamePlays)
      .innerJoin(users, eq(gamePlays.userId, users.userId))
      .where(and(eq(gamePlays.gameId, gameId), gte(gamePlays.playedAt, startOfToday)))
      .orderBy(desc(gamePlays.score), desc(gamePlays.playedAt))
      .limit(10);

    const entries: LeaderboardEntryDto[] = rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      username: r.username,
      score: r.score,
      playedAt: r.playedAt.toISOString(),
    }));

    return { entries };
  }
}
