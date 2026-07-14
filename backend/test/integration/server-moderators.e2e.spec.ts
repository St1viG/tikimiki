/**
 * Autor: Dimitrije Pesic (2023/0014)
 */
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

/**
 * Organizer moderator hand-off — POST/DELETE /servers/:id/moderators assigns
 * the canonical "Moderator" role (provisioned with manage_messages on first
 * use), which unlocks the server-scoped reports flow end to end: a moderator
 * can list and resolve that server's message reports, and loses access when
 * the role is taken away. Runs the real API against a live DB (no mocks).
 */
describe("server moderators (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(app);
  });
  const http = () => request(app.getHttpServer());
  const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

  /** Fresh hackathon server with its bootstrapped general channel. */
  async function freshServer() {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const serverId = await getHackathonServerId(app, hk.hackathonId);
    const detail = await http().get(`/api/v1/servers/${serverId}`).set(auth(org)).expect(200);
    const channels: { channelId: string; type: string }[] = detail.body.groups.flatMap(
      (g: { channels: { channelId: string; type: string }[] }) => g.channels,
    );
    const general = channels.find((c) => c.type === "general")!;
    return { org, serverId, generalChannelId: general.channelId };
  }

  async function postMessage(sender: TestUser, channelId: string): Promise<string> {
    const res = await http()
      .post(`/api/v1/channels/${channelId}/messages`)
      .set(auth(sender))
      .send({ content: "offensive message" })
      .expect(201);
    return res.body.messageId as string;
  }

  it("organizer assigns a moderator who can then handle the server's message reports", async () => {
    const { org, serverId, generalChannelId } = await freshServer();
    const moderator = await registerMember(app);
    const offender = await registerMember(app);
    await addServerMember(app, serverId, moderator);
    await addServerMember(app, serverId, offender);

    // Before the hand-off the member cannot see the server's reports.
    await http()
      .get(`/api/v1/reports?status=pending&serverId=${serverId}`)
      .set(auth(moderator))
      .expect(403);

    await http()
      .post(`/api/v1/servers/${serverId}/moderators`)
      .set(auth(org))
      .send({ userId: moderator.userId })
      .expect(201);

    // The canonical role now exists, carries manage_messages, and counts them.
    const roles = await http().get(`/api/v1/servers/${serverId}/roles`).set(auth(org)).expect(200);
    const modRole = roles.body.find((r: { name: string }) => r.name === "Moderator");
    expect(modRole).toBeTruthy();
    expect(modRole.permissions).toContain("manage_messages");
    expect(modRole.memberCount).toBe(1);

    // Assigning twice is a harmless no-op, not an error.
    await http()
      .post(`/api/v1/servers/${serverId}/moderators`)
      .set(auth(org))
      .send({ userId: moderator.userId })
      .expect(201);

    // An offending message gets reported…
    const messageId = await postMessage(offender, generalChannelId);
    await http()
      .post("/api/v1/reports")
      .set(auth(org))
      .send({ targetType: "message", targetId: messageId, category: "harassment" })
      .expect(201);

    // …and the new moderator sees it in the scoped list and resolves it.
    const list = await http()
      .get(`/api/v1/reports?status=pending&serverId=${serverId}`)
      .set(auth(moderator))
      .expect(200);
    const report = list.body.reports.find((r: { targetId: string }) => r.targetId === messageId);
    expect(report).toBeTruthy();

    const resolved = await http()
      .post(`/api/v1/reports/${report.reportId}/resolve`)
      .set(auth(moderator))
      .send({ status: "resolved", removeContent: true })
      .expect(201);
    expect(resolved.body.status).toBe("resolved");

    // The message is genuinely gone from the channel.
    const msgs = await http()
      .get(`/api/v1/channels/${generalChannelId}/messages`)
      .set(auth(moderator))
      .expect(200);
    expect(
      msgs.body.some((m: { messageId: string; deletedAt: string | null }) => {
        return m.messageId === messageId && !m.deletedAt;
      }),
    ).toBe(false);

    // Server-scoped power is NOT platform-wide admin power.
    await http().get("/api/v1/reports?status=pending").set(auth(moderator)).expect(403);
  });

  it("only manage_roles holders can assign, and removal revokes access", async () => {
    const { org, serverId } = await freshServer();
    const moderator = await registerMember(app);
    const outsider = await registerMember(app);
    await addServerMember(app, serverId, moderator);
    await addServerMember(app, serverId, outsider);

    // A plain participant cannot hand out the role.
    await http()
      .post(`/api/v1/servers/${serverId}/moderators`)
      .set(auth(outsider))
      .send({ userId: moderator.userId })
      .expect(403);

    // An organization account cannot RECEIVE it (members only).
    await http()
      .post(`/api/v1/servers/${serverId}/moderators`)
      .set(auth(org))
      .send({ userId: org.userId })
      .expect(400);

    await http()
      .post(`/api/v1/servers/${serverId}/moderators`)
      .set(auth(org))
      .send({ userId: moderator.userId })
      .expect(201);
    await http()
      .get(`/api/v1/reports?status=pending&serverId=${serverId}`)
      .set(auth(moderator))
      .expect(200);

    // Taking the role away closes the door again (and is idempotent).
    await http()
      .delete(`/api/v1/servers/${serverId}/moderators/${moderator.userId}`)
      .set(auth(org))
      .expect(200);
    await http()
      .get(`/api/v1/reports?status=pending&serverId=${serverId}`)
      .set(auth(moderator))
      .expect(403);
    await http()
      .delete(`/api/v1/servers/${serverId}/moderators/${moderator.userId}`)
      .set(auth(org))
      .expect(200);
  });
});
