import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { OptionalUser } from "../auth/optional-user.decorator";
import { VotingService } from "./voting.service";

@Controller()
export class VotingController {
  constructor(private readonly voting: VotingService) {}

  @Get("hackathons/:hackathonId/voting-status")
  votingStatus(@Param("hackathonId", ParseUUIDPipe) hackathonId: string) {
    return this.voting.votingStatus(hackathonId);
  }

  @Get("hackathons/:hackathonId/projects")
  @UseGuards(OptionalJwtAuthGuard)
  listProjects(
    @Param("hackathonId", ParseUUIDPipe) hackathonId: string,
    @OptionalUser() viewerId: string | null,
  ) {
    return this.voting.listProjects(hackathonId, viewerId);
  }

  @Post("hackathons/:hackathonId/projects/:projectId/vote")
  @UseGuards(JwtAuthGuard)
  castVote(
    @Param("hackathonId", ParseUUIDPipe) hackathonId: string,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @CurrentUser() userId: string,
  ) {
    return this.voting.castVote(hackathonId, projectId, userId);
  }

  @Get("hackathons/:hackathonId/my-vote")
  @UseGuards(JwtAuthGuard)
  myVote(
    @Param("hackathonId", ParseUUIDPipe) hackathonId: string,
    @CurrentUser() userId: string,
  ) {
    return this.voting.myVote(hackathonId, userId);
  }
}
