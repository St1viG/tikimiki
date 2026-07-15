import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { FeedPost } from "@tikimiki/types";
import { LIKE } from "../common/constants";
import { AuthzService } from "../common/authz.service";
import { CosmeticsService } from "../common/cosmetics.service";
import { gatedAvatarUrl } from "../subscriptions/premium-personalization";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { postAttachments, posts, users } from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";

/** One image/video attached to a post. */
export type PostAttachment = { url: string; type: "image" | "video" };

/** FeedPost augmented with the author's display name + avatar and the post's
 *  ordered image/video attachments. */
export type FeedPostWithDisplayName = FeedPost & {
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  attachments: PostAttachment[];
};

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv|ogg)$/i;
/** Infer media kind from a file URL/extension. */
export function mediaType(url: string): "image" | "video" {
  return VIDEO_EXT.test(url) ? "video" : "image";
}

function buildColumns(userId: string | null) {
  return {
    postId: posts.postId,
    authorId: posts.userId,
    authorUsername: users.username,
    authorDisplayName: users.displayName,
    authorAvatarUrl: gatedAvatarUrl(users.userId, users.avatarUrl),
    content: posts.content,
    createdAt: posts.createdAt,
    editedAt: posts.editedAt,
    reactionCount: sql<number>`(
      select count(*)::int from post_reactions r where r.post_id = ${posts.postId}
    )`,
    commentCount: sql<number>`(
      select count(*)::int from comments c
      where c.post_id = ${posts.postId} and c.deleted_at is null
    )`,
    likedByMe: userId
      ? sql<boolean>`exists(
          select 1 from post_reactions r
          where r.post_id = ${posts.postId} and r.symbol = ${LIKE} and r.user_id = ${userId}
        )`
      : sql<boolean>`false`,
    authorIsFollowing: userId
      ? sql<boolean>`exists(
          select 1 from follows f
          where f.follower_id = ${userId} and f.followee_id = ${posts.userId}
        )`
      : sql<boolean>`false`,
  };
}

type PostRow = {
  postId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  content: string;
  createdAt: Date;
  editedAt: Date | null;
  reactionCount: number;
  commentCount: number;
  likedByMe: boolean;
  authorIsFollowing: boolean;
};

function toFeedPost(r: PostRow, attachments: PostAttachment[]): FeedPostWithDisplayName {
  return {
    postId: r.postId,
    authorId: r.authorId,
    authorUsername: r.authorUsername,
    authorDisplayName: r.authorDisplayName,
    authorAvatarUrl: r.authorAvatarUrl,
    content: r.content,
    createdAt: r.createdAt.toISOString(),
    editedAt: r.editedAt ? r.editedAt.toISOString() : null,
    attachments,
    reactionCount: Number(r.reactionCount),
    commentCount: Number(r.commentCount),
    likedByMe: Boolean(r.likedByMe),
    authorIsFollowing: Boolean(r.authorIsFollowing),
  };
}

@Injectable()
export class PostsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly notifications: NotificationsService,
    private readonly authz: AuthzService,
    private readonly cosmetics: CosmeticsService,
  ) {}

  /** Attach each author's equipped username effect (neon name) in one batch. */
  private async withAuthorEffects(
    list: FeedPostWithDisplayName[],
  ): Promise<FeedPostWithDisplayName[]> {
    if (list.length === 0) return list;
    // Deduplicate author ids so a prolific author doesn't cause redundant lookups.
    const equipped = await this.cosmetics.equippedForUsers([
      ...new Set(list.map((p) => p.authorId)),
    ]);
    return list.map((p) => ({
      ...p,
      authorUsernameEffect: equipped.get(p.authorId)?.usernameEffect ?? null,
    }));
  }

  /** Ordered attachments for a set of posts, grouped by post id (no N+1). */
  private async attachmentsByPost(ids: string[]): Promise<Map<string, PostAttachment[]>> {
    const map = new Map<string, PostAttachment[]>();
    if (ids.length === 0) return map;
    const rows = await this.db
      .select({ postId: postAttachments.postId, url: postAttachments.url })
      .from(postAttachments)
      .where(inArray(postAttachments.postId, ids))
      .orderBy(asc(postAttachments.position));
    for (const a of rows) {
      const list = map.get(a.postId) ?? [];
      list.push({ url: a.url, type: mediaType(a.url) });
      map.set(a.postId, list);
    }
    return map;
  }

  async listFeed(userId: string | null): Promise<FeedPostWithDisplayName[]> {
    const rows = await this.db
      .select(buildColumns(userId))
      .from(posts)
      .innerJoin(users, eq(posts.userId, users.userId))
      .where(isNull(posts.deletedAt))
      .orderBy(desc(posts.createdAt))
      .limit(50);
    const attMap = await this.attachmentsByPost(rows.map((r) => r.postId));
    return this.withAuthorEffects(rows.map((r) => toFeedPost(r, attMap.get(r.postId) ?? [])));
  }

  async create(
    userId: string,
    content: string,
    attachmentUrls: string[] = [],
  ): Promise<FeedPostWithDisplayName> {
    const [row] = await this.db.insert(posts).values({ userId, content }).returning();

    let attachments: PostAttachment[] = [];
    if (attachmentUrls.length > 0) {
      await this.db.insert(postAttachments).values(
        attachmentUrls.map((url, i) => ({
          postId: row.postId,
          url,
          position: i,
        })),
      );
      attachments = attachmentUrls.map((url) => ({ url, type: mediaType(url) }));
    }

    const [author] = await this.db
      .select({
        username: users.username,
        displayName: users.displayName,
        avatarUrl: gatedAvatarUrl(users.userId, users.avatarUrl),
      })
      .from(users)
      .where(eq(users.userId, userId))
      .limit(1);

    // Ping anyone tagged with @username in the body.
    await this.notifications.notifyMentions({
      actorId: userId,
      actorUsername: author.username,
      content: row.content,
      entityType: "post",
      entityId: row.postId,
    });

    const equipped = await this.cosmetics.equippedForUser(userId);

    return {
      postId: row.postId,
      authorId: userId,
      authorUsername: author.username,
      authorDisplayName: author.displayName,
      authorAvatarUrl: author.avatarUrl,
      authorUsernameEffect: equipped.usernameEffect,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
      editedAt: null,
      attachments,
      reactionCount: 0,
      commentCount: 0,
      likedByMe: false,
      authorIsFollowing: false,
    };
  }

  /** Public single-post fetch (powers the shareable post permalink). */
  async getOne(postId: string, userId: string | null): Promise<FeedPostWithDisplayName> {
    const post = await this.getById(postId, userId);
    if (!post) throw new NotFoundException("Post not found");
    return post;
  }

  /** Re-read one (non-deleted) post as a full feed row, from the viewer's POV. */
  private async getById(
    postId: string,
    userId: string | null,
  ): Promise<FeedPostWithDisplayName | null> {
    const [row] = await this.db
      .select(buildColumns(userId))
      .from(posts)
      .innerJoin(users, eq(posts.userId, users.userId))
      .where(and(eq(posts.postId, postId), isNull(posts.deletedAt)))
      .limit(1);
    if (!row) return null;
    const attMap = await this.attachmentsByPost([row.postId]);
    const [post] = await this.withAuthorEffects([toFeedPost(row, attMap.get(row.postId) ?? [])]);
    return post;
  }

  /** Edit a post's content + attachments. Author-only; stamps `editedAt`. */
  async update(
    userId: string,
    postId: string,
    content: string,
    attachmentUrls: string[] = [],
  ): Promise<FeedPostWithDisplayName> {
    const [post] = await this.db
      .select({ userId: posts.userId })
      .from(posts)
      .where(and(eq(posts.postId, postId), isNull(posts.deletedAt)))
      .limit(1);
    if (!post) throw new NotFoundException("Post not found");
    if (post.userId !== userId) {
      throw new ForbiddenException("You can only edit your own post");
    }

    await this.db.transaction(async (tx) => {
      await tx.update(posts).set({ content, editedAt: new Date() }).where(eq(posts.postId, postId));
      // Replace attachments wholesale so reordering / removal is supported.
      await tx.delete(postAttachments).where(eq(postAttachments.postId, postId));
      if (attachmentUrls.length > 0) {
        await tx
          .insert(postAttachments)
          .values(attachmentUrls.map((url, i) => ({ postId, url, position: i })));
      }
    });

    const updated = await this.getById(postId, userId);
    if (!updated) throw new NotFoundException("Post not found");
    return updated;
  }

  /** Soft-delete a post. Author, or an admin acting on a report. */
  async remove(userId: string, postId: string): Promise<{ success: true }> {
    const [post] = await this.db
      .select({ userId: posts.userId })
      .from(posts)
      .where(and(eq(posts.postId, postId), isNull(posts.deletedAt)))
      .limit(1);
    if (!post) throw new NotFoundException("Post not found");
    if (post.userId !== userId && !(await this.authz.isAdmin(userId))) {
      throw new ForbiddenException("You can only delete your own post");
    }

    await this.db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.postId, postId));

    return { success: true };
  }
}
