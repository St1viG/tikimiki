/**
 * Non-destructive top-up #6 — a GROUP direct-message conversation (3 members)
 * so the cohor DM member-list panel has content to show. Safe to re-run.
 *
 *   pnpm --filter ./backend exec tsx src/db/seed-extras6.ts
 *
 * Idempotent: bails if andrej already belongs to any 3+ member conversation.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env";
import * as schema from "./schema";

const ago = (mins: number) => new Date(Date.now() - mins * 60_000);

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
  const mohammed = await userByEmail("mohammed@tikimiki.dev");
  const nenad = await userByEmail("nenad@tikimiki.dev");
  if (!andrej || !mohammed || !nenad) {
    console.log("✗  Demo users not found — run db:seed first.");
    await client.end();
    return;
  }

  // Already in a 3+ member conversation?
  const andrejConvos = await db
    .select({ conversationId: schema.conversationMembers.conversationId })
    .from(schema.conversationMembers)
    .where(eq(schema.conversationMembers.userId, andrej));
  const convoIds = andrejConvos.map((c) => c.conversationId);
  if (convoIds.length > 0) {
    const counts = await db
      .select({
        conversationId: schema.conversationMembers.conversationId,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.conversationMembers)
      .where(inArray(schema.conversationMembers.conversationId, convoIds))
      .groupBy(schema.conversationMembers.conversationId);
    if (counts.some((c) => Number(c.n) >= 3)) {
      console.log("↩  Group DM already exists for andrej — nothing to do.");
      await client.end();
      return;
    }
  }

  // ── Create the group conversation ─────────────────────────────────
  const [conv] = await db.insert(schema.conversations).values({ createdBy: andrej }).returning();
  await db.insert(schema.conversationMembers).values([
    { conversationId: conv.conversationId, userId: andrej },
    { conversationId: conv.conversationId, userId: mohammed },
    { conversationId: conv.conversationId, userId: nenad },
  ]);

  const msgs = [
    { senderId: andrej, content: "Ekipa, otvaram grupu za demo dogovor 🚀", mins: 75 },
    { senderId: mohammed, content: "Top, ja sređujem frontend deo.", mins: 60 },
    { senderId: nenad, content: "Backend je spreman, baca ću build večeras.", mins: 30 },
  ];
  for (const m of msgs) {
    const [msg] = await db
      .insert(schema.messages)
      .values({ senderId: m.senderId, content: m.content, sentAt: ago(m.mins) })
      .returning({ messageId: schema.messages.messageId });
    await db
      .insert(schema.directMessages)
      .values({ messageId: msg.messageId, conversationId: conv.conversationId });
  }

  console.log("✓  Created a group DM (andrej, mohammed, nenad) with 3 messages.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
