import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { OptionalUser } from "../auth/optional-user.decorator";
import { ZodValidationPipe } from "../common/zod.pipe";
import { BountiesService } from "./bounties.service";
import {
  createBountySchema,
  publishResultsSchema,
  setBountyWinnerSchema,
  updateBountySchema,
  type CreateBountyInput,
  type PublishResultsInput,
  type SetBountyWinnerInput,
  type UpdateBountyInput,
} from "./dto";

@Controller("hackathons/:hackathonId")
export class BountiesController {
  constructor(private readonly svc: BountiesService) {}

  @Get("bounties")
  @UseGuards(OptionalJwtAuthGuard)
  listBounties(
    @Param("hackathonId", new ParseUUIDPipe()) hackathonId: string,
    @OptionalUser() userId: string | null,
  ) {
    return this.svc.listBounties(hackathonId, userId);
  }

  @Post("bounties")
  @UseGuards(JwtAuthGuard)
  createBounty(
    @Param("hackathonId", new ParseUUIDPipe()) hackathonId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createBountySchema))
    body: CreateBountyInput,
  ) {
    return this.svc.createBounty(hackathonId, userId, body);
  }

  @Patch("bounties/:bountyId")
  @UseGuards(JwtAuthGuard)
  updateBounty(
    @Param("hackathonId", new ParseUUIDPipe()) hackathonId: string,
    @Param("bountyId", new ParseUUIDPipe()) bountyId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(updateBountySchema))
    body: UpdateBountyInput,
  ) {
    return this.svc.updateBounty(hackathonId, bountyId, userId, body);
  }

  @Delete("bounties/:bountyId")
  @UseGuards(JwtAuthGuard)
  deleteBounty(
    @Param("hackathonId", new ParseUUIDPipe()) hackathonId: string,
    @Param("bountyId", new ParseUUIDPipe()) bountyId: string,
    @CurrentUser() userId: string,
  ) {
    return this.svc.deleteBounty(hackathonId, bountyId, userId);
  }

  @Post("bounties/:bountyId/apply")
  @UseGuards(JwtAuthGuard)
  apply(
    @Param("hackathonId", new ParseUUIDPipe()) hackathonId: string,
    @Param("bountyId", new ParseUUIDPipe()) bountyId: string,
    @CurrentUser() userId: string,
  ) {
    return this.svc.apply(hackathonId, bountyId, userId);
  }

  @Delete("bounties/:bountyId/apply")
  @UseGuards(JwtAuthGuard)
  unapply(
    @Param("hackathonId", new ParseUUIDPipe()) hackathonId: string,
    @Param("bountyId", new ParseUUIDPipe()) bountyId: string,
    @CurrentUser() userId: string,
  ) {
    return this.svc.unapply(hackathonId, bountyId, userId);
  }

  @Get("results")
  @UseGuards(OptionalJwtAuthGuard)
  getResults(@Param("hackathonId", new ParseUUIDPipe()) hackathonId: string) {
    return this.svc.getResults(hackathonId);
  }

  @Post("results")
  @UseGuards(JwtAuthGuard)
  publishResults(
    @Param("hackathonId", new ParseUUIDPipe()) hackathonId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(publishResultsSchema))
    body: PublishResultsInput,
  ) {
    return this.svc.publishResults(hackathonId, userId, body);
  }

  @Post("bounties/:bountyId/winner")
  @UseGuards(JwtAuthGuard)
  setBountyWinner(
    @Param("hackathonId", new ParseUUIDPipe()) hackathonId: string,
    @Param("bountyId", new ParseUUIDPipe()) bountyId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(setBountyWinnerSchema))
    body: SetBountyWinnerInput,
  ) {
    return this.svc.setBountyWinner(hackathonId, bountyId, userId, body.projectId);
  }
}
