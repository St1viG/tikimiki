import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { SocialService } from "./social.service";

@Controller("social")
@UseGuards(JwtAuthGuard)
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get("friends")
  listFriends(@CurrentUser() userId: string) {
    return this.social.listFriends(userId);
  }

  @Get("relationship/:userId")
  relationship(
    @CurrentUser() me: string,
    @Param("userId", new ParseUUIDPipe()) userId: string,
  ) {
    return this.social.relationship(me, userId);
  }

  @Post("friends/:userId")
  addFriend(
    @CurrentUser() me: string,
    @Param("userId", new ParseUUIDPipe()) userId: string,
  ) {
    return this.social.addFriend(me, userId);
  }

  @Delete("friends/:userId")
  removeFriend(
    @CurrentUser() me: string,
    @Param("userId", new ParseUUIDPipe()) userId: string,
  ) {
    return this.social.removeFriend(me, userId);
  }

  @Post("block/:userId")
  block(
    @CurrentUser() me: string,
    @Param("userId", new ParseUUIDPipe()) userId: string,
  ) {
    return this.social.block(me, userId);
  }

  @Delete("block/:userId")
  unblock(
    @CurrentUser() me: string,
    @Param("userId", new ParseUUIDPipe()) userId: string,
  ) {
    return this.social.unblock(me, userId);
  }
}
