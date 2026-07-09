/**
 * Autor: Dimitrije Pesic (2023/0014)
 */
import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MatchingService } from "./matching.service";

/** Teammate/team matching suggestions for a hackathon. */
@Controller()
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  /**
   * `GET /hackathons/:id/team-suggestions`. Placeholder response — wiring
   * `MatchingService` into this endpoint is D04.
   */
  @Get("hackathons/:id/team-suggestions")
  @UseGuards(JwtAuthGuard)
  teamSuggestions(@Param("id", new ParseUUIDPipe()) _hackathonId: string) {
    return { teammates: [], teams: [] };
  }
}
