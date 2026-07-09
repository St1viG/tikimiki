/**
 * Non-destructive top-up seed — adds the demo data the voting + kanban
 * features need (submitted projects, a few audience votes, and a kanban board
 * for team "digitalci") to an ALREADY-seeded database, without wiping anything.
 *
 *   pnpm --filter ./backend exec tsx src/db/seed-extras.ts
 *
 * Idempotent: bails if a project already exists for team "digitalci".
 */
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env";
import * as schema from "./schema";

const ago = (mins: number) => new Date(Date.now() - mins * 60_000);

async function main() {
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });

  const teamByName = async (name: string) => {
    const [t] = await db
      .select({ teamId: schema.teams.teamId, hackathonId: schema.teams.hackathonId })
      .from(schema.teams)
      .where(and(eq(schema.teams.name, name), isNull(schema.teams.deletedAt)))
      .limit(1);
    return t;
  };
  const userByEmail = async (email: string) => {
    const [u] = await db
      .select({ userId: schema.users.userId })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    return u?.userId;
  };

  const digitalci = await teamByName("digitalci");
  const nullptr = await teamByName("nullptr");
  if (!digitalci || !nullptr) {
    console.log("✗  Teams 'digitalci'/'nullptr' not found — run db:seed first.");
    await client.end();
    return;
  }

  const existing = await db
    .select({ projectId: schema.projects.projectId })
    .from(schema.projects)
    .where(eq(schema.projects.teamId, digitalci.teamId))
    .limit(1);
  if (existing.length > 0) {
    console.log("↩  Projects/kanban already present — nothing to do.");
    await client.end();
    return;
  }

  const etf = digitalci.hackathonId;
  const andrej = await userByEmail("andrej@tikimiki.dev");
  const mohammed = await userByEmail("mohammed@tikimiki.dev");
  const fenjer = await userByEmail("fenjer@tikimiki.dev");
  const mara = await userByEmail("mara@tikimiki.dev");
  if (!andrej || !mohammed || !fenjer || !mara) {
    console.log("✗  Expected demo members not found.");
    await client.end();
    return;
  }

  // ── Submitted projects ───────────────────────────────────────────────
  const [projDigitalci] = await db
    .insert(schema.projects)
    .values({
      teamId: digitalci.teamId,
      title: "Pulse — real-time campus events",
      description:
        "A live map of what's happening on campus right now, powered by student check-ins.",
      status: "submitted",
      repositoryUrl: "https://github.com/digitalci/pulse",
      submittedAt: ago(120),
    })
    .returning();
  const [projNullptr] = await db
    .insert(schema.projects)
    .values({
      teamId: nullptr.teamId,
      title: "Segfault — AI study buddy",
      description: "Explains your compiler errors in plain language and quizzes you on the fix.",
      status: "submitted",
      repositoryUrl: "https://github.com/nullptr/segfault",
      submittedAt: ago(95),
    })
    .returning();

  // ── A few audience votes (unique per voter per hackathon) ─────────────
  await db.insert(schema.votes).values([
    { hackathonId: etf, projectId: projDigitalci.projectId, voterId: mara },
    { hackathonId: etf, projectId: projDigitalci.projectId, voterId: mohammed },
    { hackathonId: etf, projectId: projNullptr.projectId, voterId: fenjer },
  ]);

  // ── Kanban board for team digitalci ───────────────────────────────────
  const [boardDig] = await db
    .insert(schema.kanbanBoards)
    .values({ teamId: digitalci.teamId })
    .returning();
  const cols = await db
    .insert(schema.kanbanColumns)
    .values([
      { boardId: boardDig.boardId, name: "To do", position: 0 },
      { boardId: boardDig.boardId, name: "In progress", position: 1 },
      { boardId: boardDig.boardId, name: "Done", position: 2 },
    ])
    .returning();
  const colId = (name: string) => cols.find((c) => c.name === name)!.columnId;
  await db.insert(schema.kanbanCards).values([
    { columnId: colId("To do"), createdBy: andrej, title: "Design the event-map UI", position: 0 },
    {
      columnId: colId("To do"),
      createdBy: andrej,
      assignedTo: mohammed,
      title: "Set up push notifications",
      position: 1,
    },
    {
      columnId: colId("In progress"),
      createdBy: mohammed,
      assignedTo: mohammed,
      title: "Check-in API endpoint",
      position: 0,
    },
    {
      columnId: colId("Done"),
      createdBy: andrej,
      assignedTo: andrej,
      title: "Repo + CI scaffolding",
      position: 0,
    },
  ]);

  console.log("✓  Added 2 projects, 3 votes, and a kanban board for digitalci.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
