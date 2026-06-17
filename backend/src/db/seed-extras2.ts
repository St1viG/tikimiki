/**
 * Non-destructive top-up #2 — data for the voting window, admin audit log,
 * and ban appeals. Safe to run on an already-seeded DB.
 *
 *   pnpm --filter ./backend exec tsx src/db/seed-extras2.ts
 *
 * Idempotent: bails if the demo "spammer" user already exists.
 */
import { hash } from "@node-rs/argon2";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env";
import * as schema from "./schema";

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

  const adminId = await userByEmail("admin@tikimiki.dev");
  const orgId = await userByEmail("org@tikimiki.dev");
  if (!adminId) {
    console.log("✗  Admin not found — run db:seed first.");
    await client.end();
    return;
  }

  if (await userByEmail("spammer@tikimiki.dev")) {
    console.log("↩  seed-extras2 already applied — nothing to do.");
    await client.end();
    return;
  }

  // ── Voting window: open ETF voting now → +24h ──────────────────────
  const [etf] = await db
    .select({ hackathonId: schema.hackathons.hackathonId })
    .from(schema.hackathons)
    .where(eq(schema.hackathons.title, "ETF HackWeek 2026"))
    .limit(1);
  if (etf) {
    await db
      .update(schema.hackathons)
      .set({
        votingOpensAt: new Date(Date.now() - 60 * 60_000),
        votingClosesAt: new Date(Date.now() + 24 * 60 * 60_000),
      })
      .where(eq(schema.hackathons.hackathonId, etf.hackathonId));
  }

  // ── A banned demo user + a pending appeal (for the appeals tab) ────
  const password = await hash("password123");
  const [spammer] = await db
    .insert(schema.users)
    .values({
      username: "spammer",
      email: "spammer@tikimiki.dev",
      passwordHash: password,
      isEmailVerified: true,
      bio: "Demo account used to showcase moderation.",
    })
    .returning();
  await db.insert(schema.members).values({ userId: spammer.userId });

  const [ban] = await db
    .insert(schema.userBans)
    .values({
      userId: spammer.userId,
      bannedBy: adminId,
      reason: "Repeated spam in channels.",
    })
    .returning();

  await db.insert(schema.appeals).values({
    userId: spammer.userId,
    banId: ban.banId,
    reason:
      "I believe the ban was a mistake — the links I posted were to our team's own project, not spam. Please reconsider.",
    status: "pending",
  });

  // ── A few audit-log entries so the tab is populated ───────────────
  await db.insert(schema.auditLog).values([
    {
      actorId: adminId,
      action: "user.ban",
      targetType: "user",
      targetId: spammer.userId,
      summary: "Banned user: Repeated spam in channels.",
    },
    ...(orgId
      ? [
          {
            actorId: adminId,
            action: "org.verify",
            targetType: "organization" as const,
            targetId: orgId,
            summary: 'Verified organization "ETF HackWeek"',
          },
        ]
      : []),
  ]);

  console.log(
    "✓  Set ETF voting window (open), added a banned user + pending appeal + audit entries.",
  );
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
