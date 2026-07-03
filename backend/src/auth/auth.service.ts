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
import { env } from "../config/env";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import {
  administrators,
  members,
  organizations,
  users,
} from "../db/schema";
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

type UserRow = typeof users.$inferSelect;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly jwt: JwtService,
    private readonly authz: AuthzService,
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
    return this.issueTokens(userId);
  }

  private async issueTokens(userId: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, typ: "access" },
      { secret: env.JWT_ACCESS_SECRET, expiresIn: env.JWT_ACCESS_TTL },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, typ: "refresh" },
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
        await tx
          .insert(organizations)
          .values({ userId: u.userId, name: input.organizationName! });
      } else {
        await tx.insert(members).values({ userId: u.userId });
      }
      return u;
    });

    return { user: this.toPublicUser(user), ...(await this.issueTokens(user.userId)) };
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

    await this.db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.userId, u.userId));

    return { user: this.toPublicUser(u), ...(await this.issueTokens(u.userId)) };
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) throw new UnauthorizedException("Missing refresh token");
    let sub: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; typ: string }>(
        refreshToken,
        { secret: env.JWT_REFRESH_SECRET },
      );
      if (payload.typ !== "refresh") throw new Error("wrong token type");
      sub = payload.sub;
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
    // A ban issued mid-session must stop further token refresh.
    if (await this.authz.isBanned(sub)) {
      throw new ForbiddenException("This account is banned");
    }
    return this.issueTokens(sub);
  }

  async me(userId: string): Promise<PublicUser & { roles: AuthRoles }> {
    const [u] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.userId, userId), isNull(users.deletedAt)))
      .limit(1);
    if (!u) throw new UnauthorizedException();

    const [admin, member, org] = await Promise.all([
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
        .select({ id: organizations.userId })
        .from(organizations)
        .where(eq(organizations.userId, userId))
        .limit(1),
    ]);

    return {
      ...this.toPublicUser(u),
      roles: {
        isAdmin: admin.length > 0,
        isMember: member.length > 0,
        isOrganization: org.length > 0,
      },
    };
  }
}
