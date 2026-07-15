import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { commentReactions, comments, postReactions, posts, users } from "../db/schema";
import { LIKE } from "../common/constants";
import { AuthzService } from "../common/authz.service";
import { CosmeticsService, type EquippedCosmeticDto } from "../common/cosmetics.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { CreateCommentInput, UpdateCommentInput } from "./dto";

export interface CommentDto {
  commentId: string;
  postId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  /** Author's equipped username effect (e.g. neon name), null when none. */
  authorUsernameEffect: EquippedCosmeticDto | null;
  parentCommentId: string | null;
  content: string;
  createdAt: string;
  editedAt: string | null;
  reactionCount: number;
  likedByMe: boolean;
}

export interface DeleteResult {
  success: true;
  /** How many comments were soft-deleted (the target plus its reply subtree). */
  deletedCount: number;
}

export interface LikeResult {
  liked: boolean;
  reactionCount: number;
}

type CommentRow = {
  commentId: string;
  postId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  parentCommentId: string | null;
  content: string;
  createdAt: Date;
  editedAt: Date | null;
  reactionCount: number;
  likedByMe: boolean;
};

@Injectable()
export class EngagementService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly notifications: NotificationsService,
    private readonly authz: AuthzService,
    private readonly cosmetics: CosmeticsService,
  ) {}

  private commentColumns(viewerId: string | null) {
    return {
      commentId: comments.commentId,
      postId: comments.postId,
      authorId: comments.userId,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      authorAvatarUrl: users.avatarUrl,
      parentCommentId: comments.parentCommentId,
      content: comments.content,
      createdAt: comments.createdAt,
      editedAt: comments.editedAt,
      reactionCount: sql<number>`(
        select count(*)::int from comment_reactions cr
        where cr.comment_id = ${comments.commentId}
      )`,
      likedByMe: viewerId
        ? sql<boolean>`exists(
            select 1 from comment_reactions cr
            where cr.comment_id = ${comments.commentId} and cr.symbol = ${LIKE} and cr.user_id = ${viewerId}
          )`
        : sql<boolean>`false`,
    };
  }

  private toCommentDto(
    r: CommentRow,
    authorUsernameEffect: EquippedCosmeticDto | null = null,
  ): CommentDto {
    return {
      commentId: r.commentId,
      postId: r.postId,
      authorId: r.authorId,
      authorUsername: r.authorUsername,
      authorDisplayName: r.authorDisplayName,
      authorAvatarUrl: r.authorAvatarUrl,
      authorUsernameEffect,
      parentCommentId: r.parentCommentId,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
      editedAt: r.editedAt ? r.editedAt.toISOString() : null,
      reactionCount: Number(r.reactionCount),
      likedByMe: Boolean(r.likedByMe),
    };
  }

  /** Notifies a post's author about activity (skips self-actions). */
  private async notifyPost(
    recipientId: string,
    actorId: string,
    type: "post_comment" | "post_reaction",
    title: string,
    body: string,
    postId: string,
  ): Promise<void> {
    if (recipientId === actorId) return;
    await this.notifications.create({
      userId: recipientId,
      type,
      title,
      body,
      entityType: "post",
      entityId: postId,
    });
  }

  private async assertPostExists(postId: string): Promise<void> {
    const [post] = await this.db
      .select({ postId: posts.postId })
      .from(posts)
      .where(and(eq(posts.postId, postId), isNull(posts.deletedAt)))
      .limit(1);
    if (!post) throw new NotFoundException("Post not found");
  }

  async listComments(postId: string, viewerId: string | null = null): Promise<CommentDto[]> {
    await this.assertPostExists(postId);
    const rows = await this.db
      .select(this.commentColumns(viewerId))
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.userId))
      .where(and(eq(comments.postId, postId), isNull(comments.deletedAt)))
      .orderBy(asc(comments.createdAt));
    const equipped = await this.cosmetics.equippedForUsers([
      ...new Set(rows.map((r) => r.authorId)),
    ]);
    return rows.map((r) => this.toCommentDto(r, equipped.get(r.authorId)?.usernameEffect ?? null));
  }

  async createComment(
    userId: string,
    postId: string,
    input: CreateCommentInput,
  ): Promise<CommentDto> {
    await this.assertPostExists(postId);

    if (input.parentCommentId) {
      const [parent] = await this.db
        .select({ commentId: comments.commentId })
        .from(comments)
        .where(
          and(
            eq(comments.commentId, input.parentCommentId),
            eq(comments.postId, postId),
            isNull(comments.deletedAt),
          ),
        )
        .limit(1);
      if (!parent) throw new NotFoundException("Parent comment not found");
    }

    const [created] = await this.db
      .insert(comments)
      .values({
        postId,
        userId,
        parentCommentId: input.parentCommentId ?? null,
        content: input.content,
      })
      .returning();

    const [row] = await this.db
      .select(this.commentColumns(userId))
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.userId))
      .where(eq(comments.commentId, created.commentId))
      .limit(1);

    const { usernameEffect } = await this.cosmetics.equippedForUser(userId);
    const dto = this.toCommentDto(row, usernameEffect);

    // Notify the post's author about the new comment.
    const [post] = await this.db
      .select({ authorId: posts.userId })
      .from(posts)
      .where(eq(posts.postId, postId))
      .limit(1);
    if (post) {
      await this.notifyPost(
        post.authorId,
        userId,
        "post_comment",
        "Novi komentar",
        `@${dto.authorUsername} je komentarisao tvoju objavu.`,
        postId,
      );
    }

    // Ping anyone tagged with @username in the comment (links to the post).
    await this.notifications.notifyMentions({
      actorId: userId,
      actorUsername: dto.authorUsername,
      content: input.content,
      entityType: "post",
      entityId: postId,
    });

    return dto;
  }

  /** Edit a comment's content. Author-only; stamps `editedAt`. */
  async updateComment(
    userId: string,
    commentId: string,
    input: UpdateCommentInput,
  ): Promise<CommentDto> {
    const [comment] = await this.db
      .select({ userId: comments.userId })
      .from(comments)
      .where(and(eq(comments.commentId, commentId), isNull(comments.deletedAt)))
      .limit(1);
    if (!comment) throw new NotFoundException("Comment not found");
    if (comment.userId !== userId) {
      throw new ForbiddenException("You can only edit your own comment");
    }

    await this.db
      .update(comments)
      .set({ content: input.content, editedAt: new Date() })
      .where(eq(comments.commentId, commentId));

    const [row] = await this.db
      .select(this.commentColumns(userId))
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.userId))
      .where(eq(comments.commentId, commentId))
      .limit(1);
    const { usernameEffect } = await this.cosmetics.equippedForUser(userId);
    return this.toCommentDto(row, usernameEffect);
  }

  /** Soft-delete a comment (and its reply subtree). Author, or an admin acting on a report. */
  async deleteComment(userId: string, commentId: string): Promise<DeleteResult> {
    const [comment] = await this.db
      .select({ userId: comments.userId })
      .from(comments)
      .where(and(eq(comments.commentId, commentId), isNull(comments.deletedAt)))
      .limit(1);
    if (!comment) throw new NotFoundException("Comment not found");
    if (comment.userId !== userId && !(await this.authz.isAdmin(userId))) {
      throw new ForbiddenException("You can only delete your own comment");
    }

    // Cascade: soft-delete this comment AND its entire reply subtree, so a
    // deleted comment never leaves orphaned replies still counted/visible.
    // Raw SQL is necessary because Drizzle has no built-in recursive CTE helper.
    const subtree = (await this.db.execute(sql`
      WITH RECURSIVE subtree AS (
        SELECT comment_id FROM comments WHERE comment_id = ${commentId}
        UNION ALL
        SELECT c.comment_id FROM comments c
        JOIN subtree s ON c.parent_comment_id = s.comment_id
      )
      SELECT comment_id FROM subtree
    `)) as unknown as { comment_id: string }[];
    const ids = subtree.map((r) => r.comment_id);

    const deleted = await this.db
      .update(comments)
      .set({ deletedAt: new Date() })
      .where(and(inArray(comments.commentId, ids), isNull(comments.deletedAt)))
      .returning({ commentId: comments.commentId });

    return { success: true, deletedCount: deleted.length };
  }

  async togglePostLike(userId: string, postId: string): Promise<LikeResult> {
    await this.assertPostExists(postId);

    // Transaction keeps the insert/delete and the count query atomic so the
    // returned reactionCount always reflects the write that just happened.
    const result = await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ userId: postReactions.userId })
        .from(postReactions)
        .where(
          and(
            eq(postReactions.userId, userId),
            eq(postReactions.postId, postId),
            eq(postReactions.symbol, LIKE),
          ),
        )
        .limit(1);

      let liked: boolean;
      if (existing) {
        await tx
          .delete(postReactions)
          .where(
            and(
              eq(postReactions.userId, userId),
              eq(postReactions.postId, postId),
              eq(postReactions.symbol, LIKE),
            ),
          );
        liked = false;
      } else {
        await tx.insert(postReactions).values({ userId, postId, symbol: LIKE });
        liked = true;
      }

      const [{ reactionCount }] = await tx
        .select({
          reactionCount: sql<number>`count(*)::int`,
        })
        .from(postReactions)
        .where(eq(postReactions.postId, postId));

      return { liked, reactionCount: Number(reactionCount) };
    });

    // Notify the post's author when a like is added (not on unlike).
    if (result.liked) {
      const [post] = await this.db
        .select({ authorId: posts.userId })
        .from(posts)
        .where(eq(posts.postId, postId))
        .limit(1);
      if (post) {
        const [u] = await this.db
          .select({ username: users.username })
          .from(users)
          .where(eq(users.userId, userId))
          .limit(1);
        await this.notifyPost(
          post.authorId,
          userId,
          "post_reaction",
          "Nova reakcija",
          `${u ? `@${u.username}` : "Neko"} je lajkovao tvoju objavu.`,
          postId,
        );
      }
    }

    return result;
  }

  async toggleCommentLike(userId: string, commentId: string): Promise<LikeResult> {
    const [comment] = await this.db
      .select({ commentId: comments.commentId })
      .from(comments)
      .where(and(eq(comments.commentId, commentId), isNull(comments.deletedAt)))
      .limit(1);
    if (!comment) throw new NotFoundException("Comment not found");

    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ userId: commentReactions.userId })
        .from(commentReactions)
        .where(
          and(
            eq(commentReactions.userId, userId),
            eq(commentReactions.commentId, commentId),
            eq(commentReactions.symbol, LIKE),
          ),
        )
        .limit(1);

      let liked: boolean;
      if (existing) {
        await tx
          .delete(commentReactions)
          .where(
            and(
              eq(commentReactions.userId, userId),
              eq(commentReactions.commentId, commentId),
              eq(commentReactions.symbol, LIKE),
            ),
          );
        liked = false;
      } else {
        await tx.insert(commentReactions).values({ userId, commentId, symbol: LIKE });
        liked = true;
      }

      const [{ reactionCount }] = await tx
        .select({
          reactionCount: sql<number>`count(*)::int`,
        })
        .from(commentReactions)
        .where(eq(commentReactions.commentId, commentId));

      return { liked, reactionCount: Number(reactionCount) };
    });
  }
}
