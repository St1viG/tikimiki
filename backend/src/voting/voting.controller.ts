import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { OptionalUser } from "../auth/optional-user.decorator";
import { ZodValidationPipe } from "../common/zod.pipe";
import { VotingService } from "./voting.service";
import {
  castVoteSchema,
  votingWindowSchema,
  type CastVoteInput,
  type VotingWindowInput,
} from "./dto";

@Controller()
export class VotingController {
  constructor(private readonly voting: VotingService) {}

  @Get("hackathons/:hackathonId/voting-status")
  votingStatus(@Param("hackathonId", ParseUUIDPipe) hackathonId: string) {
    return this.voting.votingStatus(hackathonId);
  }

  /** Organizer/admin sets (or clears) the audience-voting window (SSU14). */
  @Patch("hackathons/:hackathonId/voting-window")
  @UseGuards(JwtAuthGuard)
  setVotingWindow(
    @Param("hackathonId", ParseUUIDPipe) hackathonId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(votingWindowSchema)) body: VotingWindowInput,
  ) {
    return this.voting.setVotingWindow(hackathonId, userId, body);
  }

  @Get("hackathons/:hackathonId/projects")
  @UseGuards(OptionalJwtAuthGuard)
  listProjects(
    @Param("hackathonId", ParseUUIDPipe) hackathonId: string,
    @OptionalUser() viewerId: string | null,
  ) {
    return this.voting.listProjects(hackathonId, viewerId);
  }

  /**
   * SSU14: signed-in members vote with their account; guests vote with a
   * client-generated fingerprint in the body — no JWT required.
   */
  @Post("hackathons/:hackathonId/projects/:projectId/vote")
  @UseGuards(OptionalJwtAuthGuard)
  castVote(
    @Param("hackathonId", ParseUUIDPipe) hackathonId: string,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @OptionalUser() userId: string | null,
    @Body(new ZodValidationPipe(castVoteSchema)) body: CastVoteInput,
  ) {
    return this.voting.castVote(hackathonId, projectId, userId, body.fingerprint ?? null);
  }

  @Get("hackathons/:hackathonId/my-vote")
  @UseGuards(OptionalJwtAuthGuard)
  myVote(
    @Param("hackathonId", ParseUUIDPipe) hackathonId: string,
    @OptionalUser() userId: string | null,
    @Query("fingerprint") fingerprint?: string,
  ) {
    return this.voting.myVote(hackathonId, userId, fingerprint ?? null);
  }
}
