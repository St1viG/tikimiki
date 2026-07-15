/**
 * Autor: Dimitrije Pesic (2023/0014)
 */
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { HackathonsStatusScheduler } from "../../src/hackathons/hackathons-status.scheduler";

type Row = Record<string, unknown>;

interface CapturedUpdate {
  values: Row;
  where: SQL | undefined;
}

/** Stands in for DrizzleDB: captures every `update().set().where().returning()` call. */
function fakeDb(returningRows: Row[] = []) {
  const updates: CapturedUpdate[] = [];
  const db = {
    update: () => ({
      set(values: Row) {
        return {
          where(condition: SQL | undefined) {
            return {
              returning() {
                updates.push({ values, where: condition });
                return Promise.resolve(returningRows);
              },
            };
          },
        };
      },
    }),
  };
  return { db, updates };
}

const dialect = new PgDialect();

describe("HackathonsStatusScheduler (unit)", () => {
  it("starts due upcoming hackathons and finishes expired ones in one sweep", async () => {
    const { db, updates } = fakeDb([{ hackathonId: "h1" }]);
    const scheduler = new HackathonsStatusScheduler(db as never);

    await scheduler.syncHackathonStatuses();

    // One update per transition: upcoming→ongoing, ongoing→finished, and the
    // stale upcoming→finished backstop.
    expect(updates).toHaveLength(3);

    const [started, finished, expired] = updates;

    expect(started.values).toMatchObject({ status: "ongoing" });
    expect(started.values.updatedAt).toBeInstanceOf(Date);
    const startedSql = dialect.sqlToQuery(started.where!).sql;
    expect(startedSql).toContain('"status" =');
    expect(startedSql).toContain('"starts_at" <=');
    expect(startedSql).toContain('"ends_at" >');
    expect(startedSql).toContain('"deleted_at" is null');

    for (const u of [finished, expired]) {
      expect(u.values).toMatchObject({ status: "finished" });
      expect(u.values.updatedAt).toBeInstanceOf(Date);
      const { sql } = dialect.sqlToQuery(u.where!);
      expect(sql).toContain('"status" =');
      expect(sql).toContain('"ends_at" <=');
      expect(sql).toContain('"deleted_at" is null');
    }
  });

  it("still issues the sweep (a no-op update) when nothing is due", async () => {
    const { db, updates } = fakeDb([]);
    const scheduler = new HackathonsStatusScheduler(db as never);

    await scheduler.syncHackathonStatuses();

    expect(updates).toHaveLength(3);
  });
});
