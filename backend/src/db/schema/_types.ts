import { customType } from "drizzle-orm/pg-core";

/**
 * PostGIS `geography(Point, 4326)` column type.
 *
 * Stored/returned as text (WKT/EWKT, e.g. "POINT(20.45 44.81)" or the EWKB hex
 * Postgres emits). Use PostGIS functions (`ST_MakePoint`, `ST_DWithin`, …) in
 * queries via `sql\`...\``. Requires the `postgis` extension (created in the
 * migration; the postgis/postgis Docker image ships it).
 *
 * ⚠️ drizzle-kit quirk: it emits this parameterized type quoted —
 * `"geography(Point,4326)"` — which Postgres rejects. After every
 * `drizzle-kit generate` that touches this column, unquote it in the migration
 * (→ `geography(Point,4326)`) and ensure `CREATE EXTENSION IF NOT EXISTS postgis;`
 * runs first. Already applied to drizzle/0000_init_full_schema.sql.
 */
export const geographyPoint = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return "geography(Point,4326)";
  },
});
