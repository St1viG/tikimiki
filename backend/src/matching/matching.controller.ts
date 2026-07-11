/**
 * Autor: Dimitrije Pesic (2023/0014)
 */
import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MatchingService } from "./matching.service";

/** Teammate/team matching suggestions for a hackathon. */
@Controller()
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Get("hackathons/:id/team-suggestions")
  @UseGuards(JwtAuthGuard)
  teamSuggestions(
    @CurrentUser() userId: string,
    @Param("id", new ParseUUIDPipe()) hackathonId: string,
  ) {
    return this.matchingService.teamSuggestions(hackathonId, userId);
  }
}
