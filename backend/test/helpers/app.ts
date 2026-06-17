import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { AppModule } from "../../src/app.module";
import { DRIZZLE, type DrizzleDB } from "../../src/db/db.module";

/**
 * Boot a full Nest application wired exactly like `main.ts` (global `api/v1`
 * prefix + cookie parser) but without binding a network port. Supertest drives
 * it through the in-memory HTTP server returned by `app.getHttpServer()`.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api/v1");
  app.use(cookieParser());
  await app.init();
  return app;
}

/** The Drizzle handle from a running test app — for fixture seeding and direct
 *  state assertions. */
export function dbOf(app: INestApplication): DrizzleDB {
  return app.get<DrizzleDB>(DRIZZLE);
}

/**
 * Tear an app down AND close its Postgres pool. `DbModule` never registers an
 * `onModuleDestroy` to end the postgres-js client, so `app.close()` alone
 * leaks the connection pool and Vitest hangs on the open handles at exit.
 */
export async function closeTestApp(app: INestApplication): Promise<void> {
  const db = dbOf(app);
  await app.close();
  const client = (
    db as unknown as { $client?: { end?: (opts?: unknown) => Promise<void> } }
  ).$client;
  if (client?.end) {
    await client.end({ timeout: 5 });
  }
}
