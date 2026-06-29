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

describe("SSU 8 — Pins, Mutes, Private channels (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(app);
  });
  const http = () => request(app.getHttpServer());
  const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

  /** Returns { serverId, generalChannelId } for a fresh hackathon. */
  async function freshServer() {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const serverId = await getHackathonServerId(app, hk.hackathonId);
    const detail = await http()
      .get(`/api/v1/servers/${serverId}`)
      .set(auth(org))
      .expect(200);
    const channels: { channelId: string; type: string; name: string }[] =
      detail.body.groups.flatMap(
        (g: { channels: { channelId: string; type: string; name: string }[] }) =>
          g.channels,
      );
    const general = channels.find((c) => c.type === "general")!;
    const firstGroupId: string = detail.body.groups[0].groupId;
    return { org, serverId, generalChannelId: general.channelId, firstGroupId };
  }

  /** Org sends one message to `channelId`, returns its messageId. */
  async function postMessage(org: TestUser, channelId: string): Promise<string> {
    const res = await http()
      .post(`/api/v1/channels/${channelId}/messages`)
      .set(auth(org))
      .send({ content: "test message" })
      .expect(201);
    return res.body.messageId as string;
  }

  /* ── Pin messages ─────────────────────────────────────────── */

  describe("channel pins", () => {
    it("org can pin a message and list shows it", async () => {
      const { org, generalChannelId } = await freshServer();
      const msgId = await postMessage(org, generalChannelId);

      const pin = await http()
        .post(`/api/v1/channels/${generalChannelId}/pins`)
        .set(auth(org))
        .send({ messageId: msgId })
        .expect(201);
      expect(pin.body).toEqual({ success: true });

      const pins = await http()
        .get(`/api/v1/channels/${generalChannelId}/pins`)
        .set(auth(org))
        .expect(200);
      expect(pins.body).toHaveLength(1);
      expect(pins.body[0].messageId).toBe(msgId);
      expect(pins.body[0].content).toBe("test message");
    });

    it("org can unpin a message and list is empty", async () => {
      const { org, generalChannelId } = await freshServer();
      const msgId = await postMessage(org, generalChannelId);

      await http()
        .post(`/api/v1/channels/${generalChannelId}/pins`)
        .set(auth(org))
        .send({ messageId: msgId })
        .expect(201);

      await http()
        .delete(`/api/v1/channels/${generalChannelId}/pins/${msgId}`)
        .set(auth(org))
        .expect(200);

      const pins = await http()
        .get(`/api/v1/channels/${generalChannelId}/pins`)
        .set(auth(org))
        .expect(200);
      expect(pins.body).toHaveLength(0);
    });

    it("pinning the same message twice returns 409", async () => {
      const { org, generalChannelId } = await freshServer();
      const msgId = await postMessage(org, generalChannelId);

      await http()
        .post(`/api/v1/channels/${generalChannelId}/pins`)
        .set(auth(org))
        .send({ messageId: msgId })
        .expect(201);

      await http()
        .post(`/api/v1/channels/${generalChannelId}/pins`)
        .set(auth(org))
        .send({ messageId: msgId })
        .expect(409);
    });

    it("unpin non-existent returns 404", async () => {
      const { org, generalChannelId } = await freshServer();
      await http()
        .delete(
          `/api/v1/channels/${generalChannelId}/pins/00000000-0000-4000-8000-000000000000`,
        )
        .set(auth(org))
        .expect(404);
    });

    it("plain member without manage_messages cannot pin (403)", async () => {
      const { org, serverId, generalChannelId } = await freshServer();
      const msgId = await postMessage(org, generalChannelId);
      const member = await registerMember(app);
      await addServerMember(app, serverId, member);

      await http()
        .post(`/api/v1/channels/${generalChannelId}/pins`)
        .set(auth(member))
        .send({ messageId: msgId })
        .expect(403);
    });

    it("pinning a message from a different channel returns 404", async () => {
      const { org, generalChannelId, firstGroupId, serverId } =
        await freshServer();
      // Create a second general channel.
      const ch2 = await http()
        .post(`/api/v1/servers/${serverId}/channels`)
        .set(auth(org))
        .send({ groupId: firstGroupId, name: "other-general", type: "general" })
        .expect(201);
      const msgId = await postMessage(org, ch2.body.channelId);

      // Try to pin the message under the wrong channelId.
      await http()
        .post(`/api/v1/channels/${generalChannelId}/pins`)
        .set(auth(org))
        .send({ messageId: msgId })
        .expect(404);
    });
  });

  /* ── Server mutes ─────────────────────────────────────────── */

  describe("server mutes", () => {
    it("org can mute a member and list shows the mute", async () => {
      const { org, serverId } = await freshServer();
      const member = await registerMember(app);
      await addServerMember(app, serverId, member);

      const res = await http()
        .post(`/api/v1/servers/${serverId}/mutes`)
        .set(auth(org))
        .send({ userId: member.userId, reason: "testing" })
        .expect(201);
      expect(res.body.mutedUserId).toBe(member.userId);
      expect(res.body.reason).toBe("testing");

      const list = await http()
        .get(`/api/v1/servers/${serverId}/mutes`)
        .set(auth(org))
        .expect(200);
      expect(list.body.some((m: { mutedUserId: string }) => m.mutedUserId === member.userId)).toBe(true);
    });

    it("muted member cannot send messages (403)", async () => {
      const { org, serverId, generalChannelId } = await freshServer();
      const member = await registerMember(app);
      await addServerMember(app, serverId, member);

      await http()
        .post(`/api/v1/servers/${serverId}/mutes`)
        .set(auth(org))
        .send({ userId: member.userId })
        .expect(201);

      await http()
        .post(`/api/v1/channels/${generalChannelId}/messages`)
        .set(auth(member))
        .send({ content: "am I muted?" })
        .expect(403);
    });

    it("unmuted member can send messages again", async () => {
      const { org, serverId, generalChannelId } = await freshServer();
      const member = await registerMember(app);
      await addServerMember(app, serverId, member);

      await http()
        .post(`/api/v1/servers/${serverId}/mutes`)
        .set(auth(org))
        .send({ userId: member.userId })
        .expect(201);

      await http()
        .delete(`/api/v1/servers/${serverId}/mutes/${member.userId}`)
        .set(auth(org))
        .expect(200);

      await http()
        .post(`/api/v1/channels/${generalChannelId}/messages`)
        .set(auth(member))
        .send({ content: "back to posting" })
        .expect(201);
    });

    it("muting an already-muted user returns 409", async () => {
      const { org, serverId } = await freshServer();
      const member = await registerMember(app);
      await addServerMember(app, serverId, member);

      await http()
        .post(`/api/v1/servers/${serverId}/mutes`)
        .set(auth(org))
        .send({ userId: member.userId })
        .expect(201);

      await http()
        .post(`/api/v1/servers/${serverId}/mutes`)
        .set(auth(org))
        .send({ userId: member.userId })
        .expect(409);
    });

    it("unmuting a non-muted user returns 404", async () => {
      const { org, serverId } = await freshServer();
      const member = await registerMember(app);
      await addServerMember(app, serverId, member);

      await http()
        .delete(`/api/v1/servers/${serverId}/mutes/${member.userId}`)
        .set(auth(org))
        .expect(404);
    });

    it("muting yourself returns 400", async () => {
      const { org, serverId } = await freshServer();
      await http()
        .post(`/api/v1/servers/${serverId}/mutes`)
        .set(auth(org))
        .send({ userId: org.userId })
        .expect(400);
    });

    it("plain member cannot mute others (403)", async () => {
      const { org, serverId } = await freshServer();
      const member = await registerMember(app);
      const target = await registerMember(app);
      await addServerMember(app, serverId, member);
      await addServerMember(app, serverId, target);

      await http()
        .post(`/api/v1/servers/${serverId}/mutes`)
        .set(auth(member))
        .send({ userId: target.userId })
        .expect(403);
    });

    it("expired mute auto-lifts and member can send again", async () => {
      const { org, serverId, generalChannelId } = await freshServer();
      const member = await registerMember(app);
      await addServerMember(app, serverId, member);

      // Mute with expiration in the past.
      await http()
        .post(`/api/v1/servers/${serverId}/mutes`)
        .set(auth(org))
        .send({
          userId: member.userId,
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        })
        .expect(201);

      // Sending should auto-lift the expired mute and succeed.
      await http()
        .post(`/api/v1/channels/${generalChannelId}/messages`)
        .set(auth(member))
        .send({ content: "mute expired" })
        .expect(201);
    });
  });

  /* ── Private channel ACL ──────────────────────────────────── */

  describe("private channel ACL", () => {
    it("creates a private channel (201)", async () => {
      const { org, serverId, firstGroupId } = await freshServer();
      const res = await http()
        .post(`/api/v1/servers/${serverId}/channels`)
        .set(auth(org))
        .send({ groupId: firstGroupId, name: "secret-room", type: "private" })
        .expect(201);
      expect(res.body.type).toBe("private");
    });

    it("server member not in channel_members gets 403 reading private channel", async () => {
      const { org, serverId, firstGroupId } = await freshServer();
      const member = await registerMember(app);
      await addServerMember(app, serverId, member);

      const ch = await http()
        .post(`/api/v1/servers/${serverId}/channels`)
        .set(auth(org))
        .send({ groupId: firstGroupId, name: "private-ch", type: "private" })
        .expect(201);

      await http()
        .get(`/api/v1/channels/${ch.body.channelId}/messages`)
        .set(auth(member))
        .expect(403);

      await http()
        .post(`/api/v1/channels/${ch.body.channelId}/messages`)
        .set(auth(member))
        .send({ content: "sneaky" })
        .expect(403);
    });

    it("adding member to channel grants read and write access", async () => {
      const { org, serverId, firstGroupId } = await freshServer();
      const member = await registerMember(app);
      await addServerMember(app, serverId, member);

      const ch = await http()
        .post(`/api/v1/servers/${serverId}/channels`)
        .set(auth(org))
        .send({ groupId: firstGroupId, name: "private-add", type: "private" })
        .expect(201);
      const channelId: string = ch.body.channelId;

      // Denied before.
      await http()
        .get(`/api/v1/channels/${channelId}/messages`)
        .set(auth(member))
        .expect(403);

      await http()
        .post(`/api/v1/channels/${channelId}/members`)
        .set(auth(org))
        .send({ userId: member.userId })
        .expect(201);

      // Allowed after.
      await http()
        .get(`/api/v1/channels/${channelId}/messages`)
        .set(auth(member))
        .expect(200);
      await http()
        .post(`/api/v1/channels/${channelId}/messages`)
        .set(auth(member))
        .send({ content: "now I'm in" })
        .expect(201);
    });

    it("removing a member from channel denies access again (403)", async () => {
      const { org, serverId, firstGroupId } = await freshServer();
      const member = await registerMember(app);
      await addServerMember(app, serverId, member);

      const ch = await http()
        .post(`/api/v1/servers/${serverId}/channels`)
        .set(auth(org))
        .send({ groupId: firstGroupId, name: "private-remove", type: "private" })
        .expect(201);
      const channelId: string = ch.body.channelId;

      await http()
        .post(`/api/v1/channels/${channelId}/members`)
        .set(auth(org))
        .send({ userId: member.userId })
        .expect(201);

      await http()
        .delete(`/api/v1/channels/${channelId}/members/${member.userId}`)
        .set(auth(org))
        .expect(200);

      await http()
        .get(`/api/v1/channels/${channelId}/messages`)
        .set(auth(member))
        .expect(403);
    });

    it("manager (manage_channels) can always access a private channel", async () => {
      const { org, serverId, firstGroupId } = await freshServer();

      const ch = await http()
        .post(`/api/v1/servers/${serverId}/channels`)
        .set(auth(org))
        .send({ groupId: firstGroupId, name: "mgr-private", type: "private" })
        .expect(201);

      // Org is never in channel_members but holds manage_channels implicitly.
      await http()
        .get(`/api/v1/channels/${ch.body.channelId}/messages`)
        .set(auth(org))
        .expect(200);
    });

    it("listChannelMembers requires manage_channels (403 for plain member)", async () => {
      const { org, serverId, firstGroupId } = await freshServer();
      const member = await registerMember(app);
      await addServerMember(app, serverId, member);

      const ch = await http()
        .post(`/api/v1/servers/${serverId}/channels`)
        .set(auth(org))
        .send({ groupId: firstGroupId, name: "list-acl", type: "private" })
        .expect(201);
      await http()
        .post(`/api/v1/channels/${ch.body.channelId}/members`)
        .set(auth(org))
        .send({ userId: member.userId })
        .expect(201);

      // Even though member is in channel_members, listing requires manage_channels.
      await http()
        .get(`/api/v1/channels/${ch.body.channelId}/members`)
        .set(auth(member))
        .expect(403);

      const list = await http()
        .get(`/api/v1/channels/${ch.body.channelId}/members`)
        .set(auth(org))
        .expect(200);
      expect(list.body.some((m: { userId: string }) => m.userId === member.userId)).toBe(true);
    });

    it("plain member cannot add/remove channel members (403)", async () => {
      const { org, serverId, firstGroupId } = await freshServer();
      const member = await registerMember(app);
      const target = await registerMember(app);
      await addServerMember(app, serverId, member);
      await addServerMember(app, serverId, target);

      const ch = await http()
        .post(`/api/v1/servers/${serverId}/channels`)
        .set(auth(org))
        .send({ groupId: firstGroupId, name: "no-mgmt", type: "private" })
        .expect(201);
      await http()
        .post(`/api/v1/channels/${ch.body.channelId}/members`)
        .set(auth(org))
        .send({ userId: member.userId })
        .expect(201);

      await http()
        .post(`/api/v1/channels/${ch.body.channelId}/members`)
        .set(auth(member))
        .send({ userId: target.userId })
        .expect(403);

      await http()
        .delete(`/api/v1/channels/${ch.body.channelId}/members/${member.userId}`)
        .set(auth(member))
        .expect(403);
    });
  });
});
