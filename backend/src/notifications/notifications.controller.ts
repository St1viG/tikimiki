import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod.pipe";
import { listNotificationsSchema, type ListNotificationsQuery } from "./dto";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(listNotificationsSchema))
    query: ListNotificationsQuery,
  ) {
    return this.svc.list(userId, query.filter);
  }

  // Declared before the ":id" route so it is not shadowed.
  @Get("unread-count")
  unreadCount(@CurrentUser() userId: string) {
    return this.svc.unreadCount(userId);
  }

  // Declared before the ":id" route so it is not shadowed.
  @Post("mark-all-read")
  markAllRead(@CurrentUser() userId: string) {
    return this.svc.markAllRead(userId);
  }

  @Patch(":id/read")
  markRead(@CurrentUser() userId: string, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.markRead(userId, id);
  }
}
