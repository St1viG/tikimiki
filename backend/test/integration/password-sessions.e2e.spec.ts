/**
 * Autor: Dimitrije Pesic (2023/0014)
 *
 * SSU3 — "sign out of all devices": changing or resetting the password bumps
 * the user's tokenVersion, so refresh tokens minted before the change must be
 * rejected while a fresh login works normally.
 */
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTestApp, createTestApp } from "../helpers/app";
import { registerMember, type TestUser } from "../helpers/factories";

describe("password change session revocation (SSU3, e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(app);
  });
  const http = () => request(app.getHttpServer());

  /** Log in and return the session's access token + raw refresh cookie. */
  async function session(
    user: TestUser,
    password = user.password,
  ): Promise<{ accessToken: string; refreshCookie: string }> {
    const login = await http()
      .post("/api/v1/auth/login")
      .send({ email: user.email, password })
      .expect(200);
    const cookies = login.headers["set-cookie"] as unknown as string[];
    const refreshCookie = cookies.find((c) => c.startsWith("tikimiki_refresh="))!;
    expect(refreshCookie).toBeTruthy();
    return { accessToken: login.body.accessToken as string, refreshCookie };
  }

  it("changing the password revokes every earlier refresh token", async () => {
    const user = await registerMember(app);
    const oldDevice = await session(user);
    const currentDevice = await session(user);

    // Before the change both devices can refresh.
    await http().post("/api/v1/auth/refresh").set("Cookie", oldDevice.refreshCookie).expect(200);

    const newPassword = "NewPassword123!";
    await http()
      .patch("/api/v1/users/me/password")
      .set("Authorization", `Bearer ${currentDevice.accessToken}`)
      .send({ currentPassword: user.password, newPassword })
      .expect(200);

    // Every refresh token minted before the change is dead — on all devices.
    await http().post("/api/v1/auth/refresh").set("Cookie", oldDevice.refreshCookie).expect(401);
    await http()
      .post("/api/v1/auth/refresh")
      .set("Cookie", currentDevice.refreshCookie)
      .expect(401);

    // Old password no longer signs in; the new one starts a working session.
    await http()
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: user.password })
      .expect(401);
    const fresh = await session(user, newPassword);
    await http().post("/api/v1/auth/refresh").set("Cookie", fresh.refreshCookie).expect(200);
  });

  it("resetting the password via the email link also revokes old sessions", async () => {
    const user = await registerMember(app);
    const oldDevice = await session(user);

    // Outside production the forgot endpoint returns the reset link directly.
    const forgot = await http()
      .post("/api/v1/auth/password/forgot")
      .send({ email: user.email })
      .expect(200);
    const token = new URL(forgot.body.devLink as string).searchParams.get("token");
    expect(token).toBeTruthy();

    const newPassword = "ResetPassword123!";
    await http().post("/api/v1/auth/password/reset").send({ token, newPassword }).expect(200);

    await http().post("/api/v1/auth/refresh").set("Cookie", oldDevice.refreshCookie).expect(401);

    const fresh = await session(user, newPassword);
    await http().post("/api/v1/auth/refresh").set("Cookie", fresh.refreshCookie).expect(200);
  });
});
