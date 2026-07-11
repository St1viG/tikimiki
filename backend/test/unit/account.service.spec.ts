/**
 * Autor: Nenad Skoković (2023/0039)
 */
import { describe, expect, it, vi } from "vitest";

const mockEnv = {
  NODE_ENV: "production",
  WEB_ORIGIN: "http://localhost:3000",
  JWT_ACCESS_SECRET: "test-secret",
  EMAIL_VERIFY_TTL: 86_400,
  PASSWORD_RESET_TTL: 3_600,
};

vi.mock("../../src/config/env", () => ({ env: mockEnv }));

const { AccountService } = await import("../../src/auth/account.service");

function fakeDb(row: Record<string, unknown> | undefined) {
  const qb: Record<string, unknown> = {};
  qb.select = vi.fn(() => qb);
  qb.from = vi.fn(() => qb);
  qb.where = vi.fn(() => qb);
  qb.limit = vi.fn(() => Promise.resolve(row ? [row] : []));
  return qb;
}

describe("AccountService.requestEmailVerification — NODE_ENV=production", () => {
  // A real production boot pulls in the DB, Redis, JWT/OAuth config, and the
  // full module graph just to exercise one `if` branch in `deliver()` — a
  // focused unit test isolates that branch without the cost/risk of standing
  // up (or accidentally misconfiguring) a "production" instance of the app.
  it("still sends the real email but omits devLink from the response", async () => {
    mockEnv.NODE_ENV = "production";
    const db = fakeDb({ isEmailVerified: false, email: "prod-test@example.com" });
    const jwt = { signAsync: vi.fn().mockResolvedValue("signed-token") };
    const mail = { sendMail: vi.fn().mockResolvedValue(undefined) };
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const service = new AccountService(db as never, jwt as never, {} as never, mail as never);
    const result = await service.requestEmailVerification("user-1");

    expect(result.alreadyVerified).toBe(false);
    expect(result.devLink).toBeUndefined();
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
    expect(mail.sendMail).toHaveBeenCalledWith(
      "prod-test@example.com",
      "Potvrdi email",
      expect.stringContaining("/verify-email?token=signed-token"),
    );
    // Production must never log the credential-bearing link.
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
