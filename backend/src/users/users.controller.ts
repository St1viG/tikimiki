import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { OptionalUser } from "../auth/optional-user.decorator";
import { ZodValidationPipe } from "../common/zod.pipe";
import {
  changePasswordSchema,
  type ChangePasswordInput,
  updateProfileSchema,
  type UpdateProfileInput,
} from "./dto";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /* ── /users/me/* must precede /users/:username ───────────── */

  @Get("me/profile")
  @UseGuards(JwtAuthGuard)
  getMyProfile(@CurrentUser() userId: string) {
    return this.users.getMyProfile(userId);
  }

  @Patch("me/profile")
  @UseGuards(JwtAuthGuard)
  updateMyProfile(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    return this.users.updateMyProfile(userId, body);
  }

  @Patch("me/password")
  @UseGuards(JwtAuthGuard)
  changePassword(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(changePasswordSchema))
    body: ChangePasswordInput,
  ) {
    return this.users.changePassword(userId, body);
  }

  @Get("me/points")
  @UseGuards(JwtAuthGuard)
  getMyPoints(@CurrentUser() userId: string) {
    return this.users.getMyPoints(userId);
  }

  /** Username/display-name prefix search — powers the @-mention autocomplete. */
  @Get("search")
  @UseGuards(JwtAuthGuard)
  searchUsers(
    @CurrentUser() userId: string,
    @Query("q") q?: string,
    @Query("limit") limit?: string,
  ) {
    return this.users.searchUsers(q ?? "", userId, limit ? Number(limit) : 8);
  }

  /* ── follow toggle (auth) ────────────────────────────────── */

  @Post(":userId/follow")
  @UseGuards(JwtAuthGuard)
  toggleFollow(@CurrentUser() userId: string, @Param("userId") targetUserId: string) {
    return this.users.toggleFollow(userId, targetUserId);
  }

  /* ── public profile + social/posts (more specific first) ──── */

  @Get(":username/followers")
  @UseGuards(OptionalJwtAuthGuard)
  listFollowers(@Param("username") username: string, @OptionalUser() viewerId: string | null) {
    return this.users.listFollowers(username, viewerId);
  }

  @Get(":username/following")
  @UseGuards(OptionalJwtAuthGuard)
  listFollowing(@Param("username") username: string, @OptionalUser() viewerId: string | null) {
    return this.users.listFollowing(username, viewerId);
  }

  @Get(":username/posts")
  @UseGuards(OptionalJwtAuthGuard)
  listUserPosts(@Param("username") username: string, @OptionalUser() viewerId: string | null) {
    return this.users.listUserPosts(username, viewerId);
  }

  @Get(":username")
  @UseGuards(OptionalJwtAuthGuard)
  getPublicProfile(@Param("username") username: string, @OptionalUser() viewerId: string | null) {
    return this.users.getPublicProfile(username, viewerId);
  }
}
