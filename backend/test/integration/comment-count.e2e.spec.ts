import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTestApp, createTestApp } from "../helpers/app";
import { registerMember, type TestUser } from "../helpers/factories";

describe("comment count vs deleted replies (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(app);
  });
  const http = () => request(app.getHttpServer());

  const feedCount = async (user: TestUser, postId: string): Promise<number> => {
    const res = await http()
      .get("/api/v1/feed")
      .set("Authorization", `Bearer ${user.token}`)
      .expect(200);
    const post = (res.body as { postId: string; commentCount: number }[]).find(
      (p) => p.postId === postId,
    );
    return post?.commentCount ?? -1;
  };

  it("excludes a deleted reply from the post comment count", async () => {
    const user = await registerMember(app);
    const post = await http()
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ content: "p" })
      .expect(201);
    const postId = post.body.postId as string;

    const root = await http()
      .post(`/api/v1/posts/${postId}/comments`)
      .set("Authorization", `Bearer ${user.token}`)
      .send({ content: "root" })
      .expect(201);

    const reply = await http()
      .post(`/api/v1/posts/${postId}/comments`)
      .set("Authorization", `Bearer ${user.token}`)
      .send({ content: "reply", parentCommentId: root.body.commentId })
      .expect(201);

    expect(await feedCount(user, postId)).toBe(2);

    const delReply = await http()
      .delete(`/api/v1/comments/${reply.body.commentId}`)
      .set("Authorization", `Bearer ${user.token}`)
      .expect(200);
    expect(delReply.body.deletedCount).toBe(1);

    expect(await feedCount(user, postId)).toBe(1);
  });

  it("cascade-deletes a comment's reply subtree (count drops to 0)", async () => {
    const user = await registerMember(app);
    const post = await http()
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ content: "p" })
      .expect(201);
    const postId = post.body.postId as string;

    const root = await http()
      .post(`/api/v1/posts/${postId}/comments`)
      .set("Authorization", `Bearer ${user.token}`)
      .send({ content: "root" })
      .expect(201);

    const reply = await http()
      .post(`/api/v1/posts/${postId}/comments`)
      .set("Authorization", `Bearer ${user.token}`)
      .send({ content: "reply", parentCommentId: root.body.commentId })
      .expect(201);

    // A nested reply (reply-to-reply) so we exercise recursion past one level.
    await http()
      .post(`/api/v1/posts/${postId}/comments`)
      .set("Authorization", `Bearer ${user.token}`)
      .send({ content: "deep", parentCommentId: reply.body.commentId })
      .expect(201);

    expect(await feedCount(user, postId)).toBe(3);

    // Deleting the root removes the whole subtree (root + reply + deep) = 3.
    const del = await http()
      .delete(`/api/v1/comments/${root.body.commentId}`)
      .set("Authorization", `Bearer ${user.token}`)
      .expect(200);
    expect(del.body.deletedCount).toBe(3);

    expect(await feedCount(user, postId)).toBe(0);

    // The thread is now empty.
    const list = await http()
      .get(`/api/v1/posts/${postId}/comments`)
      .set("Authorization", `Bearer ${user.token}`)
      .expect(200);
    expect(list.body).toHaveLength(0);
  });
});
