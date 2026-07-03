import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTestApp, createTestApp } from "../helpers/app";
import { banUser, makeAdmin, registerMember, uniqueId } from "../helpers/factories";

describe("auth (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(app);
  });
  const http = () => request(app.getHttpServer());

  it("registers, logs in, and returns the profile with roles", async () => {
    const username = uniqueId("auth");
    const email = `${username}@test.dev`;
    const password = "password123";

    const reg = await http()
      .post("/api/v1/auth/register")
      .send({ username, email, password })
      .expect(201);
    expect(reg.body.accessToken).toBeTruthy();
    expect(reg.body.user.username).toBe(username);
    expect(reg.body.user.passwordHash).toBeUndefined();

    const login = await http()
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);
    expect(login.body.accessToken).toBeTruthy();

    const me = await http()
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe(email);
    expect(me.body.roles).toEqual({
      isAdmin: false,
      isMember: true,
      isOrganization: false,
    });
  });

  it("logs in with the username as the identifier", async () => {
    const u = await registerMember(app);
    const login = await http()
      .post("/api/v1/auth/login")
      .send({ email: u.username, password: u.password })
      .expect(200);
    expect(login.body.user.username).toBe(u.username);
  });

  it("reports email and username availability", async () => {
    const u = await registerMember(app);
    const taken = await http()
      .get(`/api/v1/auth/availability?email=${encodeURIComponent(u.email)}&username=${u.username}`)
      .expect(200);
    expect(taken.body).toEqual({ email: false, username: false });

    const free = await http()
      .get(`/api/v1/auth/availability?email=${uniqueId("free")}@test.dev&username=${uniqueId("free")}`)
      .expect(200);
    expect(free.body).toEqual({ email: true, username: true });

    const partial = await http()
      .get(`/api/v1/auth/availability?username=${u.username}`)
      .expect(200);
    expect(partial.body).toEqual({ username: false });
  });

  it("rejects a duplicate email with 409", async () => {
    const u = await registerMember(app);
    await http()
      .post("/api/v1/auth/register")
      .send({ username: uniqueId("dup"), email: u.email, password: "password123" })
      .expect(409);
  });

  it("rejects a duplicate username with 409", async () => {
    const u = await registerMember(app);
    await http()
      .post("/api/v1/auth/register")
      .send({
        username: u.username,
        email: `${uniqueId("d")}@test.dev`,
        password: "password123",
      })
      .expect(409);
  });

  it("rejects an invalid registration body with 400", async () => {
    await http()
      .post("/api/v1/auth/register")
      .send({ username: "x", email: "nope", password: "short" })
      .expect(400);
  });

  it("rejects bad credentials with 401", async () => {
    const u = await registerMember(app);
    await http()
      .post("/api/v1/auth/login")
      .send({ email: u.email, password: "wrong-password" })
      .expect(401);
  });

  it("rejects /me without a token (401)", async () => {
    await http().get("/api/v1/auth/me").expect(401);
  });

  it("rejects a refresh token presented as an access token (typ enforcement)", async () => {
    const u = await registerMember(app);
    const login = await http()
      .post("/api/v1/auth/login")
      .send({ email: u.email, password: u.password })
      .expect(200);

    const cookies = login.headers["set-cookie"] as unknown as string[];
    const refreshCookie = cookies.find((c) =>
      c.startsWith("tikimiki_refresh="),
    );
    expect(refreshCookie).toBeTruthy();
    const refreshToken = decodeURIComponent(
      refreshCookie!.split(";")[0].split("=")[1],
    );

    // A valid refresh token must NOT be accepted on access-token routes.
    await http()
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${refreshToken}`)
      .expect(401);
  });

  it("blocks a banned account from logging in (403) and surfaces the reason", async () => {
    const victim = await registerMember(app);
    const admin = await registerMember(app);
    await makeAdmin(app, admin);
    await banUser(app, victim, admin, "spamming the feed");

    const res = await http()
      .post("/api/v1/auth/login")
      .send({ email: victim.email, password: victim.password })
      .expect(403);
    expect(res.body.banned).toBe(true);
    expect(res.body.reason).toBe("spamming the feed");
  });
});
