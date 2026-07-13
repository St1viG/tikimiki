import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTestApp, createTestApp } from "../helpers/app";
import { makeAdmin, registerMember, type TestUser } from "../helpers/factories";

/**
 * SSU18 — report enforcement actually removes content, bans the author, and
 * notifies the reporter. Exercises the real API against a live DB (no mocks)
 * end to end: create report → admin resolves → content/ban/notification.
 */
describe("reports moderation enforcement (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(app);
  });
  const http = () => request(app.getHttpServer());

  async function createPost(author: TestUser): Promise<string> {
    const res = await http()
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${author.token}`)
      .send({ content: "spammy content" })
      .expect(201);
    return res.body.postId as string;
  }

  async function addComment(postId: string, author: TestUser): Promise<string> {
    const res = await http()
      .post(`/api/v1/posts/${postId}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ content: "rude comment" })
      .expect(201);
    return res.body.commentId as string;
  }

  it("resolving with removeContent+banUser soft-deletes the post, bans the author, and notifies the reporter", async () => {
    const offender = await registerMember(app);
    const reporter = await registerMember(app);
    const admin = await registerMember(app);
    await makeAdmin(app, admin);

    const postId = await createPost(offender);

    const reportRes = await http()
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({ targetType: "post", targetId: postId, category: "spam" })
      .expect(201);
    const reportId = reportRes.body.reportId as string;
    expect(reportRes.body.category).toBe("spam");
    expect(reportRes.body.status).toBe("pending");

    // Reporting the same target twice is a conflict.
    await http()
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({ targetType: "post", targetId: postId, category: "other" })
      .expect(409);

    // A non-admin cannot resolve.
    await http()
      .post(`/api/v1/reports/${reportId}/resolve`)
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({ status: "resolved" })
      .expect(403);

    const resolveRes = await http()
      .post(`/api/v1/reports/${reportId}/resolve`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ status: "resolved", removeContent: true, banUser: true, note: "clear spam" })
      .expect(201);
    expect(resolveRes.body.status).toBe("resolved");

    // The post is now soft-deleted — a normal fetch 404s.
    await http()
      .get(`/api/v1/posts/${postId}`)
      .set("Authorization", `Bearer ${reporter.token}`)
      .expect(404);

    // The offending author is genuinely banned: login now fails.
    await http()
      .post("/api/v1/auth/login")
      .send({ email: offender.email, password: offender.password })
      .expect(403);

    // The reporter — not the offender — gets notified of the real outcome.
    const notifRes = await http()
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${reporter.token}`)
      .expect(200);
    const notif = notifRes.body.find((n: { type: string }) => n.type === "report_resolved");
    expect(notif).toBeTruthy();
    expect(notif.entityType).toBe("post");
    expect(notif.entityId).toBe(postId);
    expect(notif.body).toContain("uklonjen");
    expect(notif.body).toContain("banovan");
  });

  it("resolving with neither flag leaves content and ban status untouched, but still notifies", async () => {
    const offender = await registerMember(app);
    const reporter = await registerMember(app);
    const admin = await registerMember(app);
    await makeAdmin(app, admin);

    const postId = await createPost(offender);
    const commentId = await addComment(postId, offender);

    const reportRes = await http()
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({ targetType: "comment", targetId: commentId, category: "harassment" })
      .expect(201);
    const reportId = reportRes.body.reportId as string;

    await http()
      .post(`/api/v1/reports/${reportId}/resolve`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ status: "resolved" })
      .expect(201);

    // Comment thread still shows the comment — nothing was removed.
    const thread = await http()
      .get(`/api/v1/posts/${postId}/comments`)
      .set("Authorization", `Bearer ${reporter.token}`)
      .expect(200);
    expect(thread.body.some((c: { commentId: string }) => c.commentId === commentId)).toBe(true);

    // The offender can still log in — no ban was applied.
    await http()
      .post("/api/v1/auth/login")
      .send({ email: offender.email, password: offender.password })
      .expect(200);
  });

  it("dismissing a report notifies the reporter honestly (no removal claim)", async () => {
    const offender = await registerMember(app);
    const reporter = await registerMember(app);
    const admin = await registerMember(app);
    await makeAdmin(app, admin);

    const postId = await createPost(offender);
    const reportRes = await http()
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({ targetType: "post", targetId: postId, category: "other" })
      .expect(201);
    const reportId = reportRes.body.reportId as string;

    const resolveRes = await http()
      .post(`/api/v1/reports/${reportId}/resolve`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ status: "dismissed" })
      .expect(201);
    expect(resolveRes.body.status).toBe("dismissed");

    const notifRes = await http()
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${reporter.token}`)
      .expect(200);
    const notif = notifRes.body.find((n: { type: string }) => n.type === "report_dismissed");
    expect(notif).toBeTruthy();

    // Content was never touched by a dismissal.
    await http()
      .get(`/api/v1/posts/${postId}`)
      .set("Authorization", `Bearer ${reporter.token}`)
      .expect(200);
  });

  it("reporting a user profile and banning it works without content removal", async () => {
    const offender = await registerMember(app);
    const reporter = await registerMember(app);
    const admin = await registerMember(app);
    await makeAdmin(app, admin);

    const reportRes = await http()
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({ targetType: "user", targetId: offender.userId, category: "harassment" })
      .expect(201);
    const reportId = reportRes.body.reportId as string;

    await http()
      .post(`/api/v1/reports/${reportId}/resolve`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ status: "resolved", banUser: true })
      .expect(201);

    await http()
      .post("/api/v1/auth/login")
      .send({ email: offender.email, password: offender.password })
      .expect(403);
  });
});
