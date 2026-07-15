import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod.pipe";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  activateSubscriptionSchema,
  cancelSubscriptionSchema,
  type ActivateSubscriptionInput,
  type CancelSubscriptionInput,
} from "./dto";
import { SubscriptionsService } from "./subscriptions.service";

@Controller("subscriptions")
export class SubscriptionsController {
  constructor(private readonly svc: SubscriptionsService) {}

  @Get("plans")
  plans() {
    return this.svc.getPlans();
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() userId: string) {
    return this.svc.getMine(userId);
  }

  @Post("activate")
  @UseGuards(JwtAuthGuard)
  activate(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(activateSubscriptionSchema))
    body: ActivateSubscriptionInput,
  ) {
    return this.svc.activate(userId, body);
  }

  @Post("cancel")
  @UseGuards(JwtAuthGuard)
  cancel(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(cancelSubscriptionSchema))
    body: CancelSubscriptionInput,
  ) {
    return this.svc.cancel(userId, body.immediate);
  }
}
