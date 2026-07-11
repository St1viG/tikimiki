/**
 * Autor: Andrej Colić (2023/0492)
 */
import {
  Body,
  Controller,
  Delete,
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
import { ZodValidationPipe } from "../common/zod.pipe";
import { ApplicationsService } from "./applications.service";
import {
  applicantFilterSchema,
  createApplicationSchema,
  createQuestionSchema,
  createTeamApplicationSchema,
  rejectApplicationSchema,
  updateQuestionSchema,
  withdrawApplicationSchema,
  type ApplicantFilterInput,
  type CreateApplicationInput,
  type CreateQuestionInput,
  type CreateTeamApplicationInput,
  type RejectApplicationInput,
  type UpdateQuestionInput,
  type WithdrawApplicationInput,
} from "./dto";

@Controller("applications")
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(private readonly svc: ApplicationsService) {}

  @Post()
  create(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createApplicationSchema))
    body: CreateApplicationInput,
  ) {
    return this.svc.create(userId, body);
  }

  @Post("team")
  createTeam(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createTeamApplicationSchema))
    body: CreateTeamApplicationInput,
  ) {
    return this.svc.createTeam(userId, body);
  }

  @Get("me")
  listMine(@CurrentUser() userId: string) {
    return this.svc.listMine(userId);
  }

  @Get("hackathon/:hackathonId")
  listForHackathon(
    @CurrentUser() userId: string,
    @Param("hackathonId", new ParseUUIDPipe()) hackathonId: string,
    @Query(new ZodValidationPipe(applicantFilterSchema)) filter: ApplicantFilterInput,
  ) {
    return this.svc.listForHackathon(hackathonId, userId, filter);
  }

  @Get("hackathon/:hackathonId/stats")
  statsForHackathon(
    @CurrentUser() userId: string,
    @Param("hackathonId", new ParseUUIDPipe()) hackathonId: string,
  ) {
    return this.svc.statsForHackathon(hackathonId, userId);
  }

  @Get("hackathon/:hackathonId/questions")
  listQuestions(@Param("hackathonId", new ParseUUIDPipe()) hackathonId: string) {
    return this.svc.listQuestions(hackathonId);
  }

  @Post("hackathon/:hackathonId/questions")
  createQuestion(
    @CurrentUser() userId: string,
    @Param("hackathonId", new ParseUUIDPipe()) hackathonId: string,
    @Body(new ZodValidationPipe(createQuestionSchema))
    body: CreateQuestionInput,
  ) {
    return this.svc.createQuestion(hackathonId, userId, body);
  }

  @Patch("questions/:questionId")
  updateQuestion(
    @CurrentUser() userId: string,
    @Param("questionId", new ParseUUIDPipe()) questionId: string,
    @Body(new ZodValidationPipe(updateQuestionSchema))
    body: UpdateQuestionInput,
  ) {
    return this.svc.updateQuestion(questionId, userId, body);
  }

  @Delete("questions/:questionId")
  deleteQuestion(
    @CurrentUser() userId: string,
    @Param("questionId", new ParseUUIDPipe()) questionId: string,
  ) {
    return this.svc.deleteQuestion(questionId, userId);
  }

  @Get(":id/answers")
  getAnswers(@CurrentUser() userId: string, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.getAnswers(id, userId);
  }

  @Patch(":id/withdraw")
  withdraw(
    @CurrentUser() userId: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(withdrawApplicationSchema))
    body: WithdrawApplicationInput,
  ) {
    return this.svc.withdraw(id, userId, body);
  }

  @Patch(":id/approve")
  approve(@CurrentUser() userId: string, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.approve(id, userId);
  }

  @Patch(":id/reject")
  reject(
    @CurrentUser() userId: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(rejectApplicationSchema))
    body: RejectApplicationInput,
  ) {
    return this.svc.reject(id, userId, body);
  }
}
