import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { env } from "../config/env";
import type { AuthedRequest } from "./jwt-auth.guard";

/**
 * Like {@link JwtAuthGuard} but never rejects: if a valid access token is
 * present it populates req.user, otherwise the request proceeds anonymously.
 * Used on public endpoints that personalise their response for signed-in users
 * (e.g. the feed's `likedByMe` flag).
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub: string; typ: string }>(
          header.slice("Bearer ".length),
          { secret: env.JWT_ACCESS_SECRET },
        );
        if (payload.typ === "access") req.user = { userId: payload.sub };
      } catch {
        /* invalid/expired token → treat as anonymous */
      }
    }
    return true;
  }
}
