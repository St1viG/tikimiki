import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTestApp, createTestApp } from "../helpers/app";
import {
  createHackathon,
  makeAdmin,
  registerMember,
  registerOrganization,
} from "../helpers/factories";

/**
 * Cross-module authorization boundaries — the security-critical contract that
 * the right people (and only the right people) can reach an endpoint.
 */
describe("authorization boundaries (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(app);
  });
  const http = () => request(app.getHttpServer());

  describe("listing applicants is owner-or-admin only", () => {
    it("403 for a member who is neither owner nor admin", async () => {
      const org = await registerOrganization(app);
      const hk = await createHackathon(app, org);
      const stranger = await registerMember(app);
      await http()
        .get(`/api/v1/applications/hackathon/${hk.hackathonId}`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .expect(403);
    });

    it("200 for the organizing owner", async () => {
      const org = await registerOrganization(app);
      const hk = await createHackathon(app, org);
      const res = await http()
        .get(`/api/v1/applications/hackathon/${hk.hackathonId}`)
        .set("Authorization", `Bearer ${org.token}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("200 for a platform admin who is not the owner", async () => {
      const org = await registerOrganization(app);
      const hk = await createHackathon(app, org);
      const admin = await registerMember(app);
      await makeAdmin(app, admin);
      await http()
        .get(`/api/v1/applications/hackathon/${hk.hackathonId}`)
        .set("Authorization", `Bearer ${admin.token}`)
        .expect(200);
    });

    it("401 without a token", async () => {
      const org = await registerOrganization(app);
      const hk = await createHackathon(app, org);
      await http().get(`/api/v1/applications/hackathon/${hk.hackathonId}`).expect(401);
    });
  });

  describe("listing reports is admin only", () => {
    it("403 for a non-admin member", async () => {
      const member = await registerMember(app);
      await http()
        .get("/api/v1/reports")
        .set("Authorization", `Bearer ${member.token}`)
        .expect(403);
    });

    it("200 for a platform admin", async () => {
      const admin = await registerMember(app);
      await makeAdmin(app, admin);
      await http().get("/api/v1/reports").set("Authorization", `Bearer ${admin.token}`).expect(200);
    });

    it("401 without a token", async () => {
      await http().get("/api/v1/reports").expect(401);
    });
  });
});
