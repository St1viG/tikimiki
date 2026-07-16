/**
 * Non-destructive top-up — one test member account with an active premium
 * subscription, for manually exercising premium-gated UI/flows.
 *
 *   pnpm --filter ./backend exec tsx src/db/seed-premium-test.ts
 *
 * Login: premium.test@tikimiki.dev / password123
 * Idempotent: bails if the account already exists.
 */
import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env";
import * as schema from "./schema";

const EMAIL = "premium.test@tikimiki.dev";

async function main() {
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });

  const [existing] = await db
    .select({ userId: schema.users.userId })
    .from(schema.users)
    .where(eq(schema.users.email, EMAIL))
    .limit(1);
  if (existing) {
    console.log("↩  Premium test account already exists — nothing to do.");
    await client.end();
    return;
  }

  const passwordHash = await hash("password123");

  const [user] = await db
    .insert(schema.users)
    .values({
      username: "premium_test",
      displayName: "Premium Test",
      email: EMAIL,
      passwordHash,
      isEmailVerified: true,
      bio: "Test nalog sa aktivnom premium pretplatom.",
    })
    .returning();

  await db.insert(schema.members).values({ userId: user.userId, points: 0 });

  const now = new Date();
  await db.insert(schema.subscriptions).values({
    userId: user.userId,
    plan: "premium",
    status: "active",
    startedAt: now,
    endsAt: new Date(now.getTime() + 365 * 86_400_000),
    cancelAtPeriodEnd: false,
  });

  console.log("✓  Created premium test account:");
  console.log(`   email:    ${EMAIL}`);
  console.log("   username: premium_test");
  console.log("   password: password123");

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
