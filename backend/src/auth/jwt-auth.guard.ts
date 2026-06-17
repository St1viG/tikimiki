import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { env } from "../config/env";

export interface AuthedRequest extends Request {
  user?: { userId: string };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing access token");
    }
    const token = header.slice("Bearer ".length);
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; typ: string }>(
        token,
        { secret: env.JWT_ACCESS_SECRET },
      );
      if (payload.typ !== "access") throw new Error("wrong token type");
      req.user = { userId: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid access token");
    }
  }
}
