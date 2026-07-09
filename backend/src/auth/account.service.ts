import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, isNull } from "drizzle-orm";
import { JwtService } from "@nestjs/jwt";
import { AuthzService } from "../common/authz.service";
import { env } from "../config/env";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { appeals, users } from "../db/schema";

type AccountTokenType = "email_verify" | "password_reset";

/**
 * AccountService — email verification, password reset, email change, and the
 * public ban-appeal flow.
 *
 * Verification / reset links are stateless signed JWTs (typ `email_verify` /
 * `password_reset`) so no extra table is needed; the {@link JwtAuthGuard}
 * rejects them as access tokens because it requires `typ === "access"`.
 *
 * There is no mail service in dev, so links are logged to the server console
 * and (outside production) returned to the caller so the flow is testable.
 */
@Injectable()
export class AccountService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly jwt: JwtService,
    private readonly authz: AuthzService,
  ) {}

  private signToken(userId: string, typ: AccountTokenType, ttlSeconds: number): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, typ },
      { secret: env.JWT_ACCESS_SECRET, expiresIn: ttlSeconds },
    );
  }

  private async verifyToken(token: string, typ: AccountTokenType): Promise<string> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; typ: string }>(token, {
        secret: env.JWT_ACCESS_SECRET,
      });
      if (payload.typ !== typ) throw new Error("wrong token type");
      return payload.sub;
    } catch {
      throw new BadRequestException("Invalid or expired token");
    }
  }

  /** Log the link (stand-in for email) and, outside production, return it. */
  private deliver(kind: string, link: string): string | undefined {
    if (env.NODE_ENV === "production") {
      // Never log credential-bearing links in production.
      return undefined;
    }
    console.log(`[account] ${kind} link → ${link}`);
    return link;
  }

  async requestEmailVerification(
    userId: string,
  ): Promise<{ alreadyVerified: boolean; devLink?: string }> {
    const [u] = await this.db
      .select({ isEmailVerified: users.isEmailVerified })
      .from(users)
      .where(eq(users.userId, userId))
      .limit(1);
    if (!u) throw new UnauthorizedException();
    if (u.isEmailVerified) return { alreadyVerified: true };

    const token = await this.signToken(userId, "email_verify", env.EMAIL_VERIFY_TTL);
    const link = `${env.WEB_ORIGIN}/verify-email?token=${token}`;
    return { alreadyVerified: false, devLink: this.deliver("email-verify", link) };
  }

  async confirmEmailVerification(token: string): Promise<{ success: true }> {
    const userId = await this.verifyToken(token, "email_verify");
    await this.db
      .update(users)
      .set({ isEmailVerified: true, updatedAt: new Date() })
      .where(eq(users.userId, userId));
    return { success: true };
  }

  async forgotPassword(email: string): Promise<{ devLink?: string }> {
    const [u] = await this.db
      .select({ userId: users.userId })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);
    // Always succeed — never reveal whether an email is registered.
    if (!u) return {};
    const token = await this.signToken(u.userId, "password_reset", env.PASSWORD_RESET_TTL);
    const link = `${env.WEB_ORIGIN}/reset-password?token=${token}`;
    return { devLink: this.deliver("password-reset", link) };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: true }> {
    const userId = await this.verifyToken(token, "password_reset");
    const passwordHash = await hash(newPassword);
    await this.db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.userId, userId));
    return { success: true };
  }

  async changeEmail(
    userId: string,
    newEmail: string,
  ): Promise<{ success: true; devLink?: string }> {
    const [clash] = await this.db
      .select({ userId: users.userId })
      .from(users)
      .where(eq(users.email, newEmail))
      .limit(1);
    if (clash && clash.userId !== userId) {
      throw new ConflictException("Email already in use");
    }
    await this.db
      .update(users)
      .set({ email: newEmail, isEmailVerified: false, updatedAt: new Date() })
      .where(eq(users.userId, userId));
    const token = await this.signToken(userId, "email_verify", env.EMAIL_VERIFY_TTL);
    const link = `${env.WEB_ORIGIN}/verify-email?token=${token}`;
    return { success: true, devLink: this.deliver("email-verify", link) };
  }

  /** A banned user (who can't log in) submits an appeal — auth by credentials. */
  async submitAppeal(email: string, password: string, reason: string): Promise<{ success: true }> {
    // Same email-or-username identifier the login endpoint accepts.
    const identifier = email.trim();
    const idMatch = identifier.includes("@")
      ? eq(users.email, identifier)
      : eq(users.username, identifier);
    const [u] = await this.db
      .select({ userId: users.userId, passwordHash: users.passwordHash })
      .from(users)
      .where(and(idMatch, isNull(users.deletedAt)))
      .limit(1);
    if (!u || !(await verify(u.passwordHash, password))) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const ban = await this.authz.getActiveBan(u.userId);
    if (!ban) throw new BadRequestException("This account is not banned");

    const [existing] = await this.db
      .select({ appealId: appeals.appealId })
      .from(appeals)
      .where(and(eq(appeals.userId, u.userId), eq(appeals.status, "pending")))
      .limit(1);
    if (existing) throw new ConflictException("You already have a pending appeal");

    await this.db.insert(appeals).values({ userId: u.userId, banId: ban.banId, reason });
    return { success: true };
  }
}
