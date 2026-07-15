/**
 * Periodic sweep that keeps hackathon `status` in step with the clock:
 * "upcoming" events whose `startsAt` has passed go live, and "ongoing"
 * events whose `endsAt` has passed are closed. `status` is otherwise only
 * ever moved by the organizer (see `HackathonsService.updateStatus`), so
 * without this an event would never start nor stop on its own.
 *
 * Autor: Dimitrije Pesic (2023/0014)
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { and, eq, gt, isNull, lte } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { hackathons } from "../db/schema";

@Injectable()
export class HackathonsStatusScheduler {
  private readonly logger = new Logger(HackathonsStatusScheduler.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async syncHackathonStatuses(): Promise<void> {
    const now = new Date();

    // upcoming → ongoing once startsAt passes (and the event is still running).
    const started = await this.db
      .update(hackathons)
      .set({ status: "ongoing", updatedAt: now })
      .where(
        and(
          eq(hackathons.status, "upcoming"),
          lte(hackathons.startsAt, now),
          gt(hackathons.endsAt, now),
          isNull(hackathons.deletedAt),
        ),
      )
      .returning({ hackathonId: hackathons.hackathonId });

    // ongoing → finished once endsAt passes. An "upcoming" event whose whole
    // window already elapsed (never went live) is closed in the same sweep.
    const finished = await this.db
      .update(hackathons)
      .set({ status: "finished", updatedAt: now })
      .where(
        and(
          lte(hackathons.endsAt, now),
          isNull(hackathons.deletedAt),
          eq(hackathons.status, "ongoing"),
        ),
      )
      .returning({ hackathonId: hackathons.hackathonId });

    const expired = await this.db
      .update(hackathons)
      .set({ status: "finished", updatedAt: now })
      .where(
        and(
          lte(hackathons.endsAt, now),
          isNull(hackathons.deletedAt),
          eq(hackathons.status, "upcoming"),
        ),
      )
      .returning({ hackathonId: hackathons.hackathonId });

    if (started.length > 0) {
      this.logger.log(`Auto-started ${started.length} hackathon(s) past their startsAt`);
    }
    if (finished.length + expired.length > 0) {
      this.logger.log(
        `Auto-finished ${finished.length + expired.length} hackathon(s) past their endsAt`,
      );
    }
  }
}
