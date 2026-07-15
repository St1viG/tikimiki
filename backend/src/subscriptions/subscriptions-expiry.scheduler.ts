/**
 * Periodic sweep that keeps subscription `status` in step with the clock.
 * Cancelling Premium only flags the row (`cancelAtPeriodEnd`) so the member
 * keeps access until `endsAt`; once the paid period lapses this cron performs
 * the actual transition: flagged rows become "cancelled" (stamping
 * `cancelledAt`), un-flagged lapsed rows become "expired". Access itself is
 * already revoked by `isPremium()` (which requires `endsAt` in the future),
 * so the sweep is bookkeeping — but without it a row would stay "active"
 * forever.
 *
 * Autor: Dimitrije Pesic (2023/0014)
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { and, eq, lte } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { subscriptions } from "../db/schema";

@Injectable()
export class SubscriptionsExpiryScheduler {
  private readonly logger = new Logger(SubscriptionsExpiryScheduler.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expireLapsedSubscriptions(): Promise<void> {
    const now = new Date();

    // Cancel-at-period-end subscriptions whose period has lapsed → cancelled.
    const cancelled = await this.db
      .update(subscriptions)
      .set({ status: "cancelled", cancelledAt: now })
      .where(
        and(
          eq(subscriptions.status, "active"),
          eq(subscriptions.cancelAtPeriodEnd, true),
          lte(subscriptions.endsAt, now),
        ),
      )
      .returning({ subscriptionId: subscriptions.subscriptionId });

    // Lapsed subscriptions that were never cancelled → expired. (There is no
    // real payment gateway, so nothing can be charged for a renewal.)
    const expired = await this.db
      .update(subscriptions)
      .set({ status: "expired" })
      .where(
        and(
          eq(subscriptions.status, "active"),
          eq(subscriptions.cancelAtPeriodEnd, false),
          lte(subscriptions.endsAt, now),
        ),
      )
      .returning({ subscriptionId: subscriptions.subscriptionId });

    if (cancelled.length > 0) {
      this.logger.log(`Closed ${cancelled.length} cancelled subscription(s) past their endsAt`);
    }
    if (expired.length > 0) {
      this.logger.log(`Expired ${expired.length} subscription(s) past their endsAt`);
    }
  }
}
