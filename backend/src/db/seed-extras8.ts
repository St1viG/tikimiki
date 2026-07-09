/**
 * Non-destructive top-up #8 — make sure andrej has a couple of genuinely
 * UNREAD direct-message threads (recent messages FROM other people that andrej
 * has not read) so the Cohor card's "two newest unread chats" and the unread
 * badges have something to show. Safe to re-run.
 *
 *   pnpm --filter ./backend exec tsx src/db/seed-extras8.ts
 *
 * Idempotent: each marker message is only inserted if it is not already the
 * conversation's content; andrej's last_read_at is cleared in those threads.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
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

  /** Find an existing 1:1 conversation between andrej and `other`, or create one. */
  const findOrCreate1to1 = async (other: string): Promise<string> => {
    const mine = await db
      .select({ conversationId: schema.conversationMembers.conversationId })
      .from(schema.conversationMembers)
      .where(eq(schema.conversationMembers.userId, andrej));
    const myIds = mine.map((m) => m.conversationId);
    if (myIds.length > 0) {
      const shared = await db
        .select({
          conversationId: schema.conversationMembers.conversationId,
          n: sql<number>`count(*)::int`,
        })
        .from(schema.conversationMembers)
        .where(inArray(schema.conversationMembers.conversationId, myIds))
        .groupBy(schema.conversationMembers.conversationId);
      const twoMember = shared.filter((s) => Number(s.n) === 2).map((s) => s.conversationId);
      if (twoMember.length > 0) {
        const withOther = await db
          .select({ conversationId: schema.conversationMembers.conversationId })
          .from(schema.conversationMembers)
          .where(
            and(
              inArray(schema.conversationMembers.conversationId, twoMember),
              eq(schema.conversationMembers.userId, other),
            ),
          )
          .limit(1);
        if (withOther[0]) return withOther[0].conversationId;
      }
    }
    const [conv] = await db.insert(schema.conversations).values({ createdBy: andrej }).returning();
    await db.insert(schema.conversationMembers).values([
      { conversationId: conv.conversationId, userId: andrej },
      { conversationId: conv.conversationId, userId: other },
    ]);
    return conv.conversationId;
  };

  const threads: { other: string; content: string; mins: number }[] = [
    { other: mohammed, content: "Jesi video novi raspored za demo? 👀", mins: 8 },
    { other: nenad, content: "Push-ovao sam backend, probaj sad 🙌", mins: 3 },
  ];

  let added = 0;
  for (const th of threads) {
    const convId = await findOrCreate1to1(th.other);

    // Already the latest message? then skip inserting a duplicate.
    const [last] = await db
      .select({ content: schema.messages.content })
      .from(schema.directMessages)
      .innerJoin(schema.messages, eq(schema.directMessages.messageId, schema.messages.messageId))
      .where(eq(schema.directMessages.conversationId, convId))
      .orderBy(sql`${schema.messages.sentAt} desc`)
      .limit(1);

    if (!last || last.content !== th.content) {
      const [msg] = await db
        .insert(schema.messages)
        .values({ senderId: th.other, content: th.content, sentAt: ago(th.mins) })
        .returning({ messageId: schema.messages.messageId });
      await db
        .insert(schema.directMessages)
        .values({ messageId: msg.messageId, conversationId: convId });
      added++;
    }

    // Ensure andrej sees it as unread: clear his last_read_at in this thread.
    await db
      .update(schema.conversationMembers)
      .set({ lastReadAt: null })
      .where(
        and(
          eq(schema.conversationMembers.conversationId, convId),
          eq(schema.conversationMembers.userId, andrej),
        ),
      );
  }

  console.log(`✓  Unread DM threads ensured for andrej (+${added} new messages).`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
