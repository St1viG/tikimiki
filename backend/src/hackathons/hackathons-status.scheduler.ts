/**
 * Periodic sweep that auto-finishes hackathons: `status` is otherwise only
 * ever moved by the organizer (see `HackathonsService.updateStatus`), so an
 * "ongoing" hackathon whose `endsAt` has passed would stay live forever
 * unless someone remembers to close it by hand.
 *
 * Autor: Dimitrije Pesic (2023/0014)
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { and, eq, isNull, lte } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { hackathons } from "../db/schema";

@Injectable()
export class HackathonsStatusScheduler {
  private readonly logger = new Logger(HackathonsStatusScheduler.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async finishExpiredHackathons(): Promise<void> {
    const finished = await this.db
      .update(hackathons)
      .set({ status: "finished", updatedAt: new Date() })
      .where(
        and(
          eq(hackathons.status, "ongoing"),
          lte(hackathons.endsAt, new Date()),
          isNull(hackathons.deletedAt),
        ),
      )
      .returning({ hackathonId: hackathons.hackathonId });

    if (finished.length > 0) {
      this.logger.log(`Auto-finished ${finished.length} hackathon(s) past their endsAt`);
    }
  }
}
