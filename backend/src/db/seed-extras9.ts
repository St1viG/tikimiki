/**
 * Non-destructive top-up #9 — server moderation roles.
 *
 * Provisions a "Moderator" role on the ETF HackWeek server carrying the
 * `manage_messages`, `manage_channels` and `kick_members` permissions, and
 * assigns it to two seeded participants (nenad + mara). This gives the
 * moderation feature something real to verify against.
 *
 *   pnpm --filter ./backend exec tsx src/db/seed-extras9.ts
 *
 * Idempotent: bails if the ETF server already has a "Moderator" role. Also
 * ensures the permission catalog rows exist (the backend bootstraps them on
 * boot, but seeding may run before the server has started).
 */
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env";
import * as schema from "./schema";

const PERMISSION_CATALOG: { name: string; description: string }[] = [
  { name: "manage_server", description: "Edit server settings (name, logo, banner)" },
  {
    name: "manage_channels",
    description: "Create, edit, and delete channels and channel groups",
  },
  {
    name: "manage_roles",
    description:
      "Create and edit roles, set their permissions, assign and remove members",
  },
  { name: "manage_messages", description: "Delete any member's messages" },
  { name: "kick_members", description: "Remove members from the server" },
];

const MODERATOR_PERMS = ["manage_messages", "manage_channels", "kick_members"];

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

  // Ensure catalog (idempotent — matches the backend bootstrap).
  await db
    .insert(schema.permissions)
    .values(PERMISSION_CATALOG)
    .onConflictDoNothing({ target: schema.permissions.name });

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

  // Idempotency guard.
  const [already] = await db
    .select({ serverRoleId: schema.serverRoles.serverRoleId })
    .from(schema.serverRoles)
    .where(
      and(
        eq(schema.serverRoles.serverId, serverId),
        eq(schema.serverRoles.name, "Moderator"),
      ),
    )
    .limit(1);
  if (already) {
    console.log("↩  Moderator role already seeded — nothing to do.");
    await client.end();
    return;
  }

  const nenad = await userByEmail("nenad@tikimiki.dev");
  const mara = await userByEmail("mara@tikimiki.dev");
  if (!nenad || !mara) {
    console.log("✗  Demo users nenad/mara not found.");
    await client.end();
    return;
  }

  // Resolve permission ids by name.
  const permRows = await db
    .select({
      permissionId: schema.permissions.permissionId,
      name: schema.permissions.name,
    })
    .from(schema.permissions)
    .where(inArray(schema.permissions.name, MODERATOR_PERMS));

  const [role] = await db
    .insert(schema.serverRoles)
    .values({ serverId, name: "Moderator" })
    .returning({ serverRoleId: schema.serverRoles.serverRoleId });

  await db.insert(schema.serverRolePermissions).values(
    permRows.map((p) => ({
      serverRoleId: role.serverRoleId,
      permissionId: p.permissionId,
    })),
  );

  for (const userId of [nenad, mara]) {
    await db
      .insert(schema.userRoles)
      .values({ serverRoleId: role.serverRoleId, userId })
      .onConflictDoNothing();
  }

  console.log(
    `✓  Moderator role created on ETF server (${MODERATOR_PERMS.join(", ")}) and assigned to nenad + mara.`,
  );
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
