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
  cards: { cardId: string }[];
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

  /** A hackathon with a team whose leader is `leader`. */
  async function teamWithLeader(): Promise<{ teamId: string; leader: TestUser }> {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const leader = await registerMember(app);
    const team = await createTeam(app, hk.hackathonId, leader);
    return { teamId: team.teamId, leader };
  }

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

  it("moves a card into a column that already has a card at the same position (regression: unique-index 500)", async () => {
    const { teamId, leader } = await teamWithLeader();
    const auth = { Authorization: `Bearer ${leader.token}` };

    const board = await http()
      .get(`/api/v1/teams/${teamId}/kanban`)
      .set(auth)
      .expect(200);
    const [todo, inProgress] = board.body.columns as Column[];

    // Seed a card at position 0 in BOTH columns so the naive "keep old
    // position" move would collide on uq_kanban_cards_active_position.
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

    // Move A → In progress sending ONLY columnId (the drag-and-drop case).
    // Must append (max position + 1), not keep position 0 → no 500.
    const moved = await http()
      .patch(`/api/v1/kanban/cards/${cardA.body.cardId}`)
      .set(auth)
      .send({ columnId: inProgress.columnId })
      .expect(200);
    expect(moved.body.columnId).toBe(inProgress.columnId);

    // Both cards now live in the target column.
    const after = await http()
      .get(`/api/v1/teams/${teamId}/kanban`)
      .set(auth)
      .expect(200);
    const target = (after.body.columns as Column[]).find(
      (c) => c.columnId === inProgress.columnId,
    );
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
});
