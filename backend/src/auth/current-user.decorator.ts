import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthedRequest } from "./jwt-auth.guard";

/** Injects the authenticated user id (set by JwtAuthGuard). */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return req.user!.userId;
});
