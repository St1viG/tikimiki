/**
 * Non-destructive top-up #4 — messages in the #najave and #tim-digitalci
 * channels (only #opšte was seeded before), so the chat (and the right-click
 * context menu) has content in every channel. Safe to re-run.
 *
 *   pnpm --filter ./backend exec tsx src/db/seed-extras4.ts
 *
 * Idempotent: bails if #najave already has messages.
 */
import { and, eq } from "drizzle-orm";
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
  const channelByName = async (name: string) => {
    const [c] = await db
      .select({ channelId: schema.channels.channelId })
      .from(schema.channels)
      .where(eq(schema.channels.name, name))
      .limit(1);
    return c?.channelId;
  };

  const najave = await channelByName("najave");
  const teamCh = await channelByName("tim-digitalci");
  const orgId = await userByEmail("org@tikimiki.dev");
  const andrej = await userByEmail("andrej@tikimiki.dev");
  const mohammed = await userByEmail("mohammed@tikimiki.dev");
  if (!najave || !teamCh || !orgId || !andrej || !mohammed) {
    console.log("✗  Channels/users not found — run db:seed first.");
    await client.end();
    return;
  }

  const existing = await db
    .select({ messageId: schema.channelMessages.messageId })
    .from(schema.channelMessages)
    .where(eq(schema.channelMessages.channelId, najave))
    .limit(1);
  if (existing.length > 0) {
    console.log("↩  Channels already have messages — nothing to do.");
    await client.end();
    return;
  }

  const seed = [
    { channelId: najave, senderId: orgId, content: "Dobrodošli na ETF HackWeek 2026! 🎉 Sva važna obaveštenja stižu ovde.", mins: 240 },
    { channelId: najave, senderId: orgId, content: "Predaja projekata je do nedelje 18h. Ne zaboravite video prezentaciju.", mins: 120 },
    { channelId: najave, senderId: orgId, content: "Glasanje publike otvara se u poslednja 2 sata. Sponzorski bounty-ji su aktivni!", mins: 30 },
    { channelId: teamCh, senderId: andrej, content: "Ekipa, podelimo taskove — ja uzimam backend.", mins: 200 },
    { channelId: teamCh, senderId: mohammed, content: "Ja radim frontend i dizajn. Push-ujem skicu večeras.", mins: 180 },
    { channelId: teamCh, senderId: andrej, content: "Top. Demo snimamo sutra ujutru.", mins: 60 },
  ];

  for (const m of seed) {
    const [msg] = await db
      .insert(schema.messages)
      .values({ senderId: m.senderId, content: m.content, sentAt: ago(m.mins) })
      .returning();
    await db
      .insert(schema.channelMessages)
      .values({ messageId: msg.messageId, channelId: m.channelId });
  }

  console.log("✓  Added messages to #najave and #tim-digitalci.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
