import { randomUUID } from "crypto";
import { Controller, Get, Param, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { env } from "../config/env";
import { AuthService } from "./auth.service";
import { OAuthService, type OAuthProvider } from "./oauth.service";

const REFRESH_COOKIE = "tikimiki_refresh";
const STATE_COOKIE = "tikimiki_oauth_state";

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

  @Get(":provider")
  start(@Param("provider") provider: string, @Res() res: Response): void {
    if (!isProvider(provider)) return this.loginRedirect(res, "error");
    if (!this.oauth.isConfigured(provider)) {
      return this.loginRedirect(res, "unconfigured");
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
    const cookieState = (req.cookies as Record<string, string> | undefined)?.[
      STATE_COOKIE
    ];
    if (!isProvider(provider) || !code || !state || state !== cookieState) {
      return this.loginRedirect(res, "error");
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
