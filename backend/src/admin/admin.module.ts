import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { BansExpiryScheduler } from "./bans-expiry.scheduler";

@Module({
  imports: [MailModule],
  controllers: [AdminController],
  providers: [AdminService, BansExpiryScheduler],
  exports: [AdminService],
})
export class AdminModule {}
