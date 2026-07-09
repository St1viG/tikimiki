import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTestApp, createTestApp } from "../helpers/app";
import { registerMember, type TestUser } from "../helpers/factories";

interface Notification {
  type: string;
  entityType: string | null;
  entityId: string | null;
}

describe("@-mentions (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(app);
  });
  const http = () => request(app.getHttpServer());

  const notificationsOf = async (user: TestUser): Promise<Notification[]> => {
    const res = await http()
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${user.token}`)
      .expect(200);
    return res.body as Notification[];
  };

  it("notifies a user mentioned in a post", async () => {
    const author = await registerMember(app);
    const mentioned = await registerMember(app);

    const post = await http()
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${author.token}`)
      .send({ content: `hey @${mentioned.username} look at this` })
      .expect(201);

    const notes = await notificationsOf(mentioned);
    const mention = notes.find((n) => n.type === "mention" && n.entityId === post.body.postId);
    expect(mention).toBeDefined();
    expect(mention?.entityType).toBe("post");
  });

  it("notifies a user mentioned in a comment", async () => {
    const author = await registerMember(app);
    const mentioned = await registerMember(app);

    const post = await http()
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${author.token}`)
      .send({ content: "a post" })
      .expect(201);

    await http()
      .post(`/api/v1/posts/${post.body.postId}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ content: `nice one @${mentioned.username}` })
      .expect(201);

    const notes = await notificationsOf(mentioned);
    expect(notes.some((n) => n.type === "mention" && n.entityId === post.body.postId)).toBe(true);
  });

  it("does not notify on a self-mention", async () => {
    const author = await registerMember(app);

    await http()
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${author.token}`)
      .send({ content: `talking to myself @${author.username}` })
      .expect(201);

    const notes = await notificationsOf(author);
    expect(notes.some((n) => n.type === "mention")).toBe(false);
  });

  it("ignores an unknown @handle", async () => {
    const author = await registerMember(app);

    // Should not 500 — unknown handles are silently dropped.
    await http()
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${author.token}`)
      .send({ content: "hello @definitely_not_a_real_user_xyz" })
      .expect(201);
  });

  describe("GET /users/search", () => {
    it("finds users by username prefix and excludes the caller", async () => {
      const caller = await registerMember(app);
      const target = await registerMember(app);

      const res = await http()
        .get(`/api/v1/users/search?q=${target.username.slice(0, 6)}`)
        .set("Authorization", `Bearer ${caller.token}`)
        .expect(200);

      const usernames = (res.body as { username: string }[]).map((u) => u.username);
      expect(usernames).toContain(target.username);
      expect(usernames).not.toContain(caller.username);
    });

    it("returns an empty list for a blank query", async () => {
      const caller = await registerMember(app);
      const res = await http()
        .get("/api/v1/users/search?q=")
        .set("Authorization", `Bearer ${caller.token}`)
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it("requires auth", async () => {
      await http().get("/api/v1/users/search?q=abc").expect(401);
    });
  });
});
