/**
 * Autor: Dimitrije Pesic (2023/0014)
 *
 * SSU2 — organization verification gate: an organization gets hackathon
 * creation privileges only after an administrator approves its request;
 * a rejected organization can resubmit and shows up as pending again.
 */
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTestApp, createTestApp } from "../helpers/app";
import {
  hackathonBody,
  makeAdmin,
  registerMember,
  registerOrganization,
  registerPendingOrganization,
} from "../helpers/factories";

describe("organization verification (SSU2, e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(app);
  });
  const http = () => request(app.getHttpServer());

  it("blocks a pending organization from creating a hackathon (403)", async () => {
    const org = await registerPendingOrganization(app);
    const res = await http()
      .post("/api/v1/hackathons")
      .set("Authorization", `Bearer ${org.token}`)
      .send(hackathonBody())
      .expect(403);
    expect(res.body.message).toMatch(/verified/i);
  });

  it("blocks a pending organization from the draft flow (403)", async () => {
    const org = await registerPendingOrganization(app);
    await http()
      .post("/api/v1/hackathons/drafts")
      .set("Authorization", `Bearer ${org.token}`)
      .send({ payload: { form: { title: "Draft" } } })
      .expect(403);
  });

  it("lets a verified organization create a hackathon", async () => {
    const org = await registerOrganization(app);
    await http()
      .post("/api/v1/hackathons")
      .set("Authorization", `Bearer ${org.token}`)
      .send(hackathonBody())
      .expect(201);
  });

  it("admin verify unlocks creation for a previously pending organization", async () => {
    const org = await registerPendingOrganization(app);
    const admin = await registerMember(app);
    await makeAdmin(app, admin);

    await http()
      .post(`/api/v1/admin/organizations/${org.userId}/verify`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(201);

    await http()
      .post("/api/v1/hackathons")
      .set("Authorization", `Bearer ${org.token}`)
      .send(hackathonBody())
      .expect(201);
  });

  it("surfaces the org's verification state on /auth/me", async () => {
    const org = await registerPendingOrganization(app);
    const me = await http()
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${org.token}`)
      .expect(200);
    expect(me.body.organization).toMatchObject({
      verificationStatus: "pending",
      rejectionReason: null,
    });
  });

  it("keeps a rejected organization blocked and shows it in the admin rejected list", async () => {
    const org = await registerPendingOrganization(app);
    const admin = await registerMember(app);
    await makeAdmin(app, admin);

    await http()
      .post(`/api/v1/admin/organizations/${org.userId}/reject`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ reason: "Nepotpuni podaci" })
      .expect(201);

    await http()
      .post("/api/v1/hackathons")
      .set("Authorization", `Bearer ${org.token}`)
      .send(hackathonBody())
      .expect(403);

    const list = await http()
      .get("/api/v1/admin/organizations")
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);
    const rejected = (list.body.rejected as Array<Record<string, unknown>>).find(
      (o) => o.userId === org.userId,
    );
    expect(rejected).toBeDefined();
    expect(rejected).toMatchObject({
      rejectionReason: "Nepotpuni podaci",
      username: org.username,
      accountEmail: org.email,
    });
    expect(rejected!.submittedAt).toBeTruthy();
  });

  it("lets a rejected organization resubmit: back to pending, review fields cleared", async () => {
    const org = await registerPendingOrganization(app);
    const admin = await registerMember(app);
    await makeAdmin(app, admin);

    await http()
      .post(`/api/v1/admin/organizations/${org.userId}/reject`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ reason: "Sumnjiv sajt" })
      .expect(201);

    await http()
      .post("/api/v1/auth/organization/resubmit")
      .set("Authorization", `Bearer ${org.token}`)
      .expect(200);

    const me = await http()
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${org.token}`)
      .expect(200);
    expect(me.body.organization).toMatchObject({
      verificationStatus: "pending",
      rejectionReason: null,
    });

    const list = await http()
      .get("/api/v1/admin/organizations")
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);
    const pendingIds = (list.body.pending as Array<{ userId: string }>).map((o) => o.userId);
    expect(pendingIds).toContain(org.userId);
  });

  it("rejects resubmission when the request is not in the rejected state (409)", async () => {
    const pendingOrg = await registerPendingOrganization(app);
    await http()
      .post("/api/v1/auth/organization/resubmit")
      .set("Authorization", `Bearer ${pendingOrg.token}`)
      .expect(409);

    const member = await registerMember(app);
    await http()
      .post("/api/v1/auth/organization/resubmit")
      .set("Authorization", `Bearer ${member.token}`)
      .expect(400);
  });
});
