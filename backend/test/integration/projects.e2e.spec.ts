import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTestApp, createTestApp } from "../helpers/app";
import {
  createHackathon,
  createTeam,
  registerMember,
  registerOrganization,
  type HackathonOverrides,
  type TestUser,
} from "../helpers/factories";

const DAY_MS = 86_400_000;

describe("project submission (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(app);
  });
  const http = () => request(app.getHttpServer());

  /** A hackathon with a team whose leader is an active member. */
  async function teamScenario(
    overrides?: HackathonOverrides,
  ): Promise<{ hackathonId: string; teamId: string; leader: TestUser }> {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org, overrides);
    const leader = await registerMember(app);
    const team = await createTeam(app, hk.hackathonId, leader);
    return { hackathonId: hk.hackathonId, teamId: team.teamId, leader };
  }

  const createReq = (token: string, teamId: string, body: object) =>
    http()
      .post(`/api/v1/teams/${teamId}/project`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);

  it("reports no project before one is created", async () => {
    const { teamId, leader } = await teamScenario();
    const res = await http()
      .get(`/api/v1/teams/${teamId}/project`)
      .set("Authorization", `Bearer ${leader.token}`)
      .expect(200);
    expect(res.body.project).toBeNull();
  });

  it("lets a team member create a draft project and reads it back", async () => {
    const { teamId, leader } = await teamScenario();
    const created = await createReq(leader.token, teamId, {
      title: "Aurora",
      description: "A weather app",
    }).expect(201);
    expect(created.body.status).toBe("draft");
    expect(created.body.title).toBe("Aurora");
    expect(created.body.submittedAt).toBeNull();

    const got = await http()
      .get(`/api/v1/teams/${teamId}/project`)
      .set("Authorization", `Bearer ${leader.token}`)
      .expect(200);
    expect(got.body.project.projectId).toBe(created.body.projectId);
  });

  it("forbids a non-member from creating a project (403)", async () => {
    const { teamId } = await teamScenario();
    const stranger = await registerMember(app);
    await createReq(stranger.token, teamId, { title: "Sneaky" }).expect(403);
  });

  it("rejects a second project for the same team (409)", async () => {
    const { teamId, leader } = await teamScenario();
    await createReq(leader.token, teamId, { title: "First" }).expect(201);
    await createReq(leader.token, teamId, { title: "Second" }).expect(409);
  });

  it("validates the create body (400)", async () => {
    const { teamId, leader } = await teamScenario();
    await createReq(leader.token, teamId, { title: "" }).expect(400);
    await createReq(leader.token, teamId, {
      title: "Bad link",
      repositoryUrl: "not-a-url",
    }).expect(400);
  });

  it("edits a draft, including clearing a field with null", async () => {
    const { teamId, leader } = await teamScenario();
    const created = await createReq(leader.token, teamId, {
      title: "Aurora",
      description: "v1",
      repositoryUrl: "https://github.com/team/aurora",
    }).expect(201);

    const patched = await http()
      .patch(`/api/v1/projects/${created.body.projectId}`)
      .set("Authorization", `Bearer ${leader.token}`)
      .send({ description: "v2", repositoryUrl: null })
      .expect(200);
    expect(patched.body.description).toBe("v2");
    expect(patched.body.repositoryUrl).toBeNull();
  });

  it("submits a project, lists it, then withdraws it", async () => {
    const { hackathonId, teamId, leader } = await teamScenario();
    const created = await createReq(leader.token, teamId, {
      title: "Aurora",
    }).expect(201);
    const projectId = created.body.projectId;

    const submitted = await http()
      .post(`/api/v1/projects/${projectId}/submit`)
      .set("Authorization", `Bearer ${leader.token}`)
      .expect(200);
    expect(submitted.body.status).toBe("submitted");
    expect(submitted.body.submittedAt).not.toBeNull();

    // Appears in the public submissions showcase.
    const showcase = await http().get(`/api/v1/hackathons/${hackathonId}/submissions`).expect(200);
    expect(showcase.body.map((p: { projectId: string }) => p.projectId)).toContain(projectId);

    // Withdraw back to draft.
    const withdrawn = await http()
      .post(`/api/v1/projects/${projectId}/withdraw`)
      .set("Authorization", `Bearer ${leader.token}`)
      .expect(200);
    expect(withdrawn.body.status).toBe("draft");
    expect(withdrawn.body.submittedAt).toBeNull();

    // ...and disappears from the showcase.
    const after = await http().get(`/api/v1/hackathons/${hackathonId}/submissions`).expect(200);
    expect(after.body.map((p: { projectId: string }) => p.projectId)).not.toContain(projectId);
  });

  it("blocks submission after the hackathon has ended (400)", async () => {
    const now = Date.now();
    const { teamId, leader } = await teamScenario({
      registrationDeadline: new Date(now - 10 * DAY_MS).toISOString(),
      startsAt: new Date(now - 9 * DAY_MS).toISOString(),
      endsAt: new Date(now - 7 * DAY_MS).toISOString(),
    });
    const created = await createReq(leader.token, teamId, {
      title: "Too late",
    }).expect(201);
    await http()
      .post(`/api/v1/projects/${created.body.projectId}/submit`)
      .set("Authorization", `Bearer ${leader.token}`)
      .expect(400);
  });

  it("forbids a non-member from editing or submitting (403)", async () => {
    const { teamId, leader } = await teamScenario();
    const created = await createReq(leader.token, teamId, {
      title: "Aurora",
    }).expect(201);
    const stranger = await registerMember(app);

    await http()
      .patch(`/api/v1/projects/${created.body.projectId}`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .send({ title: "hijack" })
      .expect(403);
    await http()
      .post(`/api/v1/projects/${created.body.projectId}/submit`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .expect(403);
  });

  describe("public project detail visibility", () => {
    it("hides a draft from non-members (404) but shows it to a member", async () => {
      const { teamId, leader } = await teamScenario();
      const created = await createReq(leader.token, teamId, {
        title: "Secret draft",
      }).expect(201);
      const projectId = created.body.projectId;

      // Owner sees the draft.
      await http()
        .get(`/api/v1/projects/${projectId}`)
        .set("Authorization", `Bearer ${leader.token}`)
        .expect(200);

      // A stranger gets 404 (existence not leaked).
      const stranger = await registerMember(app);
      await http()
        .get(`/api/v1/projects/${projectId}`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .expect(404);

      // Anonymous also 404.
      await http().get(`/api/v1/projects/${projectId}`).expect(404);
    });

    it("shows a submitted project to anyone", async () => {
      const { teamId, leader } = await teamScenario();
      const created = await createReq(leader.token, teamId, {
        title: "Public",
      }).expect(201);
      const projectId = created.body.projectId;
      await http()
        .post(`/api/v1/projects/${projectId}/submit`)
        .set("Authorization", `Bearer ${leader.token}`)
        .expect(200);

      // Anonymous can view a submitted project.
      const res = await http().get(`/api/v1/projects/${projectId}`).expect(200);
      expect(res.body.title).toBe("Public");
    });
  });

  it("returns 404 for an unknown project id", async () => {
    await http().get("/api/v1/projects/00000000-0000-4000-8000-000000000000").expect(404);
  });
});
