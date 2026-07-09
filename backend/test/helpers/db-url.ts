/**
 * Connection-string helpers for the test database.
 *
 * The suite NEVER touches the development database: it derives a dedicated
 * `tikimiki_test` database from whatever base `DATABASE_URL` is configured and
 * `global-setup` drops + recreates that database on every run.
 */

/** Name of the disposable database the suite owns. */
export const TEST_DB_NAME = "tikimiki_test";

function baseUrl(): string {
  return process.env.DATABASE_URL ?? "postgres://tikimiki:tikimiki@localhost:5432/tikimiki";
}

function withDatabase(name: string): string {
  const url = new URL(baseUrl());
  url.pathname = `/${name}`;
  return url.toString();
}

/** Connection string for the isolated test database. */
export function testDbUrl(): string {
  return withDatabase(TEST_DB_NAME);
}

/**
 * A maintenance connection to the always-present `postgres` database, used
 * only to CREATE/DROP the test database — you cannot drop a database you are
 * currently connected to.
 */
export function maintenanceDbUrl(): string {
  return withDatabase("postgres");
}
