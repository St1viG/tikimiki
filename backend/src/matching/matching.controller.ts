/**
 * Autor: Dimitrije Pesic (2023/0014)
 */
import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

/** Teammate/team matching suggestions for a hackathon. */
@Controller()
export class MatchingController {
  /**
   * `GET /hackathons/:id/team-suggestions`. Placeholder until the matching
   * service (D02) is wired up — no database access yet.
   */
  @Get("hackathons/:id/team-suggestions")
  @UseGuards(JwtAuthGuard)
  teamSuggestions(@Param("id", new ParseUUIDPipe()) _hackathonId: string) {
    return { teammates: [], teams: [] };
  }
}
