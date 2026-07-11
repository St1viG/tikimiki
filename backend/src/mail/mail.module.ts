/**
 * Autor: Nenad Skoković (2023/0039)
 */
import { Module } from "@nestjs/common";
import { MailService } from "./mail.service";

/** MailModule — SMTP mail delivery (no-op console log when unconfigured). */
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
