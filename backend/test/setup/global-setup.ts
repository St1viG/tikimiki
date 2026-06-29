import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { TEST_DB_NAME, maintenanceDbUrl, testDbUrl } from "../helpers/db-url";

/** Locate the drizzle migrations folder regardless of the process cwd. */
function migrationsFolder(): string {
  const candidates = [
    resolve(process.cwd(), "drizzle"),
    resolve(process.cwd(), "backend", "drizzle"),
    resolve(__dirname, "..", "..", "drizzle"),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      `Could not locate the drizzle migrations folder (looked in: ${candidates.join(", ")})`,
    );
  }
  return found;
}

/**
 * Vitest global setup — runs once before the whole suite.
 *
 * Drops any leftover `tikimiki_test` database, creates a pristine one, and
 * applies every migration to it. Replaying the real migration files (rather
 * than a schema dump) means each test run also continuously verifies that the
 * migrations apply cleanly from scratch on PostGIS.
 */
export async function setup(): Promise<void> {
  const admin = postgres(maintenanceDbUrl(), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE "${TEST_DB_NAME}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }

  const client = postgres(testDbUrl(), { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: migrationsFolder() });
  } finally {
    await client.end({ timeout: 5 });
  }
}
