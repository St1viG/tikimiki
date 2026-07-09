import type { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import {
  administrators,
  hackathons,
  projects,
  serverRoles,
  servers,
  teamMembers,
  teams,
  userBans,
  userRoles,
} from "../../src/db/schema";
import { dbOf } from "./app";

const DAY_MS = 86_400_000;
let seq = 0;

/** A short, schema-valid unique token (username regex is `[a-zA-Z0-9_.-]`, ≤32). */
export function uniqueId(prefix = "u"): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`;
}

export interface TestUser {
  userId: string;
  username: string;
  email: string;
  password: string;
  token: string;
}

function http(app: INestApplication) {
  return request(app.getHttpServer());
}

/** Register a plain member account through the real API; returns its token. */
export async function registerMember(app: INestApplication): Promise<TestUser> {
  const username = uniqueId("m");
  const email = `${username}@test.dev`;
  const password = "password123";
  const res = await http(app)
    .post("/api/v1/auth/register")
    .send({ username, email, password, accountType: "member" })
    .expect(201);
  return {
    userId: res.body.user.userId,
    username,
    email,
    password,
    token: res.body.accessToken,
  };
}

/** Register an organization account through the real API; returns its token. */
export async function registerOrganization(app: INestApplication): Promise<TestUser> {
  const username = uniqueId("o");
  const email = `${username}@test.dev`;
  const password = "password123";
  const res = await http(app)
    .post("/api/v1/auth/register")
    .send({
      username,
      email,
      password,
      accountType: "organization",
      organizationName: `Org ${username}`,
    })
    .expect(201);
  return {
    userId: res.body.user.userId,
    username,
    email,
    password,
    token: res.body.accessToken,
  };
}

/** Promote a user to platform admin (insert the `administrators` row). */
export async function makeAdmin(app: INestApplication, user: TestUser): Promise<void> {
  await dbOf(app).insert(administrators).values({ userId: user.userId }).onConflictDoNothing();
}

/** Place an active ban on `target`, attributed to admin `bannedBy`. */
export async function banUser(
  app: INestApplication,
  target: TestUser,
  bannedBy: TestUser,
  reason = "violating the rules",
): Promise<void> {
  await dbOf(app).insert(userBans).values({
    userId: target.userId,
    bannedBy: bannedBy.userId,
    reason,
  });
}

export interface HackathonOverrides {
  title?: string;
  type?: "physical" | "virtual" | "hybrid";
  startsAt?: string;
  endsAt?: string;
  registrationDeadline?: string;
  minTeamSize?: number;
  maxTeamSize?: number;
  location?: string;
  latitude?: number;
  longitude?: number;
}

/** Build a valid create-hackathon body (virtual by default). */
export function hackathonBody(overrides: HackathonOverrides = {}) {
  const now = Date.now();
  return {
    title: overrides.title ?? `Hack ${uniqueId("h")}`,
    description: "An integration-test hackathon.",
    type: overrides.type ?? "virtual",
    startsAt: overrides.startsAt ?? new Date(now + 7 * DAY_MS).toISOString(),
    endsAt: overrides.endsAt ?? new Date(now + 9 * DAY_MS).toISOString(),
    registrationDeadline:
      overrides.registrationDeadline ?? new Date(now + 3 * DAY_MS).toISOString(),
    minTeamSize: overrides.minTeamSize ?? 1,
    maxTeamSize: overrides.maxTeamSize ?? 4,
    ...(overrides.location !== undefined ? { location: overrides.location } : {}),
    ...(overrides.latitude !== undefined ? { latitude: overrides.latitude } : {}),
    ...(overrides.longitude !== undefined ? { longitude: overrides.longitude } : {}),
  };
}

/** Hackathon summary shape returned by the API (only the fields tests read). */
export interface CreatedHackathon {
  hackathonId: string;
  organizationId: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
}

/** Create a hackathon via the real API as an organization. */
export async function createHackathon(
  app: INestApplication,
  org: TestUser,
  overrides: HackathonOverrides = {},
): Promise<CreatedHackathon> {
  const res = await http(app)
    .post("/api/v1/hackathons")
    .set("Authorization", `Bearer ${org.token}`)
    .send(hackathonBody(overrides))
    .expect(201);
  return res.body as CreatedHackathon;
}

/** Seed a team (with `leader` as its leader) directly via the database. */
export async function createTeam(
  app: INestApplication,
  hackathonId: string,
  leader: TestUser,
  name?: string,
): Promise<{ teamId: string }> {
  const db = dbOf(app);
  const [team] = await db
    .insert(teams)
    .values({ hackathonId, name: name ?? `Team ${uniqueId("t")}` })
    .returning({ teamId: teams.teamId });
  await db.insert(teamMembers).values({
    teamId: team.teamId,
    userId: leader.userId,
    role: "leader",
  });
  return team;
}

/** Seed a project for a team directly via the database. */
export async function createProject(
  app: INestApplication,
  teamId: string,
  title?: string,
): Promise<{ projectId: string }> {
  const [project] = await dbOf(app)
    .insert(projects)
    .values({ teamId, title: title ?? `Project ${uniqueId("p")}` })
    .returning({ projectId: projects.projectId });
  return project;
}

/** The cohor server bootstrapped for a hackathon. */
export async function getHackathonServerId(
  app: INestApplication,
  hackathonId: string,
): Promise<string> {
  const [row] = await dbOf(app)
    .select({ serverId: servers.serverId })
    .from(servers)
    .where(eq(servers.hackathonId, hackathonId));
  return row.serverId;
}

/**
 * Make `user` a member of a server by granting them a role (find-or-create by
 * name). The role carries NO permissions, so the user is a plain member who
 * cannot manage channels/messages — exactly the "participant" case.
 */
export async function addServerMember(
  app: INestApplication,
  serverId: string,
  user: TestUser,
  roleName = "Participant",
): Promise<void> {
  const db = dbOf(app);
  let [role] = await db
    .select({ id: serverRoles.serverRoleId })
    .from(serverRoles)
    .where(and(eq(serverRoles.serverId, serverId), eq(serverRoles.name, roleName)))
    .limit(1);
  if (!role) {
    [role] = await db
      .insert(serverRoles)
      .values({ serverId, name: roleName })
      .returning({ id: serverRoles.serverRoleId });
  }
  await db
    .insert(userRoles)
    .values({ serverRoleId: role.id, userId: user.userId })
    .onConflictDoNothing();
}

/** Set (or clear) a hackathon's audience-voting window directly. */
export async function setVotingWindow(
  app: INestApplication,
  hackathonId: string,
  opensAt: Date | null,
  closesAt: Date | null,
): Promise<void> {
  await dbOf(app)
    .update(hackathons)
    .set({ votingOpensAt: opensAt, votingClosesAt: closesAt })
    .where(eq(hackathons.hackathonId, hackathonId));
}
