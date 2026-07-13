/**
 * Autor: Dimitrije Pesic (2023/0014)
 */
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  hackathonPrizes,
  hackathonRequiredSkills,
  hackathons,
  memberSkills,
  organizations,
  skills,
  users,
} from "../../src/db/schema";
import { SearchService } from "../../src/search/search.service";

type Row = Record<string, unknown>;

interface CapturedQuery {
  table: unknown;
  where: SQL | undefined;
  limit: number | undefined;
}

/**
 * Stands in for DrizzleDB: records every select chain (table, where, limit)
 * and resolves to the rows configured for that table. Subqueries embedded
 * into `inArray` without being awaited are still captured.
 */
function fakeDb(rowsByTable = new Map<unknown, Row[]>()) {
  const queries: CapturedQuery[] = [];
  const db = {
    select: () => {
      const captured: CapturedQuery = { table: undefined, where: undefined, limit: undefined };
      const rows = () => rowsByTable.get(captured.table) ?? [];
      const builder = {
        from(table: unknown) {
          captured.table = table;
          queries.push(captured);
          return builder;
        },
        where(condition: SQL | undefined) {
          captured.where = condition;
          return builder;
        },
        limit(count: number) {
          captured.limit = count;
          return Promise.resolve(rows());
        },
        // `resolveSkillIds` awaits its query without calling `.limit()`.
        then(onFulfilled?: (value: Row[]) => unknown, onRejected?: (reason: unknown) => unknown) {
          return Promise.resolve(rows()).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
  return { db, queries };
}

const dialect = new PgDialect();

/** Renders the captured `where` of the first query on `table` into SQL text + params. */
function whereFor(queries: CapturedQuery[], table: unknown) {
  const query = queries.find((entry) => entry.table === table);
  if (!query?.where) throw new Error("no where clause captured for the requested table");
  return dialect.sqlToQuery(query.where);
}

describe("SearchService (unit)", () => {
  describe("result mapping", () => {
    it("shapes rows uniformly and drops null subtitle/image fields", async () => {
      const rows = new Map<unknown, Row[]>([
        [users, [{ id: "u1", username: "ana", displayName: "Ana Anić", avatarUrl: null }]],
        [organizations, [{ id: "o1", name: "ETF", logoUrl: "/logo.png" }]],
        [hackathons, [{ id: "h1", title: "Hack", description: "Kratak opis", logoUrl: null }]],
      ]);
      const { db } = fakeDb(rows);

      const result = await new SearchService(db as never).search({ q: "ana" });

      expect(result.users).toEqual([
        { id: "u1", label: "ana", subtitle: "Ana Anić", imageUrl: undefined },
      ]);
      expect(result.organizations).toEqual([{ id: "o1", label: "ETF", imageUrl: "/logo.png" }]);
      expect(result.hackathons).toEqual([
        { id: "h1", label: "Hack", subtitle: "Kratak opis", imageUrl: undefined },
      ]);
    });

    it("truncates long hackathon descriptions to 140 chars with an ellipsis", async () => {
      const rows = new Map<unknown, Row[]>([
        [hackathons, [{ id: "h1", title: "Hack", description: "d".repeat(200), logoUrl: null }]],
      ]);
      const { db } = fakeDb(rows);

      const result = await new SearchService(db as never).search({ q: "hack" });

      expect(result.hackathons[0].subtitle).toBe(`${"d".repeat(139)}…`);
    });

    it("caps every entity query at 10 rows", async () => {
      const { db, queries } = fakeDb();

      await new SearchService(db as never).search({ q: "ana" });

      const limits = queries
        .filter((q) => q.table === users || q.table === organizations || q.table === hackathons)
        .map((q) => q.limit);
      expect(limits).toEqual([10, 10, 10]);
    });
  });

  describe("query conditions", () => {
    it("matches all three entities against the %q% pattern", async () => {
      const { db, queries } = fakeDb();

      await new SearchService(db as never).search({ q: "ana" });

      for (const table of [users, organizations, hackathons]) {
        const { sql: whereSql, params } = whereFor(queries, table);
        expect(whereSql).toContain("ilike");
        expect(params).toContain("%ana%");
      }
    });

    it("keeps soft-deleted users and hackathons out of the results", async () => {
      const { db, queries } = fakeDb();

      await new SearchService(db as never).search({ q: "ana" });

      expect(whereFor(queries, users).sql).toContain('"deleted_at" is null');
      expect(whereFor(queries, hackathons).sql).toContain('"deleted_at" is null');
    });

    it("returns only hackathons for a filter-only search", async () => {
      const { db, queries } = fakeDb();

      await new SearchService(db as never).search({ location: "Beograd" });

      expect(whereFor(queries, users).sql).toContain("false");
      expect(whereFor(queries, organizations).sql).toBe("false");
      const hackathonWhere = whereFor(queries, hackathons);
      expect(hackathonWhere.sql).toContain("ilike");
      expect(hackathonWhere.sql).not.toContain("false");
      expect(hackathonWhere.params).toContain("%Beograd%");
    });

    it("matches nothing anywhere when neither q nor filters are given", async () => {
      const { db, queries } = fakeDb();

      await new SearchService(db as never).search({});

      expect(whereFor(queries, users).sql).toContain("false");
      expect(whereFor(queries, organizations).sql).toBe("false");
      expect(whereFor(queries, hackathons).sql).toContain("false");
    });

    it("applies type and minPrize filters to hackathons only", async () => {
      const { db, queries } = fakeDb();

      await new SearchService(db as never).search({ type: "virtual", minPrize: 1000 });

      expect(whereFor(queries, users).sql).toContain("false");
      const hackathonWhere = whereFor(queries, hackathons);
      expect(hackathonWhere.sql).toContain('"type" =');
      expect(hackathonWhere.sql).not.toContain("false");
      expect(hackathonWhere.params).toContain("virtual");
      // The prize floor runs as a subquery over hackathon_prizes.
      const prizeWhere = whereFor(queries, hackathonPrizes);
      expect(prizeWhere.sql).toContain("regexp_replace");
      expect(prizeWhere.params).toContain(1000);
    });

    it("treats minPrize=0 as a real filter, not as absent", async () => {
      const { db, queries } = fakeDb();

      await new SearchService(db as never).search({ minPrize: 0 });

      expect(whereFor(queries, hackathonPrizes).params).toContain(0);
      expect(whereFor(queries, hackathons).sql).not.toContain("false");
    });
  });

  describe("skills filter", () => {
    const REACT_ID = "11111111-1111-4111-8111-111111111111";

    it("resolves skill names case-insensitively and skill UUIDs as ids", async () => {
      const rows = new Map<unknown, Row[]>([[skills, [{ id: "s1" }, { id: "s2" }]]]);
      const { db, queries } = fakeDb(rows);

      await new SearchService(db as never).search({ q: "ana", skills: ["React", REACT_ID] });

      const skillsWhere = whereFor(queries, skills);
      expect(skillsWhere.sql).toContain("lower");
      expect(skillsWhere.params).toContain("react");
      expect(skillsWhere.params).toContain(REACT_ID);
    });

    it("narrows users and hackathons through per-entity skill subqueries", async () => {
      const rows = new Map<unknown, Row[]>([[skills, [{ id: "s1" }, { id: "s2" }]]]);
      const { db, queries } = fakeDb(rows);

      await new SearchService(db as never).search({ skills: ["react"] });

      expect(whereFor(queries, memberSkills).params).toEqual(["s1", "s2"]);
      expect(whereFor(queries, hackathonRequiredSkills).params).toEqual(["s1", "s2"]);
      // A pure skills search still surfaces no organizations.
      expect(whereFor(queries, organizations).sql).toBe("false");
    });

    it("matches nothing when no skill resolves, instead of dropping the filter", async () => {
      const { db, queries } = fakeDb(); // skills lookup returns no rows

      await new SearchService(db as never).search({ q: "ana", skills: ["nepostojeći"] });

      expect(whereFor(queries, users).sql).toContain("false");
      expect(whereFor(queries, hackathons).sql).toContain("false");
      expect(queries.some((q) => q.table === memberSkills)).toBe(false);
    });

    it("skips the skill lookup entirely when the filter is absent", async () => {
      const { db, queries } = fakeDb();

      await new SearchService(db as never).search({ q: "ana" });

      expect(queries.some((q) => q.table === skills)).toBe(false);
    });
  });
});
