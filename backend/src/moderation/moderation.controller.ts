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
import { ZodValidationPipe } from "../common/zod.pipe";
import {
  assignRoleMemberSchema,
  createRoleSchema,
  updateRoleSchema,
  type AssignRoleMemberInput,
  type CreateRoleInput,
  type UpdateRoleInput,
} from "./dto";
import { ModerationService } from "./moderation.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  /* ── Catalog ────────────────────────────────────────────── */

  @Get("permissions")
  listPermissions() {
    return this.moderation.listPermissions();
  }

  @Get("servers/:serverId/my-permissions")
  myPermissions(
    @CurrentUser() userId: string,
    @Param("serverId", new ParseUUIDPipe()) serverId: string,
  ) {
    return this.moderation.myPermissions(serverId, userId);
  }

  /* ── Roles ──────────────────────────────────────────────── */

  @Get("servers/:serverId/roles")
  listRoles(
    @CurrentUser() userId: string,
    @Param("serverId", new ParseUUIDPipe()) serverId: string,
  ) {
    return this.moderation.listRoles(serverId, userId);
  }

  @Post("servers/:serverId/roles")
  createRole(
    @CurrentUser() userId: string,
    @Param("serverId", new ParseUUIDPipe()) serverId: string,
    @Body(new ZodValidationPipe(createRoleSchema)) body: CreateRoleInput,
  ) {
    return this.moderation.createRole(serverId, userId, body);
  }

  @Patch("servers/:serverId/roles/:roleId")
  updateRole(
    @CurrentUser() userId: string,
    @Param("serverId", new ParseUUIDPipe()) serverId: string,
    @Param("roleId", new ParseUUIDPipe()) roleId: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) body: UpdateRoleInput,
  ) {
    return this.moderation.updateRole(serverId, roleId, userId, body);
  }

  @Delete("servers/:serverId/roles/:roleId")
  deleteRole(
    @CurrentUser() userId: string,
    @Param("serverId", new ParseUUIDPipe()) serverId: string,
    @Param("roleId", new ParseUUIDPipe()) roleId: string,
  ) {
    return this.moderation.deleteRole(serverId, roleId, userId);
  }

  /* ── Role membership ────────────────────────────────────── */

  @Post("servers/:serverId/roles/:roleId/members")
  addRoleMember(
    @CurrentUser() userId: string,
    @Param("serverId", new ParseUUIDPipe()) serverId: string,
    @Param("roleId", new ParseUUIDPipe()) roleId: string,
    @Body(new ZodValidationPipe(assignRoleMemberSchema))
    body: AssignRoleMemberInput,
  ) {
    return this.moderation.addRoleMember(serverId, roleId, userId, body.userId);
  }

  @Delete("servers/:serverId/roles/:roleId/members/:userId")
  removeRoleMember(
    @CurrentUser() userId: string,
    @Param("serverId", new ParseUUIDPipe()) serverId: string,
    @Param("roleId", new ParseUUIDPipe()) roleId: string,
    @Param("userId", new ParseUUIDPipe()) targetUserId: string,
  ) {
    return this.moderation.removeRoleMember(serverId, roleId, userId, targetUserId);
  }

  /* ── Kick ───────────────────────────────────────────────── */

  @Delete("servers/:serverId/members/:userId")
  kickMember(
    @CurrentUser() userId: string,
    @Param("serverId", new ParseUUIDPipe()) serverId: string,
    @Param("userId", new ParseUUIDPipe()) targetUserId: string,
  ) {
    return this.moderation.kickMember(serverId, userId, targetUserId);
  }
}
