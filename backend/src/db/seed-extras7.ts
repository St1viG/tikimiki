/**
 * Non-destructive top-up #7 — give andrej a few accepted friendships so the
 * Cohor "home" view friends section is populated. Safe to re-run.
 *
 *   pnpm --filter ./backend exec tsx src/db/seed-extras7.ts
 *
 * Idempotent: each friendship is inserted with onConflictDoNothing on the
 * canonical (user_id_a, user_id_b) unique pair.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env";
import * as schema from "./schema";

const ago = (mins: number) => new Date(Date.now() - mins * 60_000);

/** friendships enforce user_id_a < user_id_b (canonical order). */
function ordered(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function main() {
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });

  const userByEmail = async (email: string) => {
    const [u] = await db
      .select({ userId: schema.users.userId })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    return u?.userId;
  };

  const andrej = await userByEmail("andrej@tikimiki.dev");
  const friends = await Promise.all(
    ["nenad", "mara", "fenjer"].map((n) => userByEmail(`${n}@tikimiki.dev`)),
  );
  if (!andrej || friends.some((f) => !f)) {
    console.log("✗  Demo users not found — run db:seed first.");
    await client.end();
    return;
  }

  let added = 0;
  for (const friend of friends) {
    const [a, b] = ordered(andrej, friend as string);
    const res = await db
      .insert(schema.friendships)
      .values({
        userIdA: a,
        userIdB: b,
        requesterId: andrej,
        status: "accepted",
        respondedAt: ago(500),
      })
      .onConflictDoNothing()
      .returning({ userIdA: schema.friendships.userIdA });
    added += res.length;
  }

  console.log(`✓  Friendships ensured for andrej (+${added} new; nenad, mara, fenjer).`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
