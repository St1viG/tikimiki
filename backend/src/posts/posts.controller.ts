import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod.pipe";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { OptionalUser } from "../auth/optional-user.decorator";
import { createPostSchema, type CreatePostInput } from "./dto";
import { PostsService } from "./posts.service";

@Controller()
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get("feed")
  @UseGuards(OptionalJwtAuthGuard)
  feed(@OptionalUser() userId: string | null) {
    return this.posts.listFeed(userId);
  }

  @Post("posts")
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createPostSchema)) body: CreatePostInput,
  ) {
    return this.posts.create(userId, body.content, body.attachments);
  }
}
