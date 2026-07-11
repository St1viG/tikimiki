/**
 * Autor: Nenad Skoković (2023/0039)
 */
import { Injectable } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import { env } from "../config/env";

/**
 * MailService — thin nodemailer wrapper.
 *
 * There is no mail service in dev, so with no `SMTP_HOST` configured, sends
 * are logged to the server console instead (same dev-friendly pattern as
 * the private `deliver()` in `AccountService`).
 */
@Injectable()
export class MailService {
  private transporter?: Transporter;

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        // Omit `auth` entirely when no user is set — nodemailer treats an
        // `auth` object with empty strings as credentials to send, and local
        // relays without auth (e.g. MailHog) reject/fail that handshake.
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      });
    }
    return this.transporter;
  }

  async sendMail(to: string, subject: string, html: string): Promise<void> {
    if (!env.SMTP_HOST) {
      console.log(`[mail] (no SMTP configured) → to: ${to}, subject: ${subject}`);
      return;
    }
    await this.getTransporter().sendMail({ from: env.SMTP_FROM, to, subject, html });
  }
}
