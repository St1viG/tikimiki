import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env";
import { closeTestApp, createTestApp } from "../helpers/app";
import { registerMember } from "../helpers/factories";

/**
 * OAuth start/callback routing (e2e). External providers are never called:
 * these tests only exercise our side of the flow — provider validation, the
 * unconfigured fallback, the authorize redirect, and callback state checks.
 * Provider credentials are toggled by mutating the parsed `env` object, which
 * the service reads at call time.
 */
describe("auth/oauth (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
    /* env.ts now loads the developer's .env; clear any real linkedin keys so
       the unconfigured-fallback assertions stay deterministic */
    env.LINKEDIN_CLIENT_ID = "";
    env.LINKEDIN_CLIENT_SECRET = "";
  });
  afterAll(async () => {
    await closeTestApp(app);
  });
  afterEach(() => {
    env.LINKEDIN_CLIENT_ID = "";
    env.LINKEDIN_CLIENT_SECRET = "";
  });
  const http = () => request(app.getHttpServer());

  it("redirects an unknown provider to /login?oauth=error", async () => {
    const res = await http().get("/api/v1/auth/oauth/facebook").expect(302);
    expect(res.headers.location).toBe(`${env.WEB_ORIGIN}/login?oauth=error`);
  });

  it("redirects to /login?oauth=unconfigured when linkedin keys are missing", async () => {
    const res = await http().get("/api/v1/auth/oauth/linkedin").expect(302);
    expect(res.headers.location).toBe(`${env.WEB_ORIGIN}/login?oauth=unconfigured`);
  });

  it("starts the linkedin flow when configured", async () => {
    env.LINKEDIN_CLIENT_ID = "test-client-id";
    env.LINKEDIN_CLIENT_SECRET = "test-client-secret";

    const res = await http().get("/api/v1/auth/oauth/linkedin").expect(302);
    const location = new URL(res.headers.location);
    expect(location.origin + location.pathname).toBe(
      "https://www.linkedin.com/oauth/v2/authorization",
    );
    expect(location.searchParams.get("response_type")).toBe("code");
    expect(location.searchParams.get("client_id")).toBe("test-client-id");
    expect(location.searchParams.get("scope")).toBe("openid profile email");
    expect(location.searchParams.get("redirect_uri")).toBe(
      `${env.OAUTH_REDIRECT_BASE}/api/v1/auth/oauth/linkedin/callback`,
    );

    const state = location.searchParams.get("state");
    expect(state).toBeTruthy();
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith(`tikimiki_oauth_state=${state}`))).toBe(true);
  });

  it("rejects a callback whose state does not match the cookie", async () => {
    env.LINKEDIN_CLIENT_ID = "test-client-id";
    env.LINKEDIN_CLIENT_SECRET = "test-client-secret";

    const res = await http()
      .get("/api/v1/auth/oauth/linkedin/callback?code=abc&state=forged")
      .expect(302);
    expect(res.headers.location).toBe(`${env.WEB_ORIGIN}/login?oauth=error`);
  });

  it("rejects a callback with no code", async () => {
    const res = await http().get("/api/v1/auth/oauth/linkedin/callback").expect(302);
    expect(res.headers.location).toBe(`${env.WEB_ORIGIN}/login?oauth=error`);
  });

  /* Link mode (?link=1, Settings → Integrations): attaches the provider to
   * the CURRENT session's account instead of find-or-creating a user. Same
   * constraint as above — the provider itself is never called. */
  describe("link mode", () => {
    const configure = () => {
      env.LINKEDIN_CLIENT_ID = "test-client-id";
      env.LINKEDIN_CLIENT_SECRET = "test-client-secret";
    };

    /** Log the user in and return their `tikimiki_refresh=…` cookie pair. */
    async function refreshCookieOf(user: { email: string; password: string }): Promise<string> {
      const res = await http()
        .post("/api/v1/auth/login")
        .send({ email: user.email, password: user.password })
        .expect(200);
      const cookies = res.headers["set-cookie"] as unknown as string[];
      const refresh = cookies.find((c) => c.startsWith("tikimiki_refresh="));
      expect(refresh).toBeTruthy();
      return refresh!.split(";")[0];
    }

    it("redirects a link start without a session to /login?oauth=error", async () => {
      configure();
      const res = await http().get("/api/v1/auth/oauth/linkedin?link=1").expect(302);
      expect(res.headers.location).toBe(`${env.WEB_ORIGIN}/login?oauth=error`);
    });

    it("starts the flow and sets the link cookie when a session exists", async () => {
      configure();
      const user = await registerMember(app);
      const res = await http()
        .get("/api/v1/auth/oauth/linkedin?link=1")
        .set("Cookie", await refreshCookieOf(user))
        .expect(302);
      const location = new URL(res.headers.location);
      expect(location.origin + location.pathname).toBe(
        "https://www.linkedin.com/oauth/v2/authorization",
      );
      const cookies = res.headers["set-cookie"] as unknown as string[];
      expect(cookies.some((c) => c.startsWith("tikimiki_oauth_link=1"))).toBe(true);
    });

    it("redirects link-mode callback failures to /settings, not /login", async () => {
      configure();
      const res = await http()
        .get("/api/v1/auth/oauth/linkedin/callback?code=abc&state=forged")
        .set("Cookie", ["tikimiki_oauth_link=1", "tikimiki_oauth_state=real"].join("; "))
        .expect(302);
      expect(res.headers.location).toBe(`${env.WEB_ORIGIN}/settings?oauth=error`);
    });

    it("a plain (non-link) start clears a stale link cookie", async () => {
      configure();
      const res = await http().get("/api/v1/auth/oauth/linkedin").expect(302);
      const cookies = res.headers["set-cookie"] as unknown as string[];
      expect(cookies.some((c) => c.startsWith("tikimiki_oauth_link=;"))).toBe(true);
    });
  });
});
