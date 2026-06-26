import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import {
  createProjectSchema,
  updateProjectSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
} from "./dto";
import { ProjectsService } from "./projects.service";

@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  /** The caller's team's project, or `{ project: null }` if none yet. */
  @Get("teams/:teamId/project")
  @UseGuards(JwtAuthGuard)
  async getTeamProject(
    @CurrentUser() userId: string,
    @Param("teamId", ParseUUIDPipe) teamId: string,
  ) {
    return { project: await this.projects.getTeamProject(teamId, userId) };
  }

  @Post("teams/:teamId/project")
  @UseGuards(JwtAuthGuard)
  createProject(
    @CurrentUser() userId: string,
    @Param("teamId", ParseUUIDPipe) teamId: string,
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectInput,
  ) {
    return this.projects.createProject(teamId, userId, body);
  }

  /** Public project detail (drafts are visible only to the owning team). */
  @Get("projects/:projectId")
  @UseGuards(OptionalJwtAuthGuard)
  getProject(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @OptionalUser() viewerId: string | null,
  ) {
    return this.projects.getProject(projectId, viewerId);
  }

  @Patch("projects/:projectId")
  @UseGuards(JwtAuthGuard)
  updateProject(
    @CurrentUser() userId: string,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) body: UpdateProjectInput,
  ) {
    return this.projects.updateProject(projectId, userId, body);
  }

  @Post("projects/:projectId/submit")
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  submitProject(
    @CurrentUser() userId: string,
    @Param("projectId", ParseUUIDPipe) projectId: string,
  ) {
    return this.projects.submitProject(projectId, userId);
  }

  @Post("projects/:projectId/withdraw")
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  withdrawProject(
    @CurrentUser() userId: string,
    @Param("projectId", ParseUUIDPipe) projectId: string,
  ) {
    return this.projects.withdrawProject(projectId, userId);
  }

  /** Every submitted project in a hackathon (showcase / judging). Public. */
  @Get("hackathons/:hackathonId/submissions")
  listSubmissions(
    @Param("hackathonId", ParseUUIDPipe) hackathonId: string,
  ) {
    return this.projects.listSubmissions(hackathonId);
  }
}
