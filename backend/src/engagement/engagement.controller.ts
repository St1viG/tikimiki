import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod.pipe";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { OptionalUser } from "../auth/optional-user.decorator";
import { createCommentSchema, type CreateCommentInput } from "./dto";
import { EngagementService } from "./engagement.service";

@Controller()
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Get("posts/:postId/comments")
  @UseGuards(OptionalJwtAuthGuard)
  listComments(
    @Param("postId", ParseUUIDPipe) postId: string,
    @OptionalUser() viewerId: string | null,
  ) {
    return this.engagement.listComments(postId, viewerId);
  }

  @Post("posts/:postId/comments")
  @UseGuards(JwtAuthGuard)
  createComment(
    @CurrentUser() userId: string,
    @Param("postId", ParseUUIDPipe) postId: string,
    @Body(new ZodValidationPipe(createCommentSchema)) body: CreateCommentInput,
  ) {
    return this.engagement.createComment(userId, postId, body);
  }

  @Delete("comments/:commentId")
  @UseGuards(JwtAuthGuard)
  deleteComment(
    @CurrentUser() userId: string,
    @Param("commentId", ParseUUIDPipe) commentId: string,
  ) {
    return this.engagement.deleteComment(userId, commentId);
  }

  @Post("posts/:postId/like")
  @UseGuards(JwtAuthGuard)
  togglePostLike(
    @CurrentUser() userId: string,
    @Param("postId", ParseUUIDPipe) postId: string,
  ) {
    return this.engagement.togglePostLike(userId, postId);
  }

  @Post("comments/:commentId/like")
  @UseGuards(JwtAuthGuard)
  toggleCommentLike(
    @CurrentUser() userId: string,
    @Param("commentId", ParseUUIDPipe) commentId: string,
  ) {
    return this.engagement.toggleCommentLike(userId, commentId);
  }
}
