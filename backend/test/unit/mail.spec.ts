/**
 * Autor: Stevan Gnjato (2023/0141)
 */
import { JwtService } from "@nestjs/jwt";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = {
  NODE_ENV: "test",
  WEB_ORIGIN: "http://localhost:3000",
  JWT_ACCESS_SECRET: "test-secret",
  EMAIL_VERIFY_TTL: 86_400,
  PASSWORD_RESET_TTL: 3_600,
  SMTP_HOST: "smtp.test.local",
  SMTP_PORT: 2525,
  SMTP_USER: "",
  SMTP_PASS: "",
  SMTP_FROM: "tikimiki <no-reply@tikimiki.local>",
};

vi.mock("../../src/config/env", () => ({ env: mockEnv }));

const sendMailMock = vi.fn().mockResolvedValue(undefined);
vi.mock("nodemailer", () => ({ createTransport: vi.fn(() => ({ sendMail: sendMailMock })) }));

const { AccountService } = await import("../../src/auth/account.service");
const { MailService } = await import("../../src/mail/mail.service");

type Row = Record<string, unknown>;

/** Minimalni drizzle stub: svaki select lanac se razrešava u `rows`. */
function fakeDb(rows: Row[] = []) {
  const qb = { from: () => qb, where: () => qb, limit: () => Promise.resolve(rows) };
  return { select: () => qb };
}

// Pravi JwtService potpisuje linkove kao u produkciji (dt06 pokriva sadržaj
// tokena; ovde nas zanima sklapanje mejla).
const jwt = new JwtService();

function makeService(rows: Row[]) {
  return new AccountService(
    fakeDb(rows) as never,
    jwt,
    {} as never,
    new MailService(),
    {} as never,
  );
}

/**
 * Mailer servis (N06) kroz tokove naloga koji ga koriste (N07–N08): za
 * razliku od `mail.service.spec.ts` (MailService izolovano) i
 * `email-verification.spec.ts` (AccountService sa mokovanim MailService-om),
 * ovde AccountService gura mejl kroz PRAVI MailService do mokovanog
 * nodemailer transporta — proverava se ceo šablon → transport lanac.
 */
describe("mailer through account flows (unit)", () => {
  beforeEach(() => {
    sendMailMock.mockClear();
  });

  it("composes the verify-email mail: correct to/subject and the verification link in the body", async () => {
    const svc = makeService([{ isEmailVerified: false, email: "ana@example.com" }]);

    const res = await svc.requestEmailVerification("11111111-1111-1111-1111-111111111111");

    expect(res.alreadyVerified).toBe(false);
    // Van produkcije link iz mejla stiže i kao devLink.
    expect(res.devLink).toMatch(/^http:\/\/localhost:3000\/verify-email\?token=/);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const [message] = sendMailMock.mock.calls[0];
    expect(message.from).toBe("tikimiki <no-reply@tikimiki.local>");
    expect(message.to).toBe("ana@example.com");
    expect(message.subject).toBe("Potvrdi email");
    // Telo sadrži tačno onaj link koji korisnik dobija (isti kao devLink).
    expect(message.html).toContain(res.devLink);
  });

  it("composes the password-reset mail with the reset link for a registered address", async () => {
    const svc = makeService([{ userId: "22222222-2222-2222-2222-222222222222" }]);

    const res = await svc.forgotPassword("mika@example.com");

    expect(res.devLink).toMatch(/^http:\/\/localhost:3000\/reset-password\?token=/);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const [message] = sendMailMock.mock.calls[0];
    expect(message.to).toBe("mika@example.com");
    expect(message.subject).toBe("Reset lozinke");
    expect(message.html).toContain(res.devLink);
  });

  it("sends nothing for an unknown address (must not reveal registration status)", async () => {
    const svc = makeService([]);

    const res = await svc.forgotPassword("nepostojeci@example.com");

    expect(res).toEqual({});
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});
