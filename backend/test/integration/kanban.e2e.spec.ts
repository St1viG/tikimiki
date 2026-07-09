import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTestApp, createTestApp } from "../helpers/app";
import {
  createHackathon,
  createTeam,
  registerMember,
  registerOrganization,
  type TestUser,
} from "../helpers/factories";

interface Column {
  columnId: string;
  name: string;
  position: number;
  cards: { cardId: string; columnId: string; position: number }[];
}

describe("kanban (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(app);
  });
  const http = () => request(app.getHttpServer());

  async function teamWithLeader(): Promise<{ teamId: string; leader: TestUser }> {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const leader = await registerMember(app);
    const team = await createTeam(app, hk.hackathonId, leader);
    return { teamId: team.teamId, leader };
  }

  /* ── board ─────────────────────────────────────────────── */

  it("lazily creates a board with the default columns for a team member", async () => {
    const { teamId, leader } = await teamWithLeader();
    const res = await http()
      .get(`/api/v1/teams/${teamId}/kanban`)
      .set("Authorization", `Bearer ${leader.token}`)
      .expect(200);
    const columnNames = (res.body.columns as Column[]).map((c) => c.name);
    expect(columnNames).toEqual(["To do", "In progress", "Done"]);
  });

  it("forbids a non-member from viewing the board (403)", async () => {
    const { teamId } = await teamWithLeader();
    const stranger = await registerMember(app);
    await http()
      .get(`/api/v1/teams/${teamId}/kanban`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .expect(403);
  });

  /* ── cards ──────────────────────────────────────────────── */

  it("moves a card into a column that already has a card at the same position (regression: unique-index 500)", async () => {
    const { teamId, leader } = await teamWithLeader();
    const auth = { Authorization: `Bearer ${leader.token}` };

    const board = await http().get(`/api/v1/teams/${teamId}/kanban`).set(auth).expect(200);
    const [todo, inProgress] = board.body.columns as Column[];

    await http()
      .post(`/api/v1/teams/${teamId}/kanban/cards`)
      .set(auth)
      .send({ columnId: inProgress.columnId, title: "Already here" })
      .expect(201);
    const cardA = await http()
      .post(`/api/v1/teams/${teamId}/kanban/cards`)
      .set(auth)
      .send({ columnId: todo.columnId, title: "Mover" })
      .expect(201);

    const moved = await http()
      .patch(`/api/v1/kanban/cards/${cardA.body.cardId}`)
      .set(auth)
      .send({ columnId: inProgress.columnId })
      .expect(200);
    expect(moved.body.columnId).toBe(inProgress.columnId);

    const after = await http().get(`/api/v1/teams/${teamId}/kanban`).set(auth).expect(200);
    const target = (after.body.columns as Column[]).find((c) => c.columnId === inProgress.columnId);
    expect(target?.cards.length).toBe(2);
  });

  it("forbids creating a card for a non-member (403)", async () => {
    const { teamId, leader } = await teamWithLeader();
    const board = await http()
      .get(`/api/v1/teams/${teamId}/kanban`)
      .set("Authorization", `Bearer ${leader.token}`)
      .expect(200);
    const [todo] = board.body.columns as Column[];

    const stranger = await registerMember(app);
    await http()
      .post(`/api/v1/teams/${teamId}/kanban/cards`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .send({ columnId: todo.columnId, title: "nope" })
      .expect(403);
  });

  it("soft-deletes a card", async () => {
    const { teamId, leader } = await teamWithLeader();
    const auth = { Authorization: `Bearer ${leader.token}` };

    const board = await http().get(`/api/v1/teams/${teamId}/kanban`).set(auth).expect(200);
    const [col] = board.body.columns as Column[];

    const { body: card } = await http()
      .post(`/api/v1/teams/${teamId}/kanban/cards`)
      .set(auth)
      .send({ columnId: col.columnId, title: "Temp" })
      .expect(201);

    await http().delete(`/api/v1/kanban/cards/${card.cardId}`).set(auth).expect(200);

    const after = await http().get(`/api/v1/teams/${teamId}/kanban`).set(auth).expect(200);
    const colAfter = (after.body.columns as Column[]).find((c) => c.columnId === col.columnId);
    expect(colAfter?.cards.find((c) => c.cardId === card.cardId)).toBeUndefined();
  });

  it("assigns a card to a team member", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const leader = await registerMember(app);
    const member = await registerMember(app);
    const team = await createTeam(app, hk.hackathonId, leader);
    // Manually add member to team
    const { dbOf } = await import("../helpers/app");
    const { teamMembers } = await import("../../src/db/schema");
    await dbOf(app)
      .insert(teamMembers)
      .values({ teamId: team.teamId, userId: member.userId, role: "member" });

    const auth = { Authorization: `Bearer ${leader.token}` };
    const board = await http().get(`/api/v1/teams/${team.teamId}/kanban`).set(auth).expect(200);
    const [col] = board.body.columns as Column[];

    const { body: card } = await http()
      .post(`/api/v1/teams/${team.teamId}/kanban/cards`)
      .set(auth)
      .send({ columnId: col.columnId, title: "Assign me" })
      .expect(201);

    const { body: updated } = await http()
      .patch(`/api/v1/kanban/cards/${card.cardId}`)
      .set(auth)
      .send({ assignedTo: member.userId })
      .expect(200);

    expect(updated.assignedTo).toBe(member.userId);
    expect(updated.assignedToUsername).toBe(member.username);
  });

  it("rejects assigning a card to a non-team-member (404)", async () => {
    const { teamId, leader } = await teamWithLeader();
    const stranger = await registerMember(app);
    const auth = { Authorization: `Bearer ${leader.token}` };

    const board = await http().get(`/api/v1/teams/${teamId}/kanban`).set(auth).expect(200);
    const [col] = board.body.columns as Column[];
    const { body: card } = await http()
      .post(`/api/v1/teams/${teamId}/kanban/cards`)
      .set(auth)
      .send({ columnId: col.columnId, title: "Card" })
      .expect(201);

    await http()
      .patch(`/api/v1/kanban/cards/${card.cardId}`)
      .set(auth)
      .send({ assignedTo: stranger.userId })
      .expect(404);
  });

  /* ── columns ────────────────────────────────────────────── */

  it("creates a new column", async () => {
    const { teamId, leader } = await teamWithLeader();
    const auth = { Authorization: `Bearer ${leader.token}` };

    // Ensure board exists first
    await http().get(`/api/v1/teams/${teamId}/kanban`).set(auth).expect(200);

    const { body: col } = await http()
      .post(`/api/v1/teams/${teamId}/kanban/columns`)
      .set(auth)
      .send({ name: "Review" })
      .expect(201);

    expect(col.name).toBe("Review");
    expect(col.cards).toEqual([]);

    const board = await http().get(`/api/v1/teams/${teamId}/kanban`).set(auth).expect(200);
    const names = (board.body.columns as Column[]).map((c) => c.name);
    expect(names).toContain("Review");
  });

  it("renames a column", async () => {
    const { teamId, leader } = await teamWithLeader();
    const auth = { Authorization: `Bearer ${leader.token}` };

    const board = await http().get(`/api/v1/teams/${teamId}/kanban`).set(auth).expect(200);
    const [first] = board.body.columns as Column[];

    const { body: updated } = await http()
      .patch(`/api/v1/kanban/columns/${first.columnId}`)
      .set(auth)
      .send({ name: "Backlog" })
      .expect(200);

    expect(updated.name).toBe("Backlog");

    const after = await http().get(`/api/v1/teams/${teamId}/kanban`).set(auth).expect(200);
    expect((after.body.columns as Column[])[0].name).toBe("Backlog");
  });

  it("deletes an empty column", async () => {
    const { teamId, leader } = await teamWithLeader();
    const auth = { Authorization: `Bearer ${leader.token}` };

    const board = await http().get(`/api/v1/teams/${teamId}/kanban`).set(auth).expect(200);
    const last = (board.body.columns as Column[]).at(-1)!;

    const { body } = await http()
      .delete(`/api/v1/kanban/columns/${last.columnId}`)
      .set(auth)
      .expect(200);

    expect(body).toEqual({ success: true, movedCards: 0 });

    const after = await http().get(`/api/v1/teams/${teamId}/kanban`).set(auth).expect(200);
    const ids = (after.body.columns as Column[]).map((c) => c.columnId);
    expect(ids).not.toContain(last.columnId);
  });

  it("deletes a column with cards — cards migrate to the first column", async () => {
    const { teamId, leader } = await teamWithLeader();
    const auth = { Authorization: `Bearer ${leader.token}` };

    const board = await http().get(`/api/v1/teams/${teamId}/kanban`).set(auth).expect(200);
    const [first, , last] = board.body.columns as Column[];

    // Add 2 cards to the last column
    await http()
      .post(`/api/v1/teams/${teamId}/kanban/cards`)
      .set(auth)
      .send({ columnId: last.columnId, title: "Card A" })
      .expect(201);
    await http()
      .post(`/api/v1/teams/${teamId}/kanban/cards`)
      .set(auth)
      .send({ columnId: last.columnId, title: "Card B" })
      .expect(201);

    const { body } = await http()
      .delete(`/api/v1/kanban/columns/${last.columnId}`)
      .set(auth)
      .expect(200);

    expect(body).toEqual({ success: true, movedCards: 2 });

    const after = await http().get(`/api/v1/teams/${teamId}/kanban`).set(auth).expect(200);
    const cols = after.body.columns as Column[];
    expect(cols.find((c) => c.columnId === last.columnId)).toBeUndefined();

    const firstAfter = cols.find((c) => c.columnId === first.columnId)!;
    expect(firstAfter.cards.length).toBe(2);
  });

  it("cannot delete the only remaining column (400)", async () => {
    const { teamId, leader } = await teamWithLeader();
    const auth = { Authorization: `Bearer ${leader.token}` };

    const board = await http().get(`/api/v1/teams/${teamId}/kanban`).set(auth).expect(200);
    const cols = board.body.columns as Column[];

    // Delete all but one
    for (const col of cols.slice(1)) {
      await http().delete(`/api/v1/kanban/columns/${col.columnId}`).set(auth).expect(200);
    }

    await http().delete(`/api/v1/kanban/columns/${cols[0].columnId}`).set(auth).expect(400);
  });

  it("forbids a non-member from managing columns (403)", async () => {
    const { teamId, leader } = await teamWithLeader();
    const stranger = await registerMember(app);
    const authLeader = { Authorization: `Bearer ${leader.token}` };
    const authStranger = { Authorization: `Bearer ${stranger.token}` };

    const board = await http().get(`/api/v1/teams/${teamId}/kanban`).set(authLeader).expect(200);
    const [col] = board.body.columns as Column[];

    await http()
      .post(`/api/v1/teams/${teamId}/kanban/columns`)
      .set(authStranger)
      .send({ name: "Nope" })
      .expect(403);

    await http()
      .patch(`/api/v1/kanban/columns/${col.columnId}`)
      .set(authStranger)
      .send({ name: "Hacked" })
      .expect(403);

    await http().delete(`/api/v1/kanban/columns/${col.columnId}`).set(authStranger).expect(403);
  });

  /* ── column reorder ─────────────────────────────────────── */

  it("reorders columns via PUT …/columns/order", async () => {
    const { teamId, leader } = await teamWithLeader();
    const auth = { Authorization: `Bearer ${leader.token}` };

    const board = await http().get(`/api/v1/teams/${teamId}/kanban`).set(auth).expect(200);
    const [col0, col1, col2] = board.body.columns as Column[];

    // Reverse order: 2, 1, 0
    const { body: reordered } = await http()
      .put(`/api/v1/teams/${teamId}/kanban/columns/order`)
      .set(auth)
      .send({
        columns: [
          { columnId: col2.columnId, position: 0 },
          { columnId: col1.columnId, position: 1 },
          { columnId: col0.columnId, position: 2 },
        ],
      })
      .expect(200);

    expect((reordered as Column[])[0].columnId).toBe(col2.columnId);
    expect((reordered as Column[])[1].columnId).toBe(col1.columnId);
    expect((reordered as Column[])[2].columnId).toBe(col0.columnId);

    // Confirm GET reflects new order
    const after = await http().get(`/api/v1/teams/${teamId}/kanban`).set(auth).expect(200);
    expect((after.body.columns as Column[])[0].columnId).toBe(col2.columnId);
  });

  it("rejects reorder with unknown columnId (404)", async () => {
    const { teamId, leader } = await teamWithLeader();
    const auth = { Authorization: `Bearer ${leader.token}` };
    await http()
      .put(`/api/v1/teams/${teamId}/kanban/columns/order`)
      .set(auth)
      .send({ columns: [{ columnId: "00000000-0000-0000-0000-000000000000", position: 0 }] })
      .expect(404);
  });

  it("forbids a non-member from reordering columns (403)", async () => {
    const { teamId, leader } = await teamWithLeader();
    const stranger = await registerMember(app);
    const authLeader = { Authorization: `Bearer ${leader.token}` };

    const board = await http().get(`/api/v1/teams/${teamId}/kanban`).set(authLeader).expect(200);
    const [col] = board.body.columns as Column[];

    await http()
      .put(`/api/v1/teams/${teamId}/kanban/columns/order`)
      .set({ Authorization: `Bearer ${stranger.token}` })
      .send({ columns: [{ columnId: col.columnId, position: 0 }] })
      .expect(403);
  });

  /* ── org/admin read-only access ─────────────────────────── */

  it("allows the hackathon organizer to view the board (read-only)", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const leader = await registerMember(app);
    const team = await createTeam(app, hk.hackathonId, leader);

    await http()
      .get(`/api/v1/teams/${team.teamId}/kanban`)
      .set({ Authorization: `Bearer ${org.token}` })
      .expect(200);
  });

  it("forbids the hackathon organizer from writing to the board (403)", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const leader = await registerMember(app);
    const team = await createTeam(app, hk.hackathonId, leader);
    const authOrg = { Authorization: `Bearer ${org.token}` };

    const board = await http()
      .get(`/api/v1/teams/${team.teamId}/kanban`)
      .set({ Authorization: `Bearer ${leader.token}` })
      .expect(200);
    const [col] = board.body.columns as Column[];

    await http()
      .post(`/api/v1/teams/${team.teamId}/kanban/cards`)
      .set(authOrg)
      .send({ columnId: col.columnId, title: "Org card" })
      .expect(403);

    await http()
      .post(`/api/v1/teams/${team.teamId}/kanban/columns`)
      .set(authOrg)
      .send({ name: "Org col" })
      .expect(403);
  });

  /* ── card assignment notification ───────────────────────── */

  it("assigning a card stores a position_assigned notification for the assignee", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const leader = await registerMember(app);
    const member = await registerMember(app);
    const team = await createTeam(app, hk.hackathonId, leader);

    const { dbOf } = await import("../helpers/app");
    const { teamMembers, notifications } = await import("../../src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const db = dbOf(app);

    await db
      .insert(teamMembers)
      .values({ teamId: team.teamId, userId: member.userId, role: "member" });

    const auth = { Authorization: `Bearer ${leader.token}` };
    const board = await http().get(`/api/v1/teams/${team.teamId}/kanban`).set(auth).expect(200);
    const [col] = board.body.columns as Column[];

    const { body: card } = await http()
      .post(`/api/v1/teams/${team.teamId}/kanban/cards`)
      .set(auth)
      .send({ columnId: col.columnId, title: "Task for assignee" })
      .expect(201);

    await http()
      .patch(`/api/v1/kanban/cards/${card.cardId}`)
      .set(auth)
      .send({ assignedTo: member.userId })
      .expect(200);

    // Give the fire-and-forget notification time to commit.
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    const notifs = await db
      .select({ type: notifications.type })
      .from(notifications)
      .where(
        and(eq(notifications.userId, member.userId), eq(notifications.type, "position_assigned")),
      );

    expect(notifs).toHaveLength(1);
  });
});
