/**
 * Non-destructive top-up #3 — sponsor bounties (+prizes), a couple of bounty
 * applications, and a published overall podium for ETF HackWeek. Safe to re-run.
 *
 *   pnpm --filter ./backend exec tsx src/db/seed-extras3.ts
 *
 * Idempotent: bails if ETF already has bounties.
 */
import { and, eq, isNull } from "drizzle-orm";
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

  const existing = await db
    .select({ bountyId: schema.bounties.bountyId })
    .from(schema.bounties)
    .where(eq(schema.bounties.hackathonId, etf.hackathonId))
    .limit(1);
  if (existing.length > 0) {
    console.log("↩  Bounties already present — nothing to do.");
    await client.end();
    return;
  }

  const projectForTeam = async (teamName: string) => {
    const [row] = await db
      .select({ projectId: schema.projects.projectId })
      .from(schema.projects)
      .innerJoin(schema.teams, eq(schema.teams.teamId, schema.projects.teamId))
      .where(
        and(
          eq(schema.teams.name, teamName),
          eq(schema.teams.hackathonId, etf.hackathonId),
          isNull(schema.projects.deletedAt),
        ),
      )
      .limit(1);
    return row?.projectId;
  };
  const projDigitalci = await projectForTeam("digitalci");
  const projNullptr = await projectForTeam("nullptr");

  // ── Bounties + their prizes ────────────────────────────────────────
  const bountySeed = [
    {
      sponsorName: "Logitech",
      title: "Best user interface & UX",
      theme: "Design",
      description:
        "Rewards the team with the most intuitive, accessible and carefully designed user experience.",
      award: "$500 · Gaming Gear bundle",
    },
    {
      sponsorName: "Anthropic",
      title: "Most responsible use of AI",
      theme: "AI",
      description: "For the most mature, transparent and safe integration of AI into a solution.",
      award: "$1000 · Claude API credits (1 yr.)",
    },
    {
      sponsorName: "JetBrains",
      title: "Cleanest and most maintainable code",
      theme: "Engineering",
      description: "Values readable, well-tested, well-documented code and sound architecture.",
      award: "$2000 · JetBrains All Products Pack (1 yr.)",
    },
  ];

  const bountyIds: string[] = [];
  for (const b of bountySeed) {
    const [row] = await db
      .insert(schema.bounties)
      .values({
        hackathonId: etf.hackathonId,
        sponsorName: b.sponsorName,
        title: b.title,
        theme: b.theme,
        description: b.description,
      })
      .returning({ bountyId: schema.bounties.bountyId });
    bountyIds.push(row.bountyId);
    await db.insert(schema.hackathonPrizes).values({
      hackathonId: etf.hackathonId,
      bountyId: row.bountyId,
      sponsorName: b.sponsorName,
      title: b.title,
      description: b.description,
      awardValue: b.award,
    });
  }

  // ── A few bounty applications ──────────────────────────────────────
  if (projDigitalci && projNullptr) {
    await db.insert(schema.bountySubmissions).values([
      { bountyId: bountyIds[0], projectId: projDigitalci }, // Logitech ← digitalci
      { bountyId: bountyIds[1], projectId: projDigitalci }, // Anthropic ← digitalci
      { bountyId: bountyIds[2], projectId: projNullptr }, // JetBrains ← nullptr
    ]);

    // ── Published overall podium ─────────────────────────────────────
    await db.insert(schema.hackathonResults).values([
      { projectId: projDigitalci, rank: 1 },
      { projectId: projNullptr, rank: 2 },
    ]);
  }

  console.log(
    `✓  Added ${bountySeed.length} bounties (+prizes), bounty applications, and a published podium.`,
  );
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
