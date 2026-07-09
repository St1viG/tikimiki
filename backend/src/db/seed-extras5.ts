/**
 * Non-destructive top-up #5 — role-based server membership.
 *
 * Access to a cohor server is now gated by holding a role in it (server_roles +
 * user_roles), NOT by application status. This seeds memberships for the ETF
 * server and adds a SECOND server (Garaža) with a DIFFERENT member set, so each
 * user only sees the servers they belong to.
 *
 *   pnpm --filter ./backend exec tsx src/db/seed-extras5.ts
 *
 * Idempotent: bails if the ETF server already has a "Participant" role.
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
  const hackathonByTitle = async (title: string) => {
    const [h] = await db
      .select({ hackathonId: schema.hackathons.hackathonId })
      .from(schema.hackathons)
      .where(eq(schema.hackathons.title, title))
      .limit(1);
    return h?.hackathonId;
  };
  const serverForHackathon = async (hackathonId: string) => {
    const [s] = await db
      .select({ serverId: schema.servers.serverId })
      .from(schema.servers)
      .where(eq(schema.servers.hackathonId, hackathonId))
      .limit(1);
    return s?.serverId;
  };
  const ensureRole = async (serverId: string, name: string) => {
    const [existing] = await db
      .select({ serverRoleId: schema.serverRoles.serverRoleId })
      .from(schema.serverRoles)
      .where(and(eq(schema.serverRoles.serverId, serverId), eq(schema.serverRoles.name, name)))
      .limit(1);
    if (existing) return existing.serverRoleId;
    const [created] = await db
      .insert(schema.serverRoles)
      .values({ serverId, name })
      .returning({ serverRoleId: schema.serverRoles.serverRoleId });
    return created.serverRoleId;
  };
  const assign = async (serverRoleId: string, userId: string) =>
    db.insert(schema.userRoles).values({ serverRoleId, userId }).onConflictDoNothing();

  const etf = await hackathonByTitle("ETF HackWeek 2026");
  const garaza = await hackathonByTitle("Garaža Hackathon 2026");
  const etfServer = etf ? await serverForHackathon(etf) : undefined;
  if (!etf || !garaza || !etfServer) {
    console.log("✗  ETF hackathon/server or Garaža not found — run db:seed first.");
    await client.end();
    return;
  }

  // Idempotency guard.
  const [already] = await db
    .select({ serverRoleId: schema.serverRoles.serverRoleId })
    .from(schema.serverRoles)
    .where(
      and(eq(schema.serverRoles.serverId, etfServer), eq(schema.serverRoles.name, "Participant")),
    )
    .limit(1);
  if (already) {
    console.log("↩  Server memberships already seeded — nothing to do.");
    await client.end();
    return;
  }

  const andrej = await userByEmail("andrej@tikimiki.dev");
  const mohammed = await userByEmail("mohammed@tikimiki.dev");
  const nenad = await userByEmail("nenad@tikimiki.dev");
  const mara = await userByEmail("mara@tikimiki.dev");
  const fenjer = await userByEmail("fenjer@tikimiki.dev");
  if (!andrej || !mohammed || !nenad || !mara || !fenjer) {
    console.log("✗  Demo users not found.");
    await client.end();
    return;
  }

  // ── ETF membership: andrej, mohammed, nenad, mara, fenjer ──────────
  const etfRole = await ensureRole(etfServer, "Participant");
  for (const u of [andrej, mohammed, nenad, mara, fenjer]) {
    await assign(etfRole, u);
  }

  // ── A SECOND server (Garaža) — members: mara + fenjer only ─────────
  let garazaServer = await serverForHackathon(garaza);
  if (!garazaServer) {
    const [srv] = await db
      .insert(schema.servers)
      .values({ hackathonId: garaza, name: "Garaža Hackathon 2026" })
      .returning({ serverId: schema.servers.serverId });
    garazaServer = srv.serverId;

    const [grp] = await db
      .insert(schema.channelGroups)
      .values({ serverId: garazaServer, name: "OPŠTE", position: 0 })
      .returning({ groupId: schema.channelGroups.groupId });
    const [opste] = await db
      .insert(schema.channels)
      .values({
        groupId: grp.groupId,
        type: "general",
        name: "opšte",
        position: 0,
      })
      .returning({ channelId: schema.channels.channelId });

    const msgs = [
      { senderId: mara, content: "Dobrodošli na Garaža Hackathon! 🚗", mins: 90 },
      { senderId: fenjer, content: "Spremni za 48h kodiranja 😎", mins: 45 },
    ];
    for (const m of msgs) {
      const [msg] = await db
        .insert(schema.messages)
        .values({ senderId: m.senderId, content: m.content, sentAt: ago(m.mins) })
        .returning({ messageId: schema.messages.messageId });
      await db
        .insert(schema.channelMessages)
        .values({ messageId: msg.messageId, channelId: opste.channelId });
    }
  }
  const garazaRole = await ensureRole(garazaServer, "Participant");
  for (const u of [mara, fenjer]) {
    await assign(garazaRole, u);
  }

  console.log(
    "✓  ETF members: andrej, mohammed, nenad, mara, fenjer. Garaža server (+channel/msgs) members: mara, fenjer. andrej does NOT see Garaža.",
  );
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
