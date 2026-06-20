import type { INestApplication } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { channelGroups, channels, servers } from "../../src/db/schema";
import { closeTestApp, createTestApp, dbOf } from "../helpers/app";
import {
  createHackathon,
  registerMember,
  registerOrganization,
} from "../helpers/factories";

describe("SSU6 — team channel auto-creation (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(app);
  });
  const http = () => request(app.getHttpServer());

  async function timoviChannels(hackathonId: string) {
    const db = dbOf(app);
    const [server] = await db
      .select({ serverId: servers.serverId })
      .from(servers)
      .where(eq(servers.hackathonId, hackathonId));

    const groups = await db
      .select({ groupId: channelGroups.groupId, name: channelGroups.name })
      .from(channelGroups)
      .where(eq(channelGroups.serverId, server.serverId));

    const timovi = groups.find((g) => g.name === "TIMOVI");
    if (!timovi) return [];

    return db
      .select({
        channelId: channels.channelId,
        name: channels.name,
        type: channels.type,
        teamId: channels.teamId,
      })
      .from(channels)
      .where(
        and(eq(channels.groupId, timovi.groupId), isNull(channels.deletedAt)),
      );
  }

  it("creates a team channel in TIMOVI when a team is formed via API", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const member = await registerMember(app);

    const res = await http()
      .post("/api/v1/teams")
      .set("Authorization", `Bearer ${member.token}`)
      .send({ hackathonId: hk.hackathonId, name: "Team Alpha" })
      .expect(201);

    const teamId = res.body.teamId;
    const channelList = await timoviChannels(hk.hackathonId);
    const teamChannel = channelList.find((c) => c.teamId === teamId);

    expect(teamChannel).toBeDefined();
    expect(teamChannel?.type).toBe("team");
    expect(teamChannel?.name).toBe("Team Alpha");
  });

  it("creates separate channels for two teams in the same hackathon", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const leader1 = await registerMember(app);
    const leader2 = await registerMember(app);

    const r1 = await http()
      .post("/api/v1/teams")
      .set("Authorization", `Bearer ${leader1.token}`)
      .send({ hackathonId: hk.hackathonId, name: "Alfa" })
      .expect(201);
    const r2 = await http()
      .post("/api/v1/teams")
      .set("Authorization", `Bearer ${leader2.token}`)
      .send({ hackathonId: hk.hackathonId, name: "Beta" })
      .expect(201);

    const channelList = await timoviChannels(hk.hackathonId);
    const teamChannels = channelList.filter((c) => c.type === "team");

    expect(teamChannels.some((c) => c.teamId === r1.body.teamId)).toBe(true);
    expect(teamChannels.some((c) => c.teamId === r2.body.teamId)).toBe(true);
  });

});
