# Backend tests

Automated tests for the tikimiki API. Two layers:

- **`test/unit/`** — pure-logic specs (Zod validation schemas, …). No database,
  no Nest app. Fast; runnable anywhere.
- **`test/integration/`** — boot the **real** Nest application and drive it over
  HTTP (supertest) against a **live Postgres + PostGIS**. These exercise the
  actual SQL, authorization guards, DB constraints, and transactions — the
  parts that earlier slipped past one-off manual smoke tests.

## Running

```bash
# 1. Start Postgres (and Redis) — postgis/postgis:16-3.4 from docker-compose.
pnpm db:up

# 2a. Everything (unit + integration). Needs the DB from step 1.
pnpm --filter ./backend test

# 2b. Just the DB-free unit subset (no Postgres required).
pnpm --filter ./backend test:unit

# Watch mode while developing.
pnpm --filter ./backend test:watch
```

CI runs the full suite on every push/PR against a Postgres service container
(see `.github/workflows/ci.yml`).

## How it works

- **Dedicated database.** `test/setup/global-setup.ts` derives a
  `tikimiki_test` database from `DATABASE_URL`, **drops and recreates** it, then
  applies every migration in `drizzle/`. The dev database is never touched.
  Replaying the real migrations also continuously verifies they apply cleanly
  from scratch on PostGIS.
- **Test app.** `test/helpers/app.ts#createTestApp` builds the full `AppModule`
  exactly like `main.ts` (global `api/v1` prefix + cookie parser) but without
  binding a port; supertest drives `app.getHttpServer()`. `closeTestApp` also
  ends the Postgres pool so Vitest doesn't hang on open handles.
- **Isolation.** One Postgres database shared by all specs, run single-fork and
  serially (see `vitest.config.ts`). Specs don't truncate — they create
  **uniquely-named** fixtures (`test/helpers/factories.ts#uniqueId`) and assert
  only on their own data, so they never collide.
- **Decorator metadata.** NestJS dependency injection needs emitted
  `design:paramtypes` metadata, which Vitest's default esbuild transform does
  **not** produce. The configs use `unplugin-swc` with
  `legacyDecorator + decoratorMetadata` so constructor injection works.

## Adding a test

```ts
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTestApp, createTestApp } from "../helpers/app";
import { registerMember } from "../helpers/factories";

describe("my feature (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(app);
  });

  it("does the thing", async () => {
    const user = await registerMember(app);
    await request(app.getHttpServer())
      .get("/api/v1/some/route")
      .set("Authorization", `Bearer ${user.token}`)
      .expect(200);
  });
});
```

Use the factories (`registerMember`, `registerOrganization`, `makeAdmin`,
`createHackathon`, `createTeam`, `createProject`, …) to set up prerequisites,
and `dbOf(app)` for direct seeding or state assertions.
