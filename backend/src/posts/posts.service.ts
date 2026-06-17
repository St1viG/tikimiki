import { Inject, Injectable } from "@nestjs/common";
import { asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { FeedPost } from "@tikimiki/types";
import { LIKE } from "../common/constants";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { postAttachments, posts, users } from "../db/schema";

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
    authorAvatarUrl: users.avatarUrl,
    content: posts.content,
    createdAt: posts.createdAt,
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
    attachments,
    reactionCount: Number(r.reactionCount),
    commentCount: Number(r.commentCount),
    likedByMe: Boolean(r.likedByMe),
    authorIsFollowing: Boolean(r.authorIsFollowing),
  };
}

@Injectable()
export class PostsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** Ordered attachments for a set of posts, grouped by post id (no N+1). */
  private async attachmentsByPost(
    ids: string[],
  ): Promise<Map<string, PostAttachment[]>> {
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
    return rows.map((r) => toFeedPost(r, attMap.get(r.postId) ?? []));
  }

  async create(
    userId: string,
    content: string,
    attachmentUrls: string[] = [],
  ): Promise<FeedPostWithDisplayName> {
    const [row] = await this.db
      .insert(posts)
      .values({ userId, content })
      .returning();

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
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.userId, userId))
      .limit(1);
    return {
      postId: row.postId,
      authorId: userId,
      authorUsername: author.username,
      authorDisplayName: author.displayName,
      authorAvatarUrl: author.avatarUrl,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
      attachments,
      reactionCount: 0,
      commentCount: 0,
      likedByMe: false,
      authorIsFollowing: false,
    };
  }
}
