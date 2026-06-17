import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";
import { testDbUrl } from "./test/helpers/db-url";

/**
 * Full test suite (unit + integration). The integration specs boot the real
 * Nest application and talk to a live Postgres/PostGIS database, so this config
 * also wires the `global-setup` that (re)creates and migrates `tikimiki_test`.
 *
 * Run `pnpm db:up` (or otherwise have Postgres reachable on DATABASE_URL)
 * before `pnpm --filter ./backend test`. For the DB-free subset use
 * `pnpm --filter ./backend test:unit`.
 */
export default defineConfig({
  plugins: [
    // NestJS dependency injection relies on emitted decorator metadata
    // (`design:paramtypes`), which Vitest's default esbuild transform does NOT
    // produce — constructor injection of typed providers would fail. SWC with
    // legacy decorators + decoratorMetadata reproduces what `tsc` emits.
    swc.vite({
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts"],
    globalSetup: ["./test/setup/global-setup.ts"],
    // Every integration spec shares the one Postgres test database and isolates
    // via uniquely-named fixtures (not truncation). Run in a single fork with
    // no parallelism so concurrent writers can't race or deadlock.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    teardownTimeout: 20_000,
    // Applied to every test worker's process.env *before* any app module is
    // imported, so `config/env.ts` reads the test database + test JWT secrets.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDbUrl(),
      JWT_ACCESS_SECRET: "test-access-secret",
      JWT_REFRESH_SECRET: "test-refresh-secret",
    },
  },
});
