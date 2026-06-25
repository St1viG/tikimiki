/**
 * Non-destructive top-up #10 — typed channels on the ETF HackWeek server.
 *
 * Adds a `project` channel (predaja-projekta) to the OPŠTE group and a
 * `kanban` channel (moj-tim-board) to the TIMOVI group so the existing seeded
 * server exercises the new channel types end-to-end (cohor routes a `project`
 * channel to the submission surface and a `kanban` channel to the team board).
 *
 *   pnpm --filter ./backend exec tsx src/db/seed-extras10.ts
 *
 * Idempotent: bails if the ETF server already has a `project`-type channel.
 * New hackathons get these channels automatically (hackathons.service bootstrap).
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env";
import * as schema from "./schema";

async function main() {
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });

  const [etf] = await db
    .select({ hackathonId: schema.hackathons.hackathonId })
    .from(schema.hackathons)
    .where(eq(schema.hackathons.title, "ETF HackWeek 2026"))
    .limit(1);
  if (!etf) {
    console.log("✗  ETF hackathon not found — run db:seed first.");
    await client.end();
    return;
  }

  const [server] = await db
    .select({ serverId: schema.servers.serverId })
    .from(schema.servers)
    .where(eq(schema.servers.hackathonId, etf.hackathonId))
    .limit(1);
  if (!server) {
    console.log("✗  ETF server not found — run db:seed first.");
    await client.end();
    return;
  }
  const serverId = server.serverId;

  const groups = await db
    .select({ groupId: schema.channelGroups.groupId, name: schema.channelGroups.name })
    .from(schema.channelGroups)
    .where(eq(schema.channelGroups.serverId, serverId));
  const groupByName = new Map(groups.map((g) => [g.name, g.groupId]));
  const general = groupByName.get("OPŠTE");
  const teamsGroup = groupByName.get("TIMOVI");
  if (!general || !teamsGroup) {
    console.log("✗  ETF server is missing the OPŠTE / TIMOVI groups.");
    await client.end();
    return;
  }

  // Idempotency: bail if a project channel already exists on this server.
  const [already] = await db
    .select({ channelId: schema.channels.channelId })
    .from(schema.channels)
    .innerJoin(
      schema.channelGroups,
      eq(schema.channelGroups.groupId, schema.channels.groupId),
    )
    .where(
      and(
        eq(schema.channelGroups.serverId, serverId),
        eq(schema.channels.type, "project"),
        isNull(schema.channels.deletedAt),
      ),
    )
    .limit(1);
  if (already) {
    console.log("↩  ETF server already has a project channel — nothing to do.");
    await client.end();
    return;
  }

  const nextPosition = async (groupId: string) => {
    const [r] = await db
      .select({
        m: sql<number>`coalesce(max(${schema.channels.position}), -1)`,
      })
      .from(schema.channels)
      .where(
        and(
          eq(schema.channels.groupId, groupId),
          isNull(schema.channels.deletedAt),
        ),
      );
    return Number(r.m) + 1;
  };

  await db.insert(schema.channels).values({
    groupId: general,
    type: "project",
    name: "predaja-projekta",
    position: await nextPosition(general),
  });
  await db.insert(schema.channels).values({
    groupId: teamsGroup,
    type: "kanban",
    name: "moj-tim-board",
    position: await nextPosition(teamsGroup),
  });

  console.log(
    "✓  Added project (predaja-projekta) + kanban (moj-tim-board) channels to the ETF server.",
  );
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
