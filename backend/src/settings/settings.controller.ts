import { Body, Controller, Delete, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod.pipe";
import { updateSettingsSchema, type UpdateSettingsInput } from "./dto";
import { type IntegrationsDto, type SettingsDto, SettingsService } from "./settings.service";

@Controller("settings")
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly svc: SettingsService) {}

  /** Caller's privacy + notification preferences. */
  @Get()
  get(@CurrentUser() userId: string): Promise<SettingsDto> {
    return this.svc.get(userId);
  }

  /** Partially update + upsert the caller's settings. */
  @Patch()
  update(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(updateSettingsSchema))
    body: UpdateSettingsInput,
  ): Promise<SettingsDto> {
    return this.svc.update(userId, body);
  }

  /** OAuth integration status. */
  @Get("integrations")
  getIntegrations(@CurrentUser() userId: string): Promise<IntegrationsDto> {
    return this.svc.getIntegrations(userId);
  }

  /** Disconnect a single OAuth provider. */
  @Delete("integrations/:provider")
  disconnect(
    @CurrentUser() userId: string,
    @Param("provider") provider: string,
  ): Promise<IntegrationsDto> {
    return this.svc.disconnect(userId, provider);
  }
}
