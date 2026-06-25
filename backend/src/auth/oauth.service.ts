import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { env } from "../config/env";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { members, users } from "../db/schema";

export type OAuthProvider = "github" | "google";

/** A provider profile reduced to the fields we persist. */
interface NormalizedProfile {
  providerId: string;
  email: string | null;
  username: string;
  avatarUrl: string | null;
}

/**
 * OAuthService — GitHub / Google social login.
 *
 * Flow: {@link authorizeUrl} sends the browser to the provider; the provider
 * redirects back to the callback with a `code`; {@link completeLogin} exchanges
 * it, normalises the profile, and find-or-creates a linked local user. The
 * controller then mints our own JWT session for that user id.
 *
 * Providers are only active when their client id + secret env vars are set;
 * {@link isConfigured} lets the controller degrade gracefully otherwise.
 */
@Injectable()
export class OAuthService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  isConfigured(provider: OAuthProvider): boolean {
    if (provider === "github") {
      return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
    }
    return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  }

  private redirectUri(provider: OAuthProvider): string {
    return `${env.OAUTH_REDIRECT_BASE}/api/v1/auth/oauth/${provider}/callback`;
  }

  /** The provider authorization URL to redirect the browser to. */
  authorizeUrl(provider: OAuthProvider, state: string): string {
    const redirectUri = this.redirectUri(provider);
    if (provider === "github") {
      const p = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        redirect_uri: redirectUri,
        scope: "read:user user:email",
        state,
        allow_signup: "true",
      });
      return `https://github.com/login/oauth/authorize?${p.toString()}`;
    }
    const p = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "online",
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
  }

  /** Exchange the auth code, fetch the profile, and return the local user id. */
  async completeLogin(provider: OAuthProvider, code: string): Promise<string> {
    if (!this.isConfigured(provider)) {
      throw new BadRequestException(`${provider} OAuth is not configured`);
    }
    const profile =
      provider === "github"
        ? await this.fetchGithub(code)
        : await this.fetchGoogle(code);
    return this.upsertUser(provider, profile);
  }

  private async fetchGithub(code: string): Promise<NormalizedProfile> {
    const tokenRes = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: this.redirectUri("github"),
        }),
      },
    );
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) {
      throw new UnauthorizedException("GitHub token exchange failed");
    }
    const headers = {
      Authorization: `Bearer ${token.access_token}`,
      "User-Agent": "tikimiki",
      Accept: "application/vnd.github+json",
    };
    const user = (await (
      await fetch("https://api.github.com/user", { headers })
    ).json()) as {
      id: number;
      login: string;
      name: string | null;
      avatar_url: string | null;
      email: string | null;
    };
    let email = user.email;
    if (!email) {
      const emails = (await (
        await fetch("https://api.github.com/user/emails", { headers })
      ).json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      email =
        emails.find((e) => e.primary && e.verified)?.email ??
        emails[0]?.email ??
        null;
    }
    return {
      providerId: String(user.id),
      email,
      username: user.login,
      avatarUrl: user.avatar_url,
    };
  }

  private async fetchGoogle(code: string): Promise<NormalizedProfile> {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        code,
        redirect_uri: this.redirectUri("google"),
        grant_type: "authorization_code",
      }).toString(),
    });
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) {
      throw new UnauthorizedException("Google token exchange failed");
    }
    const info = (await (
      await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${token.access_token}` },
      })
    ).json()) as {
      id: string;
      email: string | null;
      name: string | null;
      picture: string | null;
    };
    return {
      providerId: info.id,
      email: info.email,
      username: info.email?.split("@")[0] ?? `user${info.id.slice(0, 6)}`,
      avatarUrl: info.picture,
    };
  }

  /** Link the provider to an existing account, or create a fresh member user. */
  private async upsertUser(
    provider: OAuthProvider,
    profile: NormalizedProfile,
  ): Promise<string> {
    const idColumn = provider === "github" ? users.githubId : users.googleId;

    // 1. Already linked → done.
    const [byProvider] = await this.db
      .select({ userId: users.userId })
      .from(users)
      .where(eq(idColumn, profile.providerId))
      .limit(1);
    if (byProvider) return byProvider.userId;

    // 2. An account with the same verified email exists → link the provider.
    if (profile.email) {
      const [byEmail] = await this.db
        .select({ userId: users.userId })
        .from(users)
        .where(eq(users.email, profile.email))
        .limit(1);
      if (byEmail) {
        await this.db
          .update(users)
          .set(
            provider === "github"
              ? {
                  githubId: profile.providerId,
                  githubUsername: profile.username.slice(0, 39),
                }
              : { googleId: profile.providerId },
          )
          .where(eq(users.userId, byEmail.userId));
        return byEmail.userId;
      }
    }

    // 3. Brand-new user (+ members row). OAuth users never sign in with a
    // password, but the column is NOT NULL, so store an unusable hash.
    const email =
      profile.email ?? `${provider}_${profile.providerId}@users.tikimiki.local`;
    const username = await this.uniqueUsername(profile.username);
    const passwordHash = await hash(
      `oauth:${provider}:${profile.providerId}`,
    );

    return this.db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          username,
          email,
          passwordHash,
          isEmailVerified: Boolean(profile.email),
          avatarUrl: profile.avatarUrl,
          ...(provider === "github"
            ? {
                githubId: profile.providerId,
                githubUsername: profile.username.slice(0, 39),
              }
            : { googleId: profile.providerId }),
        })
        .returning();
      await tx.insert(members).values({ userId: u.userId });
      return u.userId;
    });
  }

  /** Derive a unique, schema-valid username from the provider handle. */
  private async uniqueUsername(base: string): Promise<string> {
    const clean =
      base
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 24) || "user";
    let candidate = clean;
    for (let i = 1; i <= 50; i++) {
      const [exists] = await this.db
        .select({ id: users.userId })
        .from(users)
        .where(eq(users.username, candidate))
        .limit(1);
      if (!exists) return candidate;
      candidate = `${clean}${i}`.slice(0, 32);
    }
    return `${clean}${Date.now().toString().slice(-5)}`.slice(0, 32);
  }
}
