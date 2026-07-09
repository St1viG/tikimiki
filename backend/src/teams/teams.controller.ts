import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod.pipe";
import {
  createTeamSchema,
  inviteSchema,
  joinRequestSchema,
  type CreateTeamInput,
  type InviteInput,
  type JoinRequestInput,
} from "./dto";
import { TeamsService } from "./teams.service";

@Controller("teams")
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get("me")
  @UseGuards(JwtAuthGuard)
  myTeams(@CurrentUser() userId: string) {
    return this.teams.myTeams(userId);
  }

  /* ── Invitations (static routes declared before :teamId) ──── */
  @Get("invitations/me")
  @UseGuards(JwtAuthGuard)
  myInvitations(@CurrentUser() userId: string) {
    return this.teams.myInvitations(userId);
  }

  @Get("invitations/count")
  @UseGuards(JwtAuthGuard)
  invitationCount(@CurrentUser() userId: string) {
    return this.teams.invitationCount(userId);
  }

  @Post("invitations/:id/accept")
  @UseGuards(JwtAuthGuard)
  acceptInvitation(@CurrentUser() userId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.teams.respondInvitation(id, userId, true);
  }

  @Post("invitations/:id/decline")
  @UseGuards(JwtAuthGuard)
  declineInvitation(@CurrentUser() userId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.teams.respondInvitation(id, userId, false);
  }

  /* ── Join requests ────────────────────────────────────────── */
  @Post("join-requests/:id/accept")
  @UseGuards(JwtAuthGuard)
  acceptJoinRequest(@CurrentUser() userId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.teams.respondJoinRequest(id, userId, true);
  }

  @Post("join-requests/:id/decline")
  @UseGuards(JwtAuthGuard)
  declineJoinRequest(@CurrentUser() userId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.teams.respondJoinRequest(id, userId, false);
  }

  @Get("open")
  @UseGuards(JwtAuthGuard)
  openTeams(@CurrentUser() userId: string) {
    return this.teams.openTeams(userId);
  }

  @Get("leaderboard")
  leaderboard() {
    return this.teams.leaderboard();
  }

  @Get("solo")
  @UseGuards(JwtAuthGuard)
  soloPlayers() {
    return this.teams.soloPlayers();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createTeamSchema)) body: CreateTeamInput,
  ) {
    return this.teams.create(userId, body);
  }

  @Post(":teamId/join")
  @UseGuards(JwtAuthGuard)
  join(@CurrentUser() userId: string, @Param("teamId", ParseUUIDPipe) teamId: string) {
    return this.teams.join(userId, teamId);
  }

  @Post(":teamId/join-requests")
  @UseGuards(JwtAuthGuard)
  requestToJoin(
    @CurrentUser() userId: string,
    @Param("teamId", ParseUUIDPipe) teamId: string,
    @Body(new ZodValidationPipe(joinRequestSchema)) body: JoinRequestInput,
  ) {
    return this.teams.requestToJoin(userId, teamId, body);
  }

  @Get(":teamId/join-requests")
  @UseGuards(JwtAuthGuard)
  listJoinRequests(@CurrentUser() userId: string, @Param("teamId", ParseUUIDPipe) teamId: string) {
    return this.teams.listJoinRequests(teamId, userId);
  }

  @Post(":teamId/invitations")
  @UseGuards(JwtAuthGuard)
  invite(
    @CurrentUser() userId: string,
    @Param("teamId", ParseUUIDPipe) teamId: string,
    @Body(new ZodValidationPipe(inviteSchema)) body: InviteInput,
  ) {
    return this.teams.invite(teamId, userId, body);
  }
}
