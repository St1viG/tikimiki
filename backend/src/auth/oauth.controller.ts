import { randomUUID } from "crypto";
import { Controller, Get, Param, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { env } from "../config/env";
import { AuthService } from "./auth.service";
import { OAuthService, type OAuthProvider } from "./oauth.service";

const REFRESH_COOKIE = "tikimiki_refresh";
const STATE_COOKIE = "tikimiki_oauth_state";
// Marks the in-flight OAuth round-trip as a LINK (Settings → "Poveži") rather
// than a login. Set only after the refresh cookie proved a live session.
const LINK_COOKIE = "tikimiki_oauth_link";

function isProvider(p: string): p is OAuthProvider {
  return p === "github" || p === "google" || p === "linkedin";
}

/**
 * OAuthController — browser-facing social-login endpoints (NOT under the SPA's
 * fetch layer; these are full-page navigations).
 *
 *   GET /auth/oauth/:provider           → 302 to the provider
 *   GET /auth/oauth/:provider/callback  → exchange code, set session cookie,
 *                                          302 back to the web app
 *
 * On success the refresh cookie is set exactly like password login, then we
 * bounce to `/login?oauth=success` where the SPA calls `refreshSession()` to
 * obtain an access token. All failure modes redirect to `/login?oauth=…` so
 * the user always lands back in the app.
 *
 * LINK MODE (`?link=1`, used by Settings → Integrations): the provider
 * identity is attached to the account behind the CURRENT session's refresh
 * cookie instead of find-or-creating a user, the session cookie is left
 * untouched, and all outcomes bounce to `/settings?oauth=linked|conflict|…`.
 */
@Controller("auth/oauth")
export class OAuthController {
  constructor(
    private readonly oauth: OAuthService,
    private readonly auth: AuthService,
  ) {}

  private loginRedirect(res: Response, status: string): void {
    res.redirect(`${env.WEB_ORIGIN}/login?oauth=${status}`);
  }

  private settingsRedirect(res: Response, status: string): void {
    res.redirect(`${env.WEB_ORIGIN}/settings?oauth=${status}`);
  }

  @Get(":provider")
  async start(
    @Param("provider") provider: string,
    @Query("link") link: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const linking = link === "1";
    const fail = (status: string) =>
      linking ? this.settingsRedirect(res, status) : this.loginRedirect(res, status);
    if (!isProvider(provider)) return fail("error");
    if (!this.oauth.isConfigured(provider)) return fail("unconfigured");
    if (linking) {
      // Linking needs a live session. The refresh cookie rides along because
      // its path (/api/v1/auth) covers this route; expired/absent → back to
      // login, since /settings would bounce there anyway.
      const refresh = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
      const userId = await this.auth.resolveRefreshUserId(refresh);
      if (!userId) return this.loginRedirect(res, "error");
      res.cookie(LINK_COOKIE, "1", {
        httpOnly: true,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
        path: "/api/v1/auth/oauth",
        maxAge: 600_000,
      });
    } else {
      // A plain login must never inherit link mode from an abandoned attempt.
      res.clearCookie(LINK_COOKIE, { path: "/api/v1/auth/oauth" });
    }
    const state = randomUUID();
    res.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: "/api/v1/auth/oauth",
      maxAge: 600_000,
    });
    res.redirect(this.oauth.authorizeUrl(provider, state));
  }

  @Get(":provider/callback")
  async callback(
    @Param("provider") provider: string,
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.clearCookie(STATE_COOKIE, { path: "/api/v1/auth/oauth" });
    const cookies = req.cookies as Record<string, string> | undefined;
    const linking = cookies?.[LINK_COOKIE] === "1";
    if (linking) res.clearCookie(LINK_COOKIE, { path: "/api/v1/auth/oauth" });
    const cookieState = cookies?.[STATE_COOKIE];
    if (!isProvider(provider) || !code || !state || state !== cookieState) {
      return linking ? this.settingsRedirect(res, "error") : this.loginRedirect(res, "error");
    }
    if (linking) {
      // Attach the identity to the current account; the session cookie is
      // NOT reissued — the user stays logged in as themselves.
      const userId = await this.auth.resolveRefreshUserId(cookies?.[REFRESH_COOKIE]);
      if (!userId) return this.loginRedirect(res, "error");
      try {
        const outcome = await this.oauth.completeLink(provider, code, userId);
        return this.settingsRedirect(res, outcome);
      } catch {
        return this.settingsRedirect(res, "error");
      }
    }
    try {
      const userId = await this.oauth.completeLogin(provider, code);
      const { refreshToken } = await this.auth.issueSession(userId);
      res.cookie(REFRESH_COOKIE, refreshToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
        path: "/api/v1/auth",
        maxAge: env.JWT_REFRESH_TTL * 1000,
      });
      this.loginRedirect(res, "success");
    } catch {
      this.loginRedirect(res, "error");
    }
  }
}
