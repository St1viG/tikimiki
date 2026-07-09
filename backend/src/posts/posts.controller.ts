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
import { ZodValidationPipe } from "../common/zod.pipe";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { OptionalUser } from "../auth/optional-user.decorator";
import {
  createPostSchema,
  updatePostSchema,
  type CreatePostInput,
  type UpdatePostInput,
} from "./dto";
import { PostsService } from "./posts.service";

@Controller()
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get("feed")
  @UseGuards(OptionalJwtAuthGuard)
  feed(@OptionalUser() userId: string | null) {
    return this.posts.listFeed(userId);
  }

  @Get("posts/:postId")
  @UseGuards(OptionalJwtAuthGuard)
  getOne(@Param("postId", ParseUUIDPipe) postId: string, @OptionalUser() userId: string | null) {
    return this.posts.getOne(postId, userId);
  }

  @Post("posts")
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createPostSchema)) body: CreatePostInput,
  ) {
    return this.posts.create(userId, body.content, body.attachments);
  }

  @Patch("posts/:postId")
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() userId: string,
    @Param("postId", ParseUUIDPipe) postId: string,
    @Body(new ZodValidationPipe(updatePostSchema)) body: UpdatePostInput,
  ) {
    return this.posts.update(userId, postId, body.content, body.attachments);
  }

  @Delete("posts/:postId")
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser() userId: string, @Param("postId", ParseUUIDPipe) postId: string) {
    return this.posts.remove(userId, postId);
  }
}
