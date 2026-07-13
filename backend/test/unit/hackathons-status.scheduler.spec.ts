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

/** Stands in for DrizzleDB: captures the single `update().set().where().returning()` call. */
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
  it("flips ongoing hackathons past their endsAt to finished", async () => {
    const { db, updates } = fakeDb([{ hackathonId: "h1" }]);
    const scheduler = new HackathonsStatusScheduler(db as never);

    await scheduler.finishExpiredHackathons();

    expect(updates).toHaveLength(1);
    expect(updates[0].values).toMatchObject({ status: "finished" });
    expect(updates[0].values.updatedAt).toBeInstanceOf(Date);

    const { sql } = dialect.sqlToQuery(updates[0].where!);
    expect(sql).toContain('"status" =');
    expect(sql).toContain('"ends_at" <=');
    expect(sql).toContain('"deleted_at" is null');
  });

  it("still issues the sweep (a no-op update) when nothing is due", async () => {
    const { db, updates } = fakeDb([]);
    const scheduler = new HackathonsStatusScheduler(db as never);

    await scheduler.finishExpiredHackathons();

    expect(updates).toHaveLength(1);
  });
});
