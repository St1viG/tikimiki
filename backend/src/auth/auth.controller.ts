import { Body, Controller, Get, HttpCode, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { env } from "../config/env";
import { RateLimit, RateLimitGuard } from "../common/rate-limit.guard";
import { ZodValidationPipe } from "../common/zod.pipe";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import {
  availabilityQuerySchema,
  loginSchema,
  registerSchema,
  type AvailabilityQuery,
  type LoginInput,
  type RegisterInput,
} from "./dto";
import { JwtAuthGuard } from "./jwt-auth.guard";

const REFRESH_COOKIE = "tikimiki_refresh";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: "/api/v1/auth",
      maxAge: env.JWT_REFRESH_TTL * 1000,
    });
  }

  /** Public pre-flight for the registration form's live availability check. */
  @Get("availability")
  availability(@Query(new ZodValidationPipe(availabilityQuerySchema)) q: AvailabilityQuery) {
    return this.auth.availability(q.email, q.username);
  }

  @Post("register")
  @UseGuards(RateLimitGuard)
  @RateLimit(5, 60)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, refreshToken, verifyDevLink, pendingApproval } =
      await this.auth.register(body);
    // SSU1: organization registrations get no session until approved — there
    // is no refresh token to set in that case.
    if (refreshToken) this.setRefreshCookie(res, refreshToken);
    return { user, accessToken, verifyDevLink, pendingApproval };
  }

  @Post("login")
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit(10, 60)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, refreshToken } = await this.auth.login(body);
    this.setRefreshCookie(res, refreshToken);
    return { user, accessToken };
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const fromCookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const { accessToken, refreshToken } = await this.auth.refresh(fromCookie);
    this.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  @Post("logout")
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() userId: string) {
    return this.auth.me(userId);
  }
}
