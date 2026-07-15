/**
 * Periodic sweep that lifts expired time-limited bans (SSU21). Login and
 * refresh already treat a past `expires_at` as inactive via
 * `AuthzService.getActiveBan`, so this sweep only reconciles the rows:
 * marking them lifted keeps the "one active ban per user" partial unique
 * index free for a future ban and makes admin listings reflect reality.
 * `lifted_by` stays null — that is what distinguishes an automatic expiry
 * from a manual unban.
 *
 * Autor: Dimitrije Pesic (2023/0014)
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { and, isNull, lte } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { userBans } from "../db/schema";

@Injectable()
export class BansExpiryScheduler {
  private readonly logger = new Logger(BansExpiryScheduler.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async liftExpiredBans(): Promise<void> {
    const now = new Date();

    const lifted = await this.db
      .update(userBans)
      .set({ liftedAt: now })
      .where(and(isNull(userBans.liftedAt), lte(userBans.expiresAt, now)))
      .returning({ banId: userBans.banId });

    if (lifted.length > 0) {
      this.logger.log(`Auto-lifted ${lifted.length} expired ban(s)`);
    }
  }
}
