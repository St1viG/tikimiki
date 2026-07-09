import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod.pipe";
import { AccountService } from "./account.service";
import {
  appealSchema,
  changeEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  tokenSchema,
  type AppealInput,
  type ChangeEmailInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
  type TokenInput,
} from "./account.dto";
import { CurrentUser } from "./current-user.decorator";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Controller("auth")
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Post("verify-email/request")
  @UseGuards(JwtAuthGuard)
  requestVerify(@CurrentUser() userId: string) {
    return this.account.requestEmailVerification(userId);
  }

  @Post("verify-email/confirm")
  @HttpCode(200)
  confirmVerify(@Body(new ZodValidationPipe(tokenSchema)) body: TokenInput) {
    return this.account.confirmEmailVerification(body.token);
  }

  @Post("password/forgot")
  @HttpCode(200)
  forgot(
    @Body(new ZodValidationPipe(forgotPasswordSchema))
    body: ForgotPasswordInput,
  ) {
    return this.account.forgotPassword(body.email);
  }

  @Post("password/reset")
  @HttpCode(200)
  reset(@Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput) {
    return this.account.resetPassword(body.token, body.newPassword);
  }

  @Post("change-email")
  @UseGuards(JwtAuthGuard)
  changeEmail(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(changeEmailSchema)) body: ChangeEmailInput,
  ) {
    return this.account.changeEmail(userId, body.email);
  }

  @Post("appeal")
  @HttpCode(200)
  appeal(@Body(new ZodValidationPipe(appealSchema)) body: AppealInput) {
    return this.account.submitAppeal(body.email, body.password, body.reason);
  }
}
