/**
 * Autor: Nenad Skoković (2023/0039)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = {
  SMTP_HOST: "",
  SMTP_PORT: 587,
  SMTP_USER: "",
  SMTP_PASS: "",
  SMTP_FROM: "tikimiki <no-reply@tikimiki.local>",
};

vi.mock("../../src/config/env", () => ({ env: mockEnv }));

const sendMailMock = vi.fn().mockResolvedValue(undefined);
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
vi.mock("nodemailer", () => ({ createTransport: createTransportMock }));

const { MailService } = await import("../../src/mail/mail.service");

describe("MailService (unit)", () => {
  beforeEach(() => {
    mockEnv.SMTP_HOST = "";
    mockEnv.SMTP_PORT = 587;
    mockEnv.SMTP_USER = "";
    mockEnv.SMTP_PASS = "";
    mockEnv.SMTP_FROM = "tikimiki <no-reply@tikimiki.local>";
    createTransportMock.mockClear();
    sendMailMock.mockClear();
  });

  it("logs and no-ops when SMTP_HOST is blank (dev-friendly, no network call)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const service = new MailService();

    await expect(service.sendMail("a@b.com", "Hi", "<p>hi</p>")).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[mail] (no SMTP configured)"));
    expect(createTransportMock).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("sends via nodemailer with the configured host/port/auth when SMTP_HOST is set", async () => {
    mockEnv.SMTP_HOST = "smtp.example.com";
    mockEnv.SMTP_PORT = 2525;
    mockEnv.SMTP_USER = "user";
    mockEnv.SMTP_PASS = "pass";

    const service = new MailService();
    await service.sendMail("to@example.com", "Subject", "<p>Body</p>");

    expect(createTransportMock).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 2525,
      auth: { user: "user", pass: "pass" },
    });
    expect(sendMailMock).toHaveBeenCalledWith({
      from: "tikimiki <no-reply@tikimiki.local>",
      to: "to@example.com",
      subject: "Subject",
      html: "<p>Body</p>",
    });
  });

  it("creates the transporter lazily and reuses it across calls", async () => {
    mockEnv.SMTP_HOST = "smtp.example.com";
    const service = new MailService();

    await service.sendMail("a@b.com", "s1", "h1");
    await service.sendMail("a@b.com", "s2", "h2");

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledTimes(2);
  });
});
