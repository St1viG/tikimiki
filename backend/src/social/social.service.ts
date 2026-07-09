import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, inArray, or } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { friendships, members, userBlocks, users } from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";

export type FriendStatus = "none" | "outgoing" | "incoming" | "friends";

export interface RelationshipDto {
  friendStatus: FriendStatus;
  isBlocked: boolean;
}

/**
 * SocialService — friendships (request/accept/remove) + directional blocking.
 *
 * Friendships use the canonical-order rows in `friendships` (userIdA < userIdB,
 * with `requesterId` recording who sent it). Blocking is directional
 * (blocker → blocked) and also tears down any friendship.
 */
@Injectable()
export class SocialService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly notifications: NotificationsService,
  ) {}

  private order(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
  }

  private async assertExists(userId: string): Promise<void> {
    const [u] = await this.db
      .select({ userId: users.userId })
      .from(users)
      .where(eq(users.userId, userId))
      .limit(1);
    if (!u) throw new NotFoundException("User not found");
  }

  private async assertMember(userId: string): Promise<void> {
    const [m] = await this.db
      .select({ userId: members.userId })
      .from(members)
      .where(eq(members.userId, userId))
      .limit(1);
    if (!m) {
      throw new BadRequestException("Only platform members can be friends");
    }
  }

  private async friendStatus(me: string, other: string): Promise<FriendStatus> {
    const [lo, hi] = this.order(me, other);
    const [row] = await this.db
      .select({
        status: friendships.status,
        requesterId: friendships.requesterId,
      })
      .from(friendships)
      .where(and(eq(friendships.userIdA, lo), eq(friendships.userIdB, hi)))
      .limit(1);
    if (!row) return "none";
    if (row.status === "accepted") return "friends";
    return row.requesterId === me ? "outgoing" : "incoming";
  }

  private async blocked(blockerId: string, blockedId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ blockerId: userBlocks.blockerId })
      .from(userBlocks)
      .where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)))
      .limit(1);
    return Boolean(row);
  }

  async relationship(me: string, other: string): Promise<RelationshipDto> {
    if (me === other) return { friendStatus: "none", isBlocked: false };
    await this.assertExists(other);
    return {
      friendStatus: await this.friendStatus(me, other),
      isBlocked: await this.blocked(me, other),
    };
  }

  /** Send a friend request, or accept an incoming one. */
  async addFriend(me: string, other: string): Promise<RelationshipDto> {
    if (me === other) throw new BadRequestException("You cannot friend yourself");
    await this.assertMember(me);
    await this.assertMember(other);
    if ((await this.blocked(me, other)) || (await this.blocked(other, me))) {
      throw new BadRequestException("Cannot friend a blocked account");
    }

    const [lo, hi] = this.order(me, other);
    const [existing] = await this.db
      .select({
        status: friendships.status,
        requesterId: friendships.requesterId,
      })
      .from(friendships)
      .where(and(eq(friendships.userIdA, lo), eq(friendships.userIdB, hi)))
      .limit(1);

    if (existing) {
      if (existing.status === "accepted") return { friendStatus: "friends", isBlocked: false };
      if (existing.requesterId === me) return { friendStatus: "outgoing", isBlocked: false };
      // Incoming pending → accept it.
      await this.db
        .update(friendships)
        .set({ status: "accepted", respondedAt: new Date() })
        .where(and(eq(friendships.userIdA, lo), eq(friendships.userIdB, hi)));
      await this.notifyFriend(other, me, "friend_request_accepted", "Zahtev prihvaćen");
      return { friendStatus: "friends", isBlocked: false };
    }

    await this.db.insert(friendships).values({
      userIdA: lo,
      userIdB: hi,
      requesterId: me,
      status: "pending",
    });
    await this.notifyFriend(other, me, "friend_request_received", "Novi zahtev za prijateljstvo");
    return { friendStatus: "outgoing", isBlocked: false };
  }

  /** Remove a friend / cancel an outgoing request / decline an incoming one. */
  async removeFriend(me: string, other: string): Promise<RelationshipDto> {
    if (me === other) throw new BadRequestException("Invalid target");
    const [lo, hi] = this.order(me, other);
    await this.db
      .delete(friendships)
      .where(and(eq(friendships.userIdA, lo), eq(friendships.userIdB, hi)));
    return { friendStatus: "none", isBlocked: await this.blocked(me, other) };
  }

  async block(me: string, other: string): Promise<RelationshipDto> {
    if (me === other) throw new BadRequestException("You cannot block yourself");
    await this.assertExists(other);
    await this.db
      .insert(userBlocks)
      .values({ blockerId: me, blockedId: other })
      .onConflictDoNothing();
    // Blocking tears down any friendship between the two.
    const [lo, hi] = this.order(me, other);
    await this.db
      .delete(friendships)
      .where(and(eq(friendships.userIdA, lo), eq(friendships.userIdB, hi)));
    return { friendStatus: "none", isBlocked: true };
  }

  async unblock(me: string, other: string): Promise<RelationshipDto> {
    await this.db
      .delete(userBlocks)
      .where(and(eq(userBlocks.blockerId, me), eq(userBlocks.blockedId, other)));
    return { friendStatus: await this.friendStatus(me, other), isBlocked: false };
  }

  /** A simple list of the caller's accepted friends. */
  async listFriends(me: string): Promise<
    {
      userId: string;
      username: string;
      displayName: string | null;
      avatarUrl: string | null;
    }[]
  > {
    const rows = await this.db
      .select({
        userIdA: friendships.userIdA,
        userIdB: friendships.userIdB,
      })
      .from(friendships)
      .where(
        and(
          eq(friendships.status, "accepted"),
          or(eq(friendships.userIdA, me), eq(friendships.userIdB, me)),
        ),
      );
    const otherIds = rows.map((r) => (r.userIdA === me ? r.userIdB : r.userIdA));
    if (otherIds.length === 0) return [];

    // Single query for all friends, then re-order to match `otherIds`.
    const friends = await this.db
      .select({
        userId: users.userId,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(inArray(users.userId, otherIds));

    const byId = new Map(friends.map((u) => [u.userId, u]));
    const out: {
      userId: string;
      username: string;
      displayName: string | null;
      avatarUrl: string | null;
    }[] = [];
    for (const id of otherIds) {
      const u = byId.get(id);
      if (u) out.push(u);
    }
    return out;
  }

  private async notifyFriend(
    recipientId: string,
    actorId: string,
    type: "friend_request_received" | "friend_request_accepted",
    title: string,
  ): Promise<void> {
    const [actor] = await this.db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.userId, actorId))
      .limit(1);
    await this.notifications.create({
      userId: recipientId,
      type,
      title,
      body:
        type === "friend_request_received"
          ? `${actor?.username ?? "Neko"} ti je poslao zahtev za prijateljstvo.`
          : `${actor?.username ?? "Neko"} je prihvatio tvoj zahtev.`,
      entityType: "user",
      entityId: actorId,
    });
  }
}
