import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod.pipe";
import { AdminService } from "./admin.service";
import {
  auditQuerySchema,
  banUserSchema,
  listUsersQuerySchema,
  rejectOrgSchema,
  resolveAppealSchema,
  type AuditQuery,
  type BanUserInput,
  type ListUsersQuery,
  type RejectOrgInput,
  type ResolveAppealInput,
} from "./dto";

@Controller("admin")
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  @Get("metrics")
  getMetrics(@CurrentUser() userId: string) {
    return this.svc.getMetrics(userId);
  }

  @Get("users")
  listUsers(
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
  ) {
    return this.svc.listUsers(userId, query);
  }

  @Get("organizations")
  listOrganizations(@CurrentUser() userId: string) {
    return this.svc.listOrganizations(userId);
  }

  @Post("organizations/:userId/verify")
  verifyOrganization(
    @CurrentUser() callerId: string,
    @Param("userId") targetUserId: string,
  ) {
    return this.svc.verifyOrganization(callerId, targetUserId);
  }

  @Post("organizations/:userId/reject")
  rejectOrganization(
    @CurrentUser() callerId: string,
    @Param("userId") targetUserId: string,
    @Body(new ZodValidationPipe(rejectOrgSchema)) body: RejectOrgInput,
  ) {
    return this.svc.rejectOrganization(callerId, targetUserId, body);
  }

  @Post("users/:userId/ban")
  banUser(
    @CurrentUser() callerId: string,
    @Param("userId") targetUserId: string,
    @Body(new ZodValidationPipe(banUserSchema)) body: BanUserInput,
  ) {
    return this.svc.banUser(callerId, targetUserId, body);
  }

  @Post("users/:userId/unban")
  unbanUser(
    @CurrentUser() callerId: string,
    @Param("userId") targetUserId: string,
  ) {
    return this.svc.unbanUser(callerId, targetUserId);
  }

  @Get("audit")
  listAudit(
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQuery,
  ) {
    return this.svc.listAudit(userId, query.search);
  }

  @Get("appeals")
  listAppeals(@CurrentUser() userId: string) {
    return this.svc.listAppeals(userId);
  }

  @Post("appeals/:appealId/resolve")
  resolveAppeal(
    @CurrentUser() userId: string,
    @Param("appealId") appealId: string,
    @Body(new ZodValidationPipe(resolveAppealSchema)) body: ResolveAppealInput,
  ) {
    return this.svc.resolveAppeal(userId, appealId, body);
  }
}
