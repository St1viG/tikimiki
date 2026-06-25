import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthedRequest } from "./jwt-auth.guard";

/** The authenticated user id if present (set by OptionalJwtAuthGuard), else null. */
export const OptionalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    return req.user?.userId ?? null;
  },
);
