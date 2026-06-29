import type { INestApplication } from "@nestjs/common";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { channelGroups, channels, servers } from "../../src/db/schema";
import { closeTestApp, createTestApp, dbOf } from "../helpers/app";
import {
  createHackathon,
  hackathonBody,
  registerMember,
  registerOrganization,
} from "../helpers/factories";

describe("hackathons (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(app);
  });
  const http = () => request(app.getHttpServer());

  it("forbids a member (non-organization) from creating a hackathon (403)", async () => {
    const member = await registerMember(app);
    await http()
      .post("/api/v1/hackathons")
      .set("Authorization", `Bearer ${member.token}`)
      .send(hackathonBody())
      .expect(403);
  });

  it("requires authentication to create (401)", async () => {
    await http().post("/api/v1/hackathons").send(hackathonBody()).expect(401);
  });

  it("lets an organization create a hackathon and bootstraps its cohor server", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    expect(hk.organizationId).toBe(org.userId);
    expect(hk.status).toBe("upcoming");

    // The create path must also provision a server with the default channel
    // groups + opšte/najave channels. Verify directly in the database.
    const db = dbOf(app);
    const [server] = await db
      .select()
      .from(servers)
      .where(eq(servers.hackathonId, hk.hackathonId));
    expect(server).toBeTruthy();

    const groups = await db
      .select()
      .from(channelGroups)
      .where(eq(channelGroups.serverId, server.serverId));
    expect(groups.length).toBeGreaterThanOrEqual(1);

    const chans = await db
      .select()
      .from(channels)
      .where(
        inArray(
          channels.groupId,
          groups.map((g) => g.groupId),
        ),
      );
    const names = chans.map((c) => c.name);
    expect(names).toContain("opšte");
    expect(names).toContain("najave");
  });

  it("round-trips coordinates through PostGIS for a physical hackathon", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org, {
      type: "physical",
      location: "Belgrade",
      latitude: 44.8125,
      longitude: 20.4612,
    });
    const res = await http()
      .get(`/api/v1/hackathons/${hk.hackathonId}`)
      .expect(200);
    expect(res.body.latitude).toBeCloseTo(44.8125, 3);
    expect(res.body.longitude).toBeCloseTo(20.4612, 3);
  });

  describe("create validation (400)", () => {
    let org: Awaited<ReturnType<typeof registerOrganization>>;
    beforeAll(async () => {
      org = await registerOrganization(app);
    });
    const post = (body: object) =>
      http()
        .post("/api/v1/hackathons")
        .set("Authorization", `Bearer ${org.token}`)
        .send(body);

    it("rejects startsAt on/after endsAt", async () => {
      const now = Date.now();
      await post(
        hackathonBody({
          startsAt: new Date(now + 9 * 86_400_000).toISOString(),
          endsAt: new Date(now + 8 * 86_400_000).toISOString(),
        }),
      ).expect(400);
    });

    it("rejects a registration deadline on/after startsAt", async () => {
      const now = Date.now();
      await post(
        hackathonBody({
          registrationDeadline: new Date(now + 8 * 86_400_000).toISOString(),
          startsAt: new Date(now + 7 * 86_400_000).toISOString(),
          endsAt: new Date(now + 9 * 86_400_000).toISOString(),
        }),
      ).expect(400);
    });

    it("rejects a physical hackathon without location/coordinates", async () => {
      await post(hackathonBody({ type: "physical" })).expect(400);
    });

    it("rejects coordinates supplied one at a time", async () => {
      await post(hackathonBody({ latitude: 44.8 })).expect(400);
    });

    it("rejects maxTeamSize below minTeamSize", async () => {
      await post(hackathonBody({ minTeamSize: 4, maxTeamSize: 2 })).expect(400);
    });
  });

  it("returns 404 for an unknown hackathon id", async () => {
    await http()
      .get("/api/v1/hackathons/00000000-0000-4000-8000-000000000000")
      .expect(404);
  });

  it("returns 400 for a malformed hackathon id", async () => {
    await http().get("/api/v1/hackathons/not-a-uuid").expect(400);
  });
});
