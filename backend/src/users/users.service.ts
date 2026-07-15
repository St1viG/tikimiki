import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";
import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { LIKE } from "../common/constants";
import {
  mediaType,
  type FeedPostWithDisplayName,
  type PostAttachment,
} from "../posts/posts.service";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import {
  administrators,
  badges,
  follows,
  memberSkills,
  members,
  pointTransactions,
  postAttachments,
  posts,
  skills,
  userBadges,
  userSettings,
  users,
} from "../db/schema";
import { CosmeticsService, type EquippedCosmeticDto } from "../common/cosmetics.service";
import { NotificationsService } from "../notifications/notifications.service";
import { gatePremiumPersonalization } from "../subscriptions/premium-personalization";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import type { ChangePasswordInput, DeleteAccountInput, UpdateProfileInput } from "./dto";

/** The transaction handle passed to db.transaction callbacks. */
type Tx = Parameters<Parameters<DrizzleDB["transaction"]>[0]>[0];

/* ── response interfaces ──────────────────────────────────── */

export interface MyProfileDto {
  userId: string;
  username: string;
  displayName: string | null;
  email: string;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  points: number;
  skills: string[];
  /** Subset of `skills` GitHub-verified via `GithubService.deriveAndStoreSkills` (N03). */
  verifiedSkillNames: string[];
  isPremium: boolean;
  createdAt: string;
}

export interface PublicBadgeDto {
  badgeId: string;
  name: string;
  /** How the badge is earned (English fallback; the client may translate known names). */
  description: string;
  iconUrl: string;
  category: string;
  /** When this user earned the badge (ISO). */
  awardedAt: string;
}

export interface PublicProfileDto {
  userId: string;
  username: string;
  displayName: string | null;
  /** Account email — present only when the user enabled `showEmail` (SSU3). */
  email: string | null;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  points: number;
  skills: string[];
  /** Subset of `skills` GitHub-verified via `GithubService.deriveAndStoreSkills` (N03). */
  verifiedSkillNames: string[];
  badges: PublicBadgeDto[];
  followerCount: number;
  followingCount: number;
  /** Whether the requesting viewer follows this user (false when anonymous/self). */
  isFollowing: boolean;
  /** Whether this user currently has an active Premium subscription. */
  isPremium: boolean;
  /** Equipped username effect (e.g. neon name), null when none. */
  usernameEffect: EquippedCosmeticDto | null;
  /** Equipped profile decoration (banner/avatar frame), null when none. */
  profileDecoration: EquippedCosmeticDto | null;
  createdAt: string;
}

export interface ChangePasswordResult {
  success: true;
}

export interface FollowResult {
  following: boolean;
  followerCount: number;
}

export interface SocialUserDto {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface PointTransactionDto {
  transactionId: string;
  type: string;
  delta: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
}

export interface MyPointsDto {
  points: number;
  transactions: PointTransactionDto[];
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly notifications: NotificationsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly cosmetics: CosmeticsService,
  ) {}

  /** Fetch points balance for a user (0 if no member row). */
  private async getPoints(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ points: members.points })
      .from(members)
      .where(eq(members.userId, userId))
      .limit(1);
    return row ? row.points : 0;
  }

  /** Skill rows attached to a user (name + GitHub-verified flag), ascending by name. */
  private async getSkillRows(userId: string): Promise<{ name: string; verified: boolean }[]> {
    return this.db
      .select({ name: skills.name, verified: memberSkills.verified })
      .from(memberSkills)
      .innerJoin(skills, eq(memberSkills.skillId, skills.skillId))
      .where(eq(memberSkills.userId, userId))
      .orderBy(skills.name);
  }

  /** Build the authenticated user's own profile. */
  async getMyProfile(userId: string): Promise<MyProfileDto> {
    const [user] = await this.db
      .select({
        userId: users.userId,
        username: users.username,
        displayName: users.displayName,
        email: users.email,
        bio: users.bio,
        avatarUrl: users.avatarUrl,
        bannerUrl: users.bannerUrl,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.userId, userId))
      .limit(1);
    if (!user) throw new NotFoundException("User not found");

    const [points, skillRows, isPremium] = await Promise.all([
      this.getPoints(userId),
      this.getSkillRows(userId),
      this.subscriptions.isPremium(userId),
    ]);

    // Banner and GIF avatar are Premium-only: kept in the DB after premium
    // lapses (for reactivation) but hidden from display until then.
    const personalization = gatePremiumPersonalization(user, isPremium);

    return {
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      bio: user.bio,
      avatarUrl: personalization.avatarUrl,
      bannerUrl: personalization.bannerUrl,
      points,
      skills: skillRows.map((s) => s.name),
      verifiedSkillNames: skillRows.filter((s) => s.verified).map((s) => s.name),
      isPremium,
      createdAt: user.createdAt.toISOString(),
    };
  }

  /** Update the authenticated user's profile (and skills, if provided). */
  async updateMyProfile(userId: string, input: UpdateProfileInput): Promise<MyProfileDto> {
    const userUpdates: {
      username?: string;
      displayName?: string | null;
      bio?: string | null;
      avatarUrl?: string | null;
      bannerUrl?: string | null;
      updatedAt?: Date;
    } = {};
    if (input.username !== undefined) userUpdates.username = input.username;
    if (input.displayName !== undefined) userUpdates.displayName = input.displayName;
    if (input.bio !== undefined) userUpdates.bio = input.bio;
    if (input.avatarUrl !== undefined) userUpdates.avatarUrl = input.avatarUrl;
    if (input.bannerUrl !== undefined) userUpdates.bannerUrl = input.bannerUrl;

    // Username uniqueness pre-check (excluding the caller).
    if (input.username !== undefined) {
      const [taken] = await this.db
        .select({ userId: users.userId })
        .from(users)
        .where(and(eq(users.username, input.username), ne(users.userId, userId)))
        .limit(1);
      if (taken) throw new ConflictException("Username already taken");
    }

    await this.db.transaction(async (tx) => {
      // Ensure the user exists (and apply scalar updates).
      if (Object.keys(userUpdates).length > 0) {
        userUpdates.updatedAt = new Date();
        const updated = await tx
          .update(users)
          .set(userUpdates)
          .where(eq(users.userId, userId))
          .returning({ userId: users.userId });
        if (updated.length === 0) {
          throw new NotFoundException("User not found");
        }
      } else {
        const [existing] = await tx
          .select({ userId: users.userId })
          .from(users)
          .where(eq(users.userId, userId))
          .limit(1);
        if (!existing) throw new NotFoundException("User not found");
      }

      if (input.skills !== undefined) {
        await this.replaceSkills(tx, userId, input.skills);
      }
    });

    return this.getMyProfile(userId);
  }

  /** Resolve skill names to ids (creating missing rows) and replace the set. */
  private async replaceSkills(tx: Tx, userId: string, names: string[]): Promise<void> {
    // Deduplicate case-sensitively on the trimmed value.
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];

    await tx.delete(memberSkills).where(eq(memberSkills.userId, userId));
    if (unique.length === 0) return;

    // Find existing skills.
    const existing = await tx
      .select({ skillId: skills.skillId, name: skills.name })
      .from(skills)
      .where(inArray(skills.name, unique));
    const byName = new Map(existing.map((s) => [s.name, s.skillId]));

    // Create any missing skills.
    const missing = unique.filter((n) => !byName.has(n));
    if (missing.length > 0) {
      const created = await tx
        .insert(skills)
        .values(missing.map((name) => ({ name })))
        .onConflictDoNothing({ target: skills.name })
        .returning({ skillId: skills.skillId, name: skills.name });
      for (const s of created) byName.set(s.name, s.skillId);

      // Re-read any that lost the insert race (conflict → not returned).
      const stillMissing = missing.filter((n) => !byName.has(n));
      if (stillMissing.length > 0) {
        const refetched = await tx
          .select({ skillId: skills.skillId, name: skills.name })
          .from(skills)
          .where(inArray(skills.name, stillMissing));
        for (const s of refetched) byName.set(s.name, s.skillId);
      }
    }

    const skillIds = unique
      .map((n) => byName.get(n))
      .filter((id): id is string => id !== undefined);
    if (skillIds.length > 0) {
      await tx
        .insert(memberSkills)
        .values(skillIds.map((skillId) => ({ userId, skillId })))
        .onConflictDoNothing();
    }
  }

  /** Verify the current password and set a new one. */
  async changePassword(userId: string, input: ChangePasswordInput): Promise<ChangePasswordResult> {
    const [user] = await this.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.userId, userId))
      .limit(1);
    if (!user) throw new NotFoundException("User not found");

    const valid = await verify(user.passwordHash, input.currentPassword);
    if (!valid) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    const newHash = await hash(input.newPassword);
    // Bumping tokenVersion invalidates every outstanding refresh token, so a
    // password change signs the account out of all devices (SSU3).
    await this.db
      .update(users)
      .set({
        passwordHash: newHash,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.userId, userId));

    return { success: true };
  }

  /**
   * GDPR account deletion (SSU21): soft-delete + anonymization. The row is
   * kept (FKs and anonymized hackathon history survive) but every personal
   * field is wiped or replaced with a non-identifying placeholder, and
   * tokenVersion is bumped so every outstanding refresh token dies (same
   * mechanism as changePassword). Login already excludes deleted accounts
   * (`is null deleted_at`), and the cleared OAuth ids make sure a later
   * OAuth sign-in creates a fresh account instead of reviving this one.
   */
  async deleteMyAccount(userId: string, input: DeleteAccountInput): Promise<{ success: true }> {
    const [user] = await this.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(and(eq(users.userId, userId), isNull(users.deletedAt)))
      .limit(1);
    if (!user) throw new NotFoundException("User not found");

    // Deletion is irreversible — confirm it is really the account owner.
    const valid = await verify(user.passwordHash, input.password);
    if (!valid) {
      throw new UnauthorizedException("Password is incorrect");
    }

    // An unusable random hash keeps the NOT NULL column filled while making
    // password login impossible (mirrors how OAuth signups store theirs).
    const unusableHash = await hash(randomBytes(32).toString("hex"));

    await this.db
      .update(users)
      .set({
        deletedAt: new Date(),
        email: `deleted-${userId}@deleted.local`,
        username: `deleted_${randomBytes(4).toString("hex")}`,
        displayName: null,
        bio: null,
        avatarUrl: null,
        bannerUrl: null,
        passwordHash: unusableHash,
        googleId: null,
        githubId: null,
        githubUsername: null,
        githubAccessToken: null,
        linkedinId: null,
        isEmailVerified: false,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.userId, userId));

    return { success: true };
  }

  /** The target's privacy-relevant settings (defaults when no row exists). */
  private async profilePrivacy(
    targetUserId: string,
  ): Promise<{ visibility: "all" | "members" | "none"; showEmail: boolean }> {
    const [row] = await this.db
      .select({
        profileVisibility: userSettings.profileVisibility,
        showEmail: userSettings.showEmail,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, targetUserId))
      .limit(1);
    return { visibility: row?.profileVisibility ?? "all", showEmail: row?.showEmail ?? false };
  }

  /**
   * Enforce the target's `profileVisibility` setting (SSU3): "members" needs
   * a signed-in viewer, "none" hides the profile from everyone except the
   * owner and platform administrators.
   */
  private async assertProfileVisible(
    targetUserId: string,
    viewerId: string | null,
    visibility: "all" | "members" | "none",
  ): Promise<void> {
    if (visibility === "all" || viewerId === targetUserId) return;
    if (viewerId) {
      if (visibility === "members") return;
      const [admin] = await this.db
        .select({ id: administrators.userId })
        .from(administrators)
        .where(eq(administrators.userId, viewerId))
        .limit(1);
      if (admin) return;
    }
    throw new ForbiddenException("This profile is private");
  }

  /** Public profile lookup by username. */
  async getPublicProfile(
    username: string,
    viewerId: string | null = null,
  ): Promise<PublicProfileDto> {
    const [user] = await this.db
      .select({
        userId: users.userId,
        username: users.username,
        displayName: users.displayName,
        email: users.email,
        bio: users.bio,
        avatarUrl: users.avatarUrl,
        bannerUrl: users.bannerUrl,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    if (!user) throw new NotFoundException("User not found");

    const privacy = await this.profilePrivacy(user.userId);
    await this.assertProfileVisible(user.userId, viewerId, privacy.visibility);

    let isFollowing = false;
    if (viewerId && viewerId !== user.userId) {
      const [f] = await this.db
        .select({ followerId: follows.followerId })
        .from(follows)
        .where(and(eq(follows.followerId, viewerId), eq(follows.followeeId, user.userId)))
        .limit(1);
      isFollowing = Boolean(f);
    }

    const [points, skillRows, badgeRows, followerRow, followingRow, isPremium, equipped] =
      await Promise.all([
        this.getPoints(user.userId),
        this.getSkillRows(user.userId),
        this.db
          .select({
            badgeId: badges.badgeId,
            name: badges.name,
            description: badges.description,
            iconUrl: badges.iconUrl,
            category: badges.category,
            awardedAt: userBadges.awardedAt,
          })
          .from(userBadges)
          .innerJoin(badges, eq(userBadges.badgeId, badges.badgeId))
          .where(eq(userBadges.userId, user.userId))
          .orderBy(desc(userBadges.awardedAt)),
        this.db
          .select({ value: sql<number>`count(*)::int` })
          .from(follows)
          .where(eq(follows.followeeId, user.userId)),
        this.db
          .select({ value: sql<number>`count(*)::int` })
          .from(follows)
          .where(eq(follows.followerId, user.userId)),
        this.subscriptions.isPremium(user.userId),
        this.cosmetics.equippedForUser(user.userId),
      ]);

    // Banner and GIF avatar are Premium-only: kept in the DB after premium
    // lapses (for reactivation) but hidden from display until then.
    const personalization = gatePremiumPersonalization(user, isPremium);

    return {
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      email: privacy.showEmail ? user.email : null,
      bio: user.bio,
      avatarUrl: personalization.avatarUrl,
      bannerUrl: personalization.bannerUrl,
      points,
      skills: skillRows.map((s) => s.name),
      verifiedSkillNames: skillRows.filter((s) => s.verified).map((s) => s.name),
      badges: badgeRows.map((b) => ({
        badgeId: b.badgeId,
        name: b.name,
        description: b.description,
        iconUrl: b.iconUrl,
        category: b.category,
        awardedAt: b.awardedAt.toISOString(),
      })),
      followerCount: followerRow[0] ? Number(followerRow[0].value) : 0,
      followingCount: followingRow[0] ? Number(followingRow[0].value) : 0,
      isFollowing,
      isPremium,
      usernameEffect: equipped.usernameEffect,
      profileDecoration: equipped.profileDecoration,
      createdAt: user.createdAt.toISOString(),
    };
  }

  /** Resolve a username to its user id (404 if missing). */
  private async userIdByUsername(username: string): Promise<string> {
    const [u] = await this.db
      .select({ userId: users.userId })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    if (!u) throw new NotFoundException("User not found");
    return u.userId;
  }

  /** GET /users/:username/followers — users who follow :username. */
  async listFollowers(username: string, viewerId: string | null = null): Promise<SocialUserDto[]> {
    const targetId = await this.userIdByUsername(username);
    const { visibility } = await this.profilePrivacy(targetId);
    await this.assertProfileVisible(targetId, viewerId, visibility);
    const rows = await this.db
      .select({
        userId: users.userId,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(follows)
      .innerJoin(users, eq(users.userId, follows.followerId))
      .where(eq(follows.followeeId, targetId))
      .orderBy(desc(follows.createdAt));
    return rows;
  }

  /** GET /users/:username/following — users :username follows. */
  async listFollowing(username: string, viewerId: string | null = null): Promise<SocialUserDto[]> {
    const targetId = await this.userIdByUsername(username);
    const { visibility } = await this.profilePrivacy(targetId);
    await this.assertProfileVisible(targetId, viewerId, visibility);
    const rows = await this.db
      .select({
        userId: users.userId,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(follows)
      .innerJoin(users, eq(users.userId, follows.followeeId))
      .where(eq(follows.followerId, targetId))
      .orderBy(desc(follows.createdAt));
    return rows;
  }

  /** GET /users/:username/posts — that user's posts in FeedPost shape. */
  async listUserPosts(
    username: string,
    viewerId: string | null,
  ): Promise<FeedPostWithDisplayName[]> {
    const targetId = await this.userIdByUsername(username);
    const { visibility } = await this.profilePrivacy(targetId);
    await this.assertProfileVisible(targetId, viewerId, visibility);
    const rows = await this.db
      .select({
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
        likedByMe: viewerId
          ? sql<boolean>`exists(
              select 1 from post_reactions r
              where r.post_id = ${posts.postId} and r.symbol = ${LIKE} and r.user_id = ${viewerId}
            )`
          : sql<boolean>`false`,
        authorIsFollowing: viewerId
          ? sql<boolean>`exists(
              select 1 from follows f
              where f.follower_id = ${viewerId} and f.followee_id = ${posts.userId}
            )`
          : sql<boolean>`false`,
      })
      .from(posts)
      .innerJoin(users, eq(posts.userId, users.userId))
      .where(and(eq(posts.userId, targetId), isNull(posts.deletedAt)))
      .orderBy(desc(posts.createdAt))
      .limit(50);

    // Ordered attachments per post (single query, grouped by post id).
    const ids = rows.map((r) => r.postId);
    const attMap = new Map<string, PostAttachment[]>();
    if (ids.length > 0) {
      const atts = await this.db
        .select({ postId: postAttachments.postId, url: postAttachments.url })
        .from(postAttachments)
        .where(inArray(postAttachments.postId, ids))
        .orderBy(asc(postAttachments.position));
      for (const a of atts) {
        const list = attMap.get(a.postId) ?? [];
        list.push({ url: a.url, type: mediaType(a.url) });
        attMap.set(a.postId, list);
      }
    }

    // All rows share the same author, so their equipped name effect is fetched once.
    const { usernameEffect } = await this.cosmetics.equippedForUser(targetId);

    return rows.map((r) => ({
      postId: r.postId,
      authorId: r.authorId,
      authorUsername: r.authorUsername,
      authorDisplayName: r.authorDisplayName,
      authorAvatarUrl: r.authorAvatarUrl,
      authorUsernameEffect: usernameEffect,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
      attachments: attMap.get(r.postId) ?? [],
      reactionCount: Number(r.reactionCount),
      commentCount: Number(r.commentCount),
      likedByMe: Boolean(r.likedByMe),
      authorIsFollowing: Boolean(r.authorIsFollowing),
    }));
  }

  /**
   * Prefix search over username + display name for the @-mention picker.
   * Excludes the caller; matches are case-insensitive and start-anchored.
   * Returns an empty list for a blank query (so an empty `@` doesn't dump the
   * whole user table).
   */
  async searchUsers(q: string, viewerId: string, limit = 8): Promise<SocialUserDto[]> {
    const term = q.trim();
    if (term.length === 0) return [];
    // Escape LIKE wildcards so a literal % / _ in the query can't widen it.
    const prefix = `${term.replace(/[\\%_]/g, "\\$&")}%`;
    const take = Math.min(Math.max(limit, 1), 20);

    return this.db
      .select({
        userId: users.userId,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(
        and(
          ne(users.userId, viewerId),
          or(ilike(users.username, prefix), ilike(users.displayName, prefix)),
        ),
      )
      .orderBy(asc(users.username))
      .limit(take);
  }

  /** Toggle the caller's follow relationship with the target user. */
  async toggleFollow(followerId: string, followeeId: string): Promise<FollowResult> {
    if (followerId === followeeId) {
      throw new BadRequestException("You cannot follow yourself");
    }

    const [target] = await this.db
      .select({ userId: users.userId })
      .from(users)
      .where(eq(users.userId, followeeId))
      .limit(1);
    if (!target) throw new NotFoundException("User not found");

    const following = await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ followerId: follows.followerId })
        .from(follows)
        .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)))
        .limit(1);

      if (existing) {
        await tx
          .delete(follows)
          .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)));
        return false;
      }

      await tx.insert(follows).values({ followerId, followeeId }).onConflictDoNothing();
      return true;
    });

    // Notify the followee when a new follow is created (not on unfollow).
    if (following) {
      const [follower] = await this.db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.userId, followerId))
        .limit(1);
      await this.notifications.create({
        userId: followeeId,
        type: "new_follower",
        title: "Novi pratilac",
        body: `${follower ? `@${follower.username}` : "Neko"} te sada prati.`,
        entityType: "user",
        entityId: followerId,
      });
    }

    const [countRow] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(follows)
      .where(eq(follows.followeeId, followeeId));

    return {
      following,
      followerCount: countRow ? Number(countRow.value) : 0,
    };
  }

  /** Points balance plus the latest 50 ledger entries. */
  async getMyPoints(userId: string): Promise<MyPointsDto> {
    const [points, txns] = await Promise.all([
      this.getPoints(userId),
      this.db
        .select({
          transactionId: pointTransactions.transactionId,
          type: pointTransactions.type,
          delta: pointTransactions.delta,
          balanceAfter: pointTransactions.balanceAfter,
          note: pointTransactions.note,
          createdAt: pointTransactions.createdAt,
        })
        .from(pointTransactions)
        .where(eq(pointTransactions.userId, userId))
        .orderBy(desc(pointTransactions.createdAt))
        .limit(50),
    ]);

    return {
      points,
      transactions: txns.map((t) => ({
        transactionId: t.transactionId,
        type: t.type,
        delta: t.delta,
        balanceAfter: t.balanceAfter,
        note: t.note,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }
}
