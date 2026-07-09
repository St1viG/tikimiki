/**
 * Autor: Nenad Skoković (2023/0039)
 */
import { BadRequestException, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { memberSkills, skills, users } from "../db/schema";
import { GithubService, type GithubProfileStats } from "./github.service";

/** One of the caller's skill tags, with its verification provenance. */
export interface VerifiedSkillDto {
  name: string;
  verified: boolean;
  source: string;
}

@Controller("users/me")
export class GithubController {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly github: GithubService,
  ) {}

  /**
   * `POST /users/me/github/sync` — refresh GitHub repo/language stats for the
   * caller and re-derive their verified skill tags from `stats.topLanguages`
   * (N02/N03). 400 if the caller never linked GitHub.
   */
  @Post("github/sync")
  @UseGuards(JwtAuthGuard)
  async sync(@CurrentUser() userId: string): Promise<{
    stats: GithubProfileStats;
    verifiedSkills: VerifiedSkillDto[];
  }> {
    const [row] = await this.db
      .select({ githubAccessToken: users.githubAccessToken })
      .from(users)
      .where(eq(users.userId, userId))
      .limit(1);
    const token = row?.githubAccessToken;
    if (!token) {
      throw new BadRequestException("GitHub nije povezan");
    }

    const stats = await this.github.fetchProfileStats(token);
    await this.github.deriveAndStoreSkills(userId, stats.topLanguages);

    const verifiedSkills = await this.db
      .select({
        name: skills.name,
        verified: memberSkills.verified,
        source: memberSkills.source,
      })
      .from(memberSkills)
      .innerJoin(skills, eq(skills.skillId, memberSkills.skillId))
      .where(eq(memberSkills.userId, userId));

    return { stats, verifiedSkills };
  }
}
