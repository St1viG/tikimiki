/**
 * Autor: Dimitrije Pesic (2023/0014)
 *
 * SSU3 — profile privacy and edit validation: the `profileVisibility` and
 * `showEmail` settings must actually govern the public-profile surfaces, and
 * profile edits must enforce the same username/password rules as signup.
 */
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTestApp, createTestApp } from "../helpers/app";
import { makeAdmin, registerMember, type TestUser } from "../helpers/factories";

describe("profile privacy (SSU3, e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(app);
  });
  const http = () => request(app.getHttpServer());

  const setVisibility = (user: TestUser, profileVisibility: "all" | "members" | "none") =>
    http()
      .patch("/api/v1/settings")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ profileVisibility })
      .expect(200);

  it("shows a profile to anonymous visitors by default (visibility 'all')", async () => {
    const target = await registerMember(app);
    const res = await http().get(`/api/v1/users/${target.username}`).expect(200);
    expect(res.body.username).toBe(target.username);
  });

  it("'members': hides the profile from anonymous visitors, shows it to signed-in users", async () => {
    const target = await registerMember(app);
    await setVisibility(target, "members");

    await http().get(`/api/v1/users/${target.username}`).expect(403);

    const viewer = await registerMember(app);
    await http()
      .get(`/api/v1/users/${target.username}`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .expect(200);
  });

  it("'none': hides the profile from everyone except the owner and admins", async () => {
    const target = await registerMember(app);
    await setVisibility(target, "none");

    const viewer = await registerMember(app);
    await http()
      .get(`/api/v1/users/${target.username}`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .expect(403);

    await http()
      .get(`/api/v1/users/${target.username}`)
      .set("Authorization", `Bearer ${target.token}`)
      .expect(200);

    const admin = await registerMember(app);
    await makeAdmin(app, admin);
    await http()
      .get(`/api/v1/users/${target.username}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);
  });

  it("privacy also covers the posts / followers / following sub-routes", async () => {
    const target = await registerMember(app);
    await setVisibility(target, "none");
    const viewer = await registerMember(app);

    for (const sub of ["posts", "followers", "following"]) {
      await http()
        .get(`/api/v1/users/${target.username}/${sub}`)
        .set("Authorization", `Bearer ${viewer.token}`)
        .expect(403);
    }
  });

  it("returns the email only when the owner enables showEmail", async () => {
    const target = await registerMember(app);

    const hidden = await http().get(`/api/v1/users/${target.username}`).expect(200);
    expect(hidden.body.email).toBeNull();

    await http()
      .patch("/api/v1/settings")
      .set("Authorization", `Bearer ${target.token}`)
      .send({ showEmail: true })
      .expect(200);

    const shown = await http().get(`/api/v1/users/${target.username}`).expect(200);
    expect(shown.body.email).toBe(target.email);
  });

  it("rejects a profile-edit username the signup form would reject (400)", async () => {
    const user = await registerMember(app);
    await http()
      .patch("/api/v1/users/me/profile")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ username: "bad name!" })
      .expect(400);
  });

  it("rejects a weak new password on change (400, same rule as signup)", async () => {
    const user = await registerMember(app);
    await http()
      .patch("/api/v1/users/me/password")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ currentPassword: user.password, newPassword: "alllowercase1" })
      .expect(400);
  });
});
