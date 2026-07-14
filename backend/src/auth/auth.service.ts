import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, isNull, or } from "drizzle-orm";
import { AuthzService } from "../common/authz.service";
import { CosmeticsService, type EquippedCosmeticDto } from "../common/cosmetics.service";
import { env } from "../config/env";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { administrators, members, organizations, users } from "../db/schema";
import { AccountService } from "./account.service";
import type { LoginInput, RegisterInput } from "./dto";

export interface PublicUser {
  userId: string;
  username: string;
  displayName: string | null;
  email: string;
  isEmailVerified: boolean;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  createdAt: string;
}

export interface AuthRoles {
  isAdmin: boolean;
  isMember: boolean;
  isOrganization: boolean;
}

export interface MeOrganization {
  name: string;
  verificationStatus: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
}

type UserRow = typeof users.$inferSelect;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly jwt: JwtService,
    private readonly authz: AuthzService,
    private readonly account: AccountService,
    private readonly cosmetics: CosmeticsService,
  ) {}

  private toPublicUser(u: UserRow): PublicUser {
    return {
      userId: u.userId,
      username: u.username,
      displayName: u.displayName,
      email: u.email,
      isEmailVerified: u.isEmailVerified,
      avatarUrl: u.avatarUrl,
      bannerUrl: u.bannerUrl,
      bio: u.bio,
      createdAt: u.createdAt.toISOString(),
    };
  }

  /** Public entry for non-password logins (OAuth): mint a fresh session. */
  async issueSession(userId: string) {
    return this.issueTokens(userId, await this.currentTokenVersion(userId));
  }

  /** The user's current token version (0 when the user is missing). */
  private async currentTokenVersion(userId: string): Promise<number> {
    const [u] = await this.db
      .select({ tokenVersion: users.tokenVersion })
      .from(users)
      .where(and(eq(users.userId, userId), isNull(users.deletedAt)))
      .limit(1);
    return u?.tokenVersion ?? 0;
  }

  /**
   * Refresh tokens carry the tokenVersion they were minted with (`ver`); a
   * password change bumps the version, so every other device's refresh token
   * stops working (SSU3 "sign out of all devices"). Access tokens stay
   * stateless and simply expire within JWT_ACCESS_TTL.
   */
  private async issueTokens(userId: string, tokenVersion: number) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, typ: "access" },
      { secret: env.JWT_ACCESS_SECRET, expiresIn: env.JWT_ACCESS_TTL },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, typ: "refresh", ver: tokenVersion },
      { secret: env.JWT_REFRESH_SECRET, expiresIn: env.JWT_REFRESH_TTL },
    );
    return { accessToken, refreshToken };
  }

  async register(input: RegisterInput) {
    const clash = await this.db
      .select({ id: users.userId })
      .from(users)
      .where(or(eq(users.email, input.email), eq(users.username, input.username)))
      .limit(1);
    if (clash.length > 0) {
      throw new ConflictException("Email or username already in use");
    }

    const passwordHash = await hash(input.password);

    const user = await this.db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          username: input.username,
          email: input.email,
          passwordHash,
        })
        .returning();

      if (input.accountType === "organization") {
        await tx.insert(organizations).values({ userId: u.userId, name: input.organizationName! });
      } else {
        await tx.insert(members).values({ userId: u.userId });
      }
      return u;
    });

    // Verification e-mail is part of registration itself, not a separate
    // user-initiated step. Best-effort: a mail failure must never abort an
    // already-committed registration.
    let verifyDevLink: string | undefined;
    try {
      const verification = await this.account.requestEmailVerification(user.userId);
      verifyDevLink = verification.devLink;
    } catch {
      // Mail problems are logged by MailService; the account stays usable and
      // the user can re-request the link from settings.
    }

    // SSU2: a new organization registration IS the verification request — it
    // must be forwarded to the administrators automatically (best-effort).
    if (input.accountType === "organization") {
      await this.account.notifyAdminsOfOrgRequest(
        input.organizationName!,
        user.username,
        user.email,
      );
    }

    return {
      user: this.toPublicUser(user),
      verifyDevLink,
      ...(await this.issueTokens(user.userId, user.tokenVersion)),
    };
  }

  /**
   * Registration pre-flight: is this email / username still free? Mirrors the
   * clash check in {@link register} (exact match, deleted accounts included,
   * since register would still 409 on them).
   */
  async availability(
    email?: string,
    username?: string,
  ): Promise<{ email?: boolean; username?: boolean }> {
    const out: { email?: boolean; username?: boolean } = {};
    if (email) {
      const [row] = await this.db
        .select({ id: users.userId })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      out.email = !row;
    }
    if (username) {
      const [row] = await this.db
        .select({ id: users.userId })
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
      out.username = !row;
    }
    return out;
  }

  async login(input: LoginInput) {
    // The identifier is an email or a username; emails always contain "@"
    // and usernames never do, so the two lookups cannot collide.
    const identifier = input.email.trim();
    const idMatch = identifier.includes("@")
      ? eq(users.email, identifier)
      : eq(users.username, identifier);
    const [u] = await this.db
      .select()
      .from(users)
      .where(and(idMatch, isNull(users.deletedAt)))
      .limit(1);

    if (!u || !(await verify(u.passwordHash, input.password))) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Block banned accounts. Checked AFTER credential verification so ban
    // status is never revealed to someone who isn't the account owner.
    const ban = await this.authz.getActiveBan(u.userId);
    if (ban) {
      throw new ForbiddenException({
        message: "This account is banned",
        banned: true,
        reason: ban.reason,
      });
    }

    await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.userId, u.userId));

    return { user: this.toPublicUser(u), ...(await this.issueTokens(u.userId, u.tokenVersion)) };
  }

  /**
   * The user id behind a valid refresh token, or null (missing / invalid /
   * banned). Read-only: unlike {@link refresh} it issues no new tokens — used
   * by the OAuth link flow to resolve the current session from the cookie.
   */
  async resolveRefreshUserId(refreshToken: string | undefined): Promise<string | null> {
    if (!refreshToken) return null;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; typ: string; ver?: number }>(
        refreshToken,
        { secret: env.JWT_REFRESH_SECRET },
      );
      if (payload.typ !== "refresh") return null;
      if (await this.authz.isBanned(payload.sub)) return null;
      // Tokens minted before a password change carry a stale version.
      if ((payload.ver ?? 0) !== (await this.currentTokenVersion(payload.sub))) return null;
      return payload.sub;
    } catch {
      return null;
    }
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) throw new UnauthorizedException("Missing refresh token");
    let sub: string;
    let ver: number;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; typ: string; ver?: number }>(
        refreshToken,
        { secret: env.JWT_REFRESH_SECRET },
      );
      if (payload.typ !== "refresh") throw new Error("wrong token type");
      sub = payload.sub;
      ver = payload.ver ?? 0;
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
    // A ban issued mid-session must stop further token refresh.
    if (await this.authz.isBanned(sub)) {
      throw new ForbiddenException("This account is banned");
    }
    // A password change bumps tokenVersion — refresh tokens minted before it
    // are dead, which is what signs the account out of all other devices.
    const currentVersion = await this.currentTokenVersion(sub);
    if (ver !== currentVersion) {
      throw new UnauthorizedException("Session revoked — please sign in again");
    }
    return this.issueTokens(sub, currentVersion);
  }

  async me(userId: string): Promise<
    PublicUser & {
      roles: AuthRoles;
      organization?: MeOrganization;
      usernameEffect: EquippedCosmeticDto | null;
    }
  > {
    const [u] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.userId, userId), isNull(users.deletedAt)))
      .limit(1);
    if (!u) throw new UnauthorizedException();

    const [admin, member, org, equipped] = await Promise.all([
      this.db
        .select({ id: administrators.userId })
        .from(administrators)
        .where(eq(administrators.userId, userId))
        .limit(1),
      this.db
        .select({ id: members.userId })
        .from(members)
        .where(eq(members.userId, userId))
        .limit(1),
      this.db
        .select({
          name: organizations.name,
          verificationStatus: organizations.verificationStatus,
          rejectionReason: organizations.rejectionReason,
        })
        .from(organizations)
        .where(eq(organizations.userId, userId))
        .limit(1),
      this.cosmetics.equippedForUser(userId),
    ]);

    return {
      ...this.toPublicUser(u),
      usernameEffect: equipped.usernameEffect,
      roles: {
        isAdmin: admin.length > 0,
        isMember: member.length > 0,
        isOrganization: org.length > 0,
      },
      // The org's own verification state, so the UI can gate hackathon
      // creation and surface the rejection reason / resubmit action (SSU2).
      ...(org.length > 0
        ? {
            organization: {
              name: org[0].name,
              verificationStatus: org[0].verificationStatus,
              rejectionReason: org[0].rejectionReason,
            },
          }
        : {}),
    };
  }
}
