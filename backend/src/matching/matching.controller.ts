/**
 * Autor: Dimitrije Pesic (2023/0014)
 */
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod.pipe";
import {
  acceptProposalSchema,
  proposeTeamSchema,
  type AcceptProposalInput,
  type ProposeTeamInput,
} from "./dto";
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

  /**
   * Full, unscored list of this hackathon's approved-but-teamless applicants
   * — powers the "pick your teammates" checklist on team creation.
   */
  @Get("hackathons/:id/team-candidates")
  @UseGuards(JwtAuthGuard)
  teamCandidates(
    @CurrentUser() userId: string,
    @Param("id", new ParseUUIDPipe()) hackathonId: string,
  ) {
    return this.matchingService.freeAgentsForHackathon(hackathonId, userId);
  }

  /** SSU12: propose one AI-assembled team combination (re-rollable via `excludeUserIds`). */
  @Post("hackathons/:id/team-proposal")
  @UseGuards(JwtAuthGuard)
  proposeTeam(
    @CurrentUser() userId: string,
    @Param("id", new ParseUUIDPipe()) hackathonId: string,
    @Body(new ZodValidationPipe(proposeTeamSchema)) body: ProposeTeamInput,
  ) {
    return this.matchingService.proposeTeam(hackathonId, userId, body.excludeUserIds);
  }

  /** SSU12: accept a proposal — creates the team and invites each proposed member. */
  @Post("hackathons/:id/team-proposal/accept")
  @UseGuards(JwtAuthGuard)
  acceptProposal(
    @CurrentUser() userId: string,
    @Param("id", new ParseUUIDPipe()) hackathonId: string,
    @Body(new ZodValidationPipe(acceptProposalSchema)) body: AcceptProposalInput,
  ) {
    return this.matchingService.acceptProposal(
      hackathonId,
      userId,
      body.teamName,
      body.memberUserIds,
    );
  }
}
