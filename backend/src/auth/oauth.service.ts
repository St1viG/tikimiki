import { BadRequestException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { env } from "../config/env";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { members, users } from "../db/schema";

export type OAuthProvider = "github" | "google" | "linkedin";

/** A provider profile reduced to the fields we persist. */
interface NormalizedProfile {
  providerId: string;
  email: string | null;
  username: string;
  avatarUrl: string | null;
  /**
   * Autor: Dimitrije Pesic (2023/0014)
   * Raw OAuth access token. Currently only populated by {@link OAuthService.fetchGithub}
   * (persisted to `users.githubAccessToken`, refreshed on every login).
   */
  accessToken?: string;
}

/**
 * OAuthService — GitHub / Google / LinkedIn social login.
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
    if (provider === "linkedin") {
      return Boolean(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET);
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
    if (provider === "linkedin") {
      // LinkedIn implements plain OpenID Connect ("Sign In with LinkedIn v2").
      const p = new URLSearchParams({
        response_type: "code",
        client_id: env.LINKEDIN_CLIENT_ID,
        redirect_uri: redirectUri,
        scope: "openid profile email",
        state,
      });
      return `https://www.linkedin.com/oauth/v2/authorization?${p.toString()}`;
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
    const profile = await this.fetchProfile(provider, code);
    return this.upsertUser(provider, profile);
  }

  /**
   * Exchange the auth code and attach the provider identity to an EXISTING
   * account (Settings → "Poveži"). Unlike {@link completeLogin} this never
   * creates a user and never picks a different account: if the provider
   * identity already belongs to someone else the caller gets "conflict" and
   * nothing is written.
   */
  async completeLink(
    provider: OAuthProvider,
    code: string,
    userId: string,
  ): Promise<"linked" | "conflict"> {
    if (!this.isConfigured(provider)) {
      throw new BadRequestException(`${provider} OAuth is not configured`);
    }
    const profile = await this.fetchProfile(provider, code);
    const [owner] = await this.db
      .select({ userId: users.userId })
      .from(users)
      .where(eq(this.providerIdColumn(provider), profile.providerId))
      .limit(1);
    if (owner && owner.userId !== userId) return "conflict";
    await this.db
      .update(users)
      .set(this.providerColumns(provider, profile))
      .where(eq(users.userId, userId));
    return "linked";
  }

  private fetchProfile(provider: OAuthProvider, code: string): Promise<NormalizedProfile> {
    return provider === "github"
      ? this.fetchGithub(code)
      : provider === "linkedin"
        ? this.fetchLinkedin(code)
        : this.fetchGoogle(code);
  }

  private async fetchGithub(code: string): Promise<NormalizedProfile> {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
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
    });
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) {
      throw new UnauthorizedException("GitHub token exchange failed");
    }
    const headers = {
      Authorization: `Bearer ${token.access_token}`,
      "User-Agent": "tikimiki",
      Accept: "application/vnd.github+json",
    };
    const user = (await (await fetch("https://api.github.com/user", { headers })).json()) as {
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
      email = emails.find((e) => e.primary && e.verified)?.email ?? emails[0]?.email ?? null;
    }
    return {
      providerId: String(user.id),
      email,
      username: user.login,
      avatarUrl: user.avatar_url,
      accessToken: token.access_token,
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

  private async fetchLinkedin(code: string): Promise<NormalizedProfile> {
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: env.LINKEDIN_CLIENT_ID,
        client_secret: env.LINKEDIN_CLIENT_SECRET,
        redirect_uri: this.redirectUri("linkedin"),
      }).toString(),
    });
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) {
      throw new UnauthorizedException("LinkedIn token exchange failed");
    }
    // OIDC userinfo — LinkedIn's only profile surface under the openid scope.
    const info = (await (
      await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${token.access_token}` },
      })
    ).json()) as {
      sub: string;
      name: string | null;
      given_name: string | null;
      family_name: string | null;
      picture: string | null;
      email: string | null;
    };
    if (!info.sub) {
      throw new UnauthorizedException("LinkedIn profile fetch failed");
    }
    const username =
      info.email?.split("@")[0] ??
      [info.given_name, info.family_name].filter(Boolean).join(".") ??
      `user${info.sub.slice(0, 6)}`;
    return {
      providerId: info.sub,
      email: info.email,
      username: username || `user${info.sub.slice(0, 6)}`,
      avatarUrl: info.picture,
    };
  }

  /** The users column holding this provider's stable account id. */
  private providerIdColumn(provider: OAuthProvider) {
    return provider === "github"
      ? users.githubId
      : provider === "linkedin"
        ? users.linkedinId
        : users.googleId;
  }

  /** The id/handle columns a provider owns on the users row. */
  private providerColumns(
    provider: OAuthProvider,
    profile: NormalizedProfile,
  ): Partial<typeof users.$inferInsert> {
    if (provider === "github") {
      return {
        githubId: profile.providerId,
        githubUsername: profile.username.slice(0, 39),
        githubAccessToken: profile.accessToken,
      };
    }
    if (provider === "linkedin") return { linkedinId: profile.providerId };
    return { googleId: profile.providerId };
  }

  /** Link the provider to an existing account, or create a fresh member user. */
  private async upsertUser(provider: OAuthProvider, profile: NormalizedProfile): Promise<string> {
    const idColumn = this.providerIdColumn(provider);

    // 1. Already linked → refresh the provider columns (e.g. a new GitHub
    // access token is minted on every login) and done.
    const [byProvider] = await this.db
      .select({ userId: users.userId })
      .from(users)
      .where(eq(idColumn, profile.providerId))
      .limit(1);
    if (byProvider) {
      await this.db
        .update(users)
        .set(this.providerColumns(provider, profile))
        .where(eq(users.userId, byProvider.userId));
      return byProvider.userId;
    }

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
          .set(this.providerColumns(provider, profile))
          .where(eq(users.userId, byEmail.userId));
        return byEmail.userId;
      }
    }

    // 3. Brand-new user (+ members row). OAuth users never sign in with a
    // password, but the column is NOT NULL, so store an unusable hash.
    const email = profile.email ?? `${provider}_${profile.providerId}@users.tikimiki.local`;
    const username = await this.uniqueUsername(profile.username);
    const passwordHash = await hash(`oauth:${provider}:${profile.providerId}`);

    return this.db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          username,
          email,
          passwordHash,
          isEmailVerified: Boolean(profile.email),
          avatarUrl: profile.avatarUrl,
          ...this.providerColumns(provider, profile),
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
