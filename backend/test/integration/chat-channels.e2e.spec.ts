import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTestApp, createTestApp } from "../helpers/app";
import {
  addServerMember,
  createHackathon,
  getHackathonServerId,
  registerMember,
  registerOrganization,
  type TestUser,
} from "../helpers/factories";

interface Channel {
  channelId: string;
  name: string;
  type: string;
}

describe("channel types (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(app);
  });
  const http = () => request(app.getHttpServer());
  const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

  async function serverScenario() {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const serverId = await getHackathonServerId(app, hk.hackathonId);
    return { org, hk, serverId };
  }

  async function serverChannels(serverId: string, viewer: TestUser) {
    const res = await http().get(`/api/v1/servers/${serverId}`).set(auth(viewer)).expect(200);
    const channels: Channel[] = res.body.groups.flatMap((g: { channels: Channel[] }) => g.channels);
    const byName: Record<string, Channel> = Object.fromEntries(channels.map((c) => [c.name, c]));
    return { byName, firstGroupId: res.body.groups[0].groupId };
  }

  it("bootstraps general / announcements / project / kanban channels on create", async () => {
    const { org, serverId } = await serverScenario();
    const { byName } = await serverChannels(serverId, org);
    expect(byName["opšte"]?.type).toBe("general");
    expect(byName["najave"]?.type).toBe("announcements");
    expect(byName["predaja-projekta"]?.type).toBe("project");
    expect(byName["moj-tim-board"]?.type).toBe("kanban");
  });

  it("lets an organizer create a project-type channel", async () => {
    const { org, serverId } = await serverScenario();
    const { firstGroupId } = await serverChannels(serverId, org);
    const res = await http()
      .post(`/api/v1/servers/${serverId}/channels`)
      .set(auth(org))
      .send({ groupId: firstGroupId, name: "predaja-finala", type: "project" })
      .expect(201);
    expect(res.body.type).toBe("project");
  });

  it("forbids creating a channel without manage_channels (403)", async () => {
    const { org, serverId } = await serverScenario();
    const { firstGroupId } = await serverChannels(serverId, org);
    const member = await registerMember(app);
    await addServerMember(app, serverId, member);
    await http()
      .post(`/api/v1/servers/${serverId}/channels`)
      .set(auth(member))
      .send({ groupId: firstGroupId, name: "sneaky", type: "general" })
      .expect(403);
  });

  it("rejects messages posted to project / kanban channels (400)", async () => {
    const { org, serverId } = await serverScenario();
    const { byName } = await serverChannels(serverId, org);
    await http()
      .post(`/api/v1/channels/${byName["predaja-projekta"].channelId}/messages`)
      .set(auth(org))
      .send({ content: "here is our project" })
      .expect(400);
    await http()
      .post(`/api/v1/channels/${byName["moj-tim-board"].channelId}/messages`)
      .set(auth(org))
      .send({ content: "move card" })
      .expect(400);
  });

  it("restricts announcement posting to managers", async () => {
    const { org, serverId } = await serverScenario();
    const { byName } = await serverChannels(serverId, org);
    const najave = byName["najave"].channelId;

    // A plain participant (server member, no manage_messages) cannot post.
    const member = await registerMember(app);
    await addServerMember(app, serverId, member);
    await http()
      .post(`/api/v1/channels/${najave}/messages`)
      .set(auth(member))
      .send({ content: "can I post?" })
      .expect(403);

    // The organizer (implicitly holds every permission) can.
    await http()
      .post(`/api/v1/channels/${najave}/messages`)
      .set(auth(org))
      .send({ content: "Opening ceremony at 9am" })
      .expect(201);
  });

  it("allows any member to post in a general channel", async () => {
    const { org, serverId } = await serverScenario();
    const { byName } = await serverChannels(serverId, org);
    const member = await registerMember(app);
    await addServerMember(app, serverId, member);
    await http()
      .post(`/api/v1/channels/${byName["opšte"].channelId}/messages`)
      .set(auth(member))
      .send({ content: "hello team!" })
      .expect(201);
  });
});
