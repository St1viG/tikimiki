import { Controller, Get, Inject } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";

@Controller("health")
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  @Get()
  async check() {
    let db = false;
    try {
      await this.db.execute(sql`select 1`);
      db = true;
    } catch {
      db = false;
    }
    return { status: db ? "ok" : "degraded", db, ts: new Date().toISOString() };
  }
}
