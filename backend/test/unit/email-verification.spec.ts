/**
 * Autor: Dimitrije Pesic (2023/0014)
 */
import { BadRequestException, ConflictException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = {
  NODE_ENV: "test",
  WEB_ORIGIN: "http://localhost:3000",
  JWT_ACCESS_SECRET: "test-secret",
  EMAIL_VERIFY_TTL: 86_400,
  PASSWORD_RESET_TTL: 3_600,
};

vi.mock("../../src/config/env", () => ({ env: mockEnv }));

const { AccountService } = await import("../../src/auth/account.service");

type Row = Record<string, unknown>;

interface CapturedUpdate {
  values: Row;
  where: SQL | undefined;
}

/** Select chains resolve to `rows`; every `update().set().where()` is captured. */
function fakeDb(rows: Row[] = []) {
  const updates: CapturedUpdate[] = [];
  const db = {
    select: () => {
      const qb = { from: () => qb, where: () => qb, limit: () => Promise.resolve(rows) };
      return qb;
    },
    update: () => ({
      set(values: Row) {
        return {
          where(condition: SQL | undefined) {
            updates.push({ values, where: condition });
            return Promise.resolve([]);
          },
        };
      },
    }),
  };
  return { db, updates };
}

const dialect = new PgDialect();

function renderWhere(update: CapturedUpdate) {
  if (!update.where) throw new Error("update captured no where clause");
  return dialect.sqlToQuery(update.where);
}

function tokenFrom(devLink: string | undefined): string {
  const token = devLink ? new URL(devLink).searchParams.get("token") : null;
  if (!token) throw new Error("dev link carries no token");
  return token;
}

// A real JwtService signs and verifies the stateless links end to end.
const jwt = new JwtService();

function makeService(db: unknown, mail: { sendMail: ReturnType<typeof vi.fn> }) {
  return new AccountService(db as never, jwt, {} as never, mail as never, {} as never);
}

function mailMock() {
  return { sendMail: vi.fn().mockResolvedValue(undefined) };
}

describe("AccountService email verification (unit)", () => {
  beforeEach(() => {
    // deliver() logs every dev link; keep test output quiet.
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("requestEmailVerification", () => {
    it("signs an email_verify token and mails the link to the user's address", async () => {
      const { db } = fakeDb([{ isEmailVerified: false, email: "ana@example.com" }]);
      const mail = mailMock();

      const result = await makeService(db, mail).requestEmailVerification("user-1");

      expect(result.alreadyVerified).toBe(false);
      const payload = jwt.decode(tokenFrom(result.devLink)) as {
        sub: string;
        typ: string;
        iat: number;
        exp: number;
      };
      expect(payload.sub).toBe("user-1");
      expect(payload.typ).toBe("email_verify");
      expect(payload.exp - payload.iat).toBe(mockEnv.EMAIL_VERIFY_TTL);
      expect(mail.sendMail).toHaveBeenCalledTimes(1);
      expect(mail.sendMail).toHaveBeenCalledWith(
        "ana@example.com",
        "Potvrdi email",
        expect.stringContaining(result.devLink as string),
      );
    });

    it("returns the dev link outside production and logs it", async () => {
      const { db } = fakeDb([{ isEmailVerified: false, email: "ana@example.com" }]);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

      const result = await makeService(db, mailMock()).requestEmailVerification("user-1");

      expect(result.devLink).toContain("/verify-email?token=");
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(result.devLink as string));
    });

    it("short-circuits when the email is already verified", async () => {
      const { db, updates } = fakeDb([{ isEmailVerified: true, email: "ana@example.com" }]);
      const mail = mailMock();

      const result = await makeService(db, mail).requestEmailVerification("user-1");

      expect(result).toEqual({ alreadyVerified: true });
      expect(mail.sendMail).not.toHaveBeenCalled();
      expect(updates).toEqual([]);
    });

    it("rejects an unknown user", async () => {
      const { db } = fakeDb([]);

      await expect(makeService(db, mailMock()).requestEmailVerification("ghost")).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("confirmEmailVerification", () => {
    it("marks the token's user as verified on the full request → confirm round trip", async () => {
      const { db, updates } = fakeDb([{ isEmailVerified: false, email: "ana@example.com" }]);
      const service = makeService(db, mailMock());
      const { devLink } = await service.requestEmailVerification("user-1");

      const result = await service.confirmEmailVerification(tokenFrom(devLink));

      expect(result).toEqual({ success: true });
      expect(updates).toHaveLength(1);
      expect(updates[0].values.isEmailVerified).toBe(true);
      expect(updates[0].values.updatedAt).toBeInstanceOf(Date);
      const where = renderWhere(updates[0]);
      expect(where.sql).toContain('"user_id" =');
      expect(where.params).toEqual(["user-1"]);
    });

    it("rejects a garbage token", async () => {
      const { db, updates } = fakeDb();

      await expect(
        makeService(db, mailMock()).confirmEmailVerification("nije-token"),
      ).rejects.toThrow(new BadRequestException("Invalid or expired token"));
      expect(updates).toEqual([]);
    });

    it("rejects a token signed for another purpose", async () => {
      const { db, updates } = fakeDb();
      const resetToken = await jwt.signAsync(
        { sub: "user-1", typ: "password_reset" },
        { secret: mockEnv.JWT_ACCESS_SECRET, expiresIn: 60 },
      );

      await expect(
        makeService(db, mailMock()).confirmEmailVerification(resetToken),
      ).rejects.toThrow(BadRequestException);
      expect(updates).toEqual([]);
    });

    it("rejects an expired token", async () => {
      const { db, updates } = fakeDb();
      const expiredToken = await jwt.signAsync(
        { sub: "user-1", typ: "email_verify" },
        { secret: mockEnv.JWT_ACCESS_SECRET, expiresIn: -10 },
      );

      await expect(
        makeService(db, mailMock()).confirmEmailVerification(expiredToken),
      ).rejects.toThrow(BadRequestException);
      expect(updates).toEqual([]);
    });
  });

  describe("changeEmail", () => {
    it("stores the new address as unverified and sends a fresh verification link", async () => {
      const { db, updates } = fakeDb([]); // no clash on the new email
      const mail = mailMock();

      const result = await makeService(db, mail).changeEmail("user-1", "novi@example.com");

      expect(result.success).toBe(true);
      expect(result.devLink).toContain("/verify-email?token=");
      expect(updates).toHaveLength(1);
      expect(updates[0].values).toMatchObject({
        email: "novi@example.com",
        isEmailVerified: false,
      });
      expect(renderWhere(updates[0]).params).toEqual(["user-1"]);
      expect(mail.sendMail).toHaveBeenCalledWith(
        "novi@example.com",
        "Potvrdi email",
        expect.stringContaining(result.devLink as string),
      );
    });

    it("rejects an email already used by another account", async () => {
      const { db, updates } = fakeDb([{ userId: "somebody-else" }]);
      const mail = mailMock();

      await expect(
        makeService(db, mail).changeEmail("user-1", "zauzet@example.com"),
      ).rejects.toThrow(ConflictException);
      expect(mail.sendMail).not.toHaveBeenCalled();
      expect(updates).toEqual([]);
    });

    it("allows re-submitting the caller's own current email", async () => {
      const { db, updates } = fakeDb([{ userId: "user-1" }]);

      const result = await makeService(db, mailMock()).changeEmail("user-1", "ana@example.com");

      expect(result.success).toBe(true);
      expect(updates).toHaveLength(1);
    });
  });
});
