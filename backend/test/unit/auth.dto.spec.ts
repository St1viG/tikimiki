import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "../../src/auth/dto";

describe("registerSchema", () => {
  const base = {
    username: "valid_user",
    email: "a@example.com",
    password: "password123",
  };

  it("accepts a valid member registration and defaults accountType to member", () => {
    const r = registerSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.accountType).toBe("member");
  });

  it("rejects passwords shorter than 8 characters", () => {
    expect(registerSchema.safeParse({ ...base, password: "short1" }).success).toBe(false);
  });

  it("rejects usernames with illegal characters", () => {
    expect(registerSchema.safeParse({ ...base, username: "bad name!" }).success).toBe(false);
  });

  it("rejects usernames shorter than 3 characters", () => {
    expect(registerSchema.safeParse({ ...base, username: "ab" }).success).toBe(false);
  });

  it("requires organizationName for organization accounts", () => {
    const r = registerSchema.safeParse({
      ...base,
      accountType: "organization",
    });
    expect(r.success).toBe(false);
  });

  it("accepts an organization account that supplies a name", () => {
    const r = registerSchema.safeParse({
      ...base,
      accountType: "organization",
      organizationName: "ACME Labs",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a malformed email", () => {
    expect(registerSchema.safeParse({ ...base, email: "not-an-email" }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts an email and a non-empty password", () => {
    expect(loginSchema.safeParse({ email: "a@example.com", password: "x" }).success).toBe(true);
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ email: "a@example.com", password: "" }).success).toBe(false);
  });

  it("rejects a missing email", () => {
    expect(loginSchema.safeParse({ password: "x" }).success).toBe(false);
  });
});
