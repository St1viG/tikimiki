import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AccountController } from "./account.controller";
import { AccountService } from "./account.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { OAuthController } from "./oauth.controller";
import { OAuthService } from "./oauth.service";

@Module({
  imports: [JwtModule.register({ global: true })],
  controllers: [AuthController, OAuthController, AccountController],
  providers: [AuthService, JwtAuthGuard, OAuthService, AccountService],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
