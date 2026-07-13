import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { RateLimitGuard } from "../common/rate-limit.guard";
import { MailModule } from "../mail/mail.module";
import { AccountController } from "./account.controller";
import { AccountService } from "./account.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { OAuthController } from "./oauth.controller";
import { OAuthService } from "./oauth.service";

@Module({
  imports: [JwtModule.register({ global: true }), MailModule],
  controllers: [AuthController, OAuthController, AccountController],
  providers: [AuthService, JwtAuthGuard, OAuthService, AccountService, RateLimitGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
