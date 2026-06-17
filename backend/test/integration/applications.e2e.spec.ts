import type { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serverRoles, servers, userRoles } from "../../src/db/schema";
import { closeTestApp, createTestApp, dbOf } from "../helpers/app";
import {
  createHackathon,
  registerMember,
  registerOrganization,
} from "../helpers/factories";

describe("applications lifecycle (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(app);
  });
  const http = () => request(app.getHttpServer());

  // Not async: returns the chainable supertest request so callers can attach
  // `.expect(...)` (an async wrapper would resolve to a plain Promise).
  function apply(token: string, hackathonId: string) {
    return http()
      .post("/api/v1/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ hackathonId });
  }

  it("lets a member apply, blocks a duplicate, and an organizer approve", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const applicant = await registerMember(app);

    const created = await apply(applicant.token, hk.hackathonId).expect(201);
    expect(created.body.status).toBe("pending");
    const applicationId = created.body.applicationId;

    // A second active application for the same hackathon is a conflict.
    await apply(applicant.token, hk.hackathonId).expect(409);

    // A non-owner cannot approve.
    const stranger = await registerMember(app);
    await http()
      .patch(`/api/v1/applications/${applicationId}/approve`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .expect(403);

    // The organizer can.
    const approved = await http()
      .patch(`/api/v1/applications/${applicationId}/approve`)
      .set("Authorization", `Bearer ${org.token}`)
      .expect(200);
    expect(approved.body.status).toBe("approved");

    // Approval grants the applicant a "Participant" role in the hackathon's
    // cohor server (role-based access follows acceptance).
    const db = dbOf(app);
    const [server] = await db
      .select({ serverId: servers.serverId })
      .from(servers)
      .where(eq(servers.hackathonId, hk.hackathonId));
    expect(server).toBeTruthy();

    const [role] = await db
      .select({ serverRoleId: serverRoles.serverRoleId })
      .from(serverRoles)
      .where(
        and(
          eq(serverRoles.serverId, server.serverId),
          eq(serverRoles.name, "Participant"),
        ),
      );
    expect(role).toBeTruthy();

    const [grant] = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(
        and(
          eq(userRoles.serverRoleId, role.serverRoleId),
          eq(userRoles.userId, applicant.userId),
        ),
      );
    expect(grant).toBeTruthy();
  });

  it("reflects approvals in the organizer stats", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const applicant = await registerMember(app);

    const created = await apply(applicant.token, hk.hackathonId).expect(201);
    await http()
      .patch(`/api/v1/applications/${created.body.applicationId}/approve`)
      .set("Authorization", `Bearer ${org.token}`)
      .expect(200);

    const stats = await http()
      .get(`/api/v1/applications/hackathon/${hk.hackathonId}/stats`)
      .set("Authorization", `Bearer ${org.token}`)
      .expect(200);
    expect(stats.body.total).toBe(1);
    expect(stats.body.approved).toBe(1);
  });

  it("rejects an application for a non-existent hackathon (404)", async () => {
    const applicant = await registerMember(app);
    await apply(applicant.token, "00000000-0000-4000-8000-000000000000").expect(
      404,
    );
  });
});
