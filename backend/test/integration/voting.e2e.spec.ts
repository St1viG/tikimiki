import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTestApp, createTestApp } from "../helpers/app";
import {
  createHackathon,
  createProject,
  createTeam,
  registerMember,
  registerOrganization,
  setVotingWindow,
} from "../helpers/factories";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

describe("audience voting (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(app);
  });
  const http = () => request(app.getHttpServer());

  /** A hackathon with one team that has one votable project. */
  async function scenario() {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const leader = await registerMember(app);
    const team = await createTeam(app, hk.hackathonId, leader);
    const project = await createProject(app, team.teamId);
    return { hk, project };
  }

  const voteUrl = (hackathonId: string, projectId: string) =>
    `/api/v1/hackathons/${hackathonId}/projects/${projectId}/vote`;

  it("reports voting closed when no window is configured", async () => {
    const { hk } = await scenario();
    const res = await http().get(`/api/v1/hackathons/${hk.hackathonId}/voting-status`).expect(200);
    expect(res.body.isOpen).toBe(false);
  });

  it("reports voting open inside a configured window", async () => {
    const { hk } = await scenario();
    await setVotingWindow(
      app,
      hk.hackathonId,
      new Date(Date.now() - HOUR_MS),
      new Date(Date.now() + HOUR_MS),
    );
    const res = await http().get(`/api/v1/hackathons/${hk.hackathonId}/voting-status`).expect(200);
    expect(res.body.isOpen).toBe(true);
  });

  it("forbids voting outside the window (403)", async () => {
    const { hk, project } = await scenario();
    // Window entirely in the past.
    await setVotingWindow(
      app,
      hk.hackathonId,
      new Date(Date.now() - 2 * DAY_MS),
      new Date(Date.now() - DAY_MS),
    );
    const voter = await registerMember(app);
    await http()
      .post(voteUrl(hk.hackathonId, project.projectId))
      .set("Authorization", `Bearer ${voter.token}`)
      .expect(403);
  });

  it("allows one vote inside the window then rejects a second (409)", async () => {
    const { hk, project } = await scenario();
    await setVotingWindow(
      app,
      hk.hackathonId,
      new Date(Date.now() - HOUR_MS),
      new Date(Date.now() + HOUR_MS),
    );
    const voter = await registerMember(app);

    const first = await http()
      .post(voteUrl(hk.hackathonId, project.projectId))
      .set("Authorization", `Bearer ${voter.token}`)
      .expect(201);
    expect(first.body.voteCount).toBe(1);

    await http()
      .post(voteUrl(hk.hackathonId, project.projectId))
      .set("Authorization", `Bearer ${voter.token}`)
      .expect(409);
  });

  it("rejects an organization (non-member) voter (400)", async () => {
    const { hk, project } = await scenario();
    await setVotingWindow(
      app,
      hk.hackathonId,
      new Date(Date.now() - HOUR_MS),
      new Date(Date.now() + HOUR_MS),
    );
    const orgVoter = await registerOrganization(app);
    await http()
      .post(voteUrl(hk.hackathonId, project.projectId))
      .set("Authorization", `Bearer ${orgVoter.token}`)
      .expect(400);
  });
});
