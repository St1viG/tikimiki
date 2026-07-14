import { Controller, Get, Query } from "@nestjs/common";
import { LeaderboardService, type LeaderboardPeriod } from "./leaderboard.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIODS: LeaderboardPeriod[] = ["all", "month", "week"];

@Controller("leaderboard")
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Get()
  get(@Query("period") period?: string, @Query("hackathonId") hackathonId?: string) {
    const p = PERIODS.includes(period as LeaderboardPeriod) ? (period as LeaderboardPeriod) : "all";
    const hid = hackathonId && UUID_RE.test(hackathonId) ? hackathonId : undefined;
    return this.leaderboard.get(p, hid);
  }
}
