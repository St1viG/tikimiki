/**
 * Autor: Dimitrije Pesic (2023/0014)
 */
import {
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { env } from "../config/env";

export interface RateLimitRule {
  limit: number;
  windowSec: number;
}

export const RATE_LIMIT_KEY = "rate_limit_rule";

/** Allow at most `limit` requests per `windowSec` seconds per client IP. */
export const RateLimit = (limit: number, windowSec: number) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, windowSec } satisfies RateLimitRule);

interface WindowState {
  count: number;
  resetAt: number;
}

/**
 * RateLimitGuard — fixed-window in-memory limiter keyed by route + client IP.
 *
 * Guards the credential endpoints (login/register/forgot-password/appeal)
 * against brute force. In-memory is enough here: the API runs as a single
 * process, and a restart resetting the counters is acceptable for this use.
 * Disabled under NODE_ENV=test so integration suites can hammer the auth
 * endpoints without tripping it.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, WindowState>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rule = this.reflector.get<RateLimitRule | undefined>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );
    if (!rule || env.NODE_ENV === "test") return true;

    const req = context.switchToHttp().getRequest<Request>();
    const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";
    const key = `${req.method}:${req.path}:${ip}`;
    const now = Date.now();

    const state = this.windows.get(key);
    if (!state || state.resetAt <= now) {
      this.sweep(now);
      this.windows.set(key, { count: 1, resetAt: now + rule.windowSec * 1000 });
      return true;
    }

    if (state.count >= rule.limit) {
      const retryAfterSec = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
      throw new HttpException(
        { message: "Too many attempts, try again later", retryAfterSec },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    state.count += 1;
    return true;
  }

  /** Drop expired windows once the map grows large, so it can't leak forever. */
  private sweep(now: number) {
    // Only sweep when the map is large enough that the iteration cost is worth it.
    if (this.windows.size < 10_000) return;
    for (const [key, state] of this.windows) {
      if (state.resetAt <= now) this.windows.delete(key);
    }
  }
}
