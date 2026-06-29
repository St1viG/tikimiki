import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTestApp, createTestApp } from "../helpers/app";
import { registerMember, type TestUser } from "../helpers/factories";

describe("post comments — edit & delete (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(app);
  });
  const http = () => request(app.getHttpServer());

  /** Create a post as `author` and return its id. */
  async function createPost(author: TestUser): Promise<string> {
    const res = await http()
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${author.token}`)
      .send({ content: "hello world" })
      .expect(201);
    return res.body.postId as string;
  }

  /** Comment on `postId` as `user` and return the created comment id. */
  async function addComment(
    postId: string,
    user: TestUser,
    content = "first comment",
  ): Promise<string> {
    const res = await http()
      .post(`/api/v1/posts/${postId}/comments`)
      .set("Authorization", `Bearer ${user.token}`)
      .send({ content })
      .expect(201);
    return res.body.commentId as string;
  }

  it("lets the author edit their own comment and stamps editedAt", async () => {
    const author = await registerMember(app);
    const postId = await createPost(author);
    const commentId = await addComment(postId, author, "typo here");

    const res = await http()
      .patch(`/api/v1/comments/${commentId}`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ content: "fixed now" })
      .expect(200);

    expect(res.body.commentId).toBe(commentId);
    expect(res.body.content).toBe("fixed now");
    expect(res.body.editedAt).not.toBeNull();

    // The edit is visible when re-listing the thread.
    const list = await http()
      .get(`/api/v1/posts/${postId}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .expect(200);
    const edited = list.body.find(
      (c: { commentId: string }) => c.commentId === commentId,
    );
    expect(edited.content).toBe("fixed now");
  });

  it("forbids editing someone else's comment", async () => {
    const author = await registerMember(app);
    const stranger = await registerMember(app);
    const postId = await createPost(author);
    const commentId = await addComment(postId, author);

    await http()
      .patch(`/api/v1/comments/${commentId}`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .send({ content: "not mine" })
      .expect(403);
  });

  it("rejects an empty edit", async () => {
    const author = await registerMember(app);
    const postId = await createPost(author);
    const commentId = await addComment(postId, author);

    await http()
      .patch(`/api/v1/comments/${commentId}`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ content: "   " })
      .expect(400);
  });

  it("lets the author delete their own comment and drops it from the thread", async () => {
    const author = await registerMember(app);
    const postId = await createPost(author);
    const commentId = await addComment(postId, author);

    await http()
      .delete(`/api/v1/comments/${commentId}`)
      .set("Authorization", `Bearer ${author.token}`)
      .expect(200);

    const list = await http()
      .get(`/api/v1/posts/${postId}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .expect(200);
    expect(
      list.body.some((c: { commentId: string }) => c.commentId === commentId),
    ).toBe(false);
  });

  it("forbids deleting someone else's comment", async () => {
    const author = await registerMember(app);
    const stranger = await registerMember(app);
    const postId = await createPost(author);
    const commentId = await addComment(postId, author);

    await http()
      .delete(`/api/v1/comments/${commentId}`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .expect(403);
  });

  it("404s when editing a deleted comment", async () => {
    const author = await registerMember(app);
    const postId = await createPost(author);
    const commentId = await addComment(postId, author);

    await http()
      .delete(`/api/v1/comments/${commentId}`)
      .set("Authorization", `Bearer ${author.token}`)
      .expect(200);

    await http()
      .patch(`/api/v1/comments/${commentId}`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ content: "resurrect" })
      .expect(404);
  });
});
