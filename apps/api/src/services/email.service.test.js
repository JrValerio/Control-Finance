import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendFlipNegEmail,
  sendPaydayReminderEmail,
  sendPasswordResetEmail,
} from "./email.service.js";

const sendMailMock = vi.hoisted(() => vi.fn().mockResolvedValue({ messageId: "test-id" }));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: sendMailMock })),
  },
}));

const SMTP_ENV = {
  SMTP_HOST: "smtp.test.dev",
  SMTP_PORT: "587",
  SMTP_USER: "user@test.dev",
  SMTP_PASS: "secret",
};

const configureSmtp = () => Object.assign(process.env, SMTP_ENV);

const clearSmtp = () => {
  for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]) {
    delete process.env[key];
  }
};

describe("email.service", () => {
  beforeEach(() => {
    sendMailMock.mockClear();
    sendMailMock.mockResolvedValue({ messageId: "test-id" });
    clearSmtp();
  });

  afterEach(() => {
    clearSmtp();
  });

  // ─── sendFlipNegEmail ────────────────────────────────────────────────────────

  describe("sendFlipNegEmail", () => {
    it("nao chama sendMail quando SMTP nao esta configurado", async () => {
      await sendFlipNegEmail({
        email: "u@test.dev",
        projectedBalance: -100,
        month: "2026-03",
        daysRemaining: 10,
      });

      expect(sendMailMock).not.toHaveBeenCalled();
    });

    it("chama sendMail com destinatario e assunto corretos quando SMTP configurado", async () => {
      configureSmtp();

      await sendFlipNegEmail({
        email: "u@test.dev",
        projectedBalance: -150.5,
        month: "2026-03",
        daysRemaining: 5,
      });

      expect(sendMailMock).toHaveBeenCalledOnce();
      const [options] = sendMailMock.mock.calls[0];
      expect(options.to).toBe("u@test.dev");
      expect(options.subject).toContain("negativo");
      expect(options.html).toContain("2026-03");
      expect(options.html).toContain("5");
    });

    it("propaga erro quando sendMail falha (SMTP timeout)", async () => {
      configureSmtp();
      sendMailMock.mockRejectedValueOnce(new Error("SMTP timeout"));

      await expect(
        sendFlipNegEmail({
          email: "u@test.dev",
          projectedBalance: -100,
          month: "2026-03",
          daysRemaining: 10,
        }),
      ).rejects.toThrow("SMTP timeout");
    });
  });

  // ─── sendPaydayReminderEmail ─────────────────────────────────────────────────

  describe("sendPaydayReminderEmail", () => {
    it("nao chama sendMail quando SMTP nao esta configurado", async () => {
      await sendPaydayReminderEmail({
        email: "u@test.dev",
        projectedBalance: 500,
        month: "2026-03",
        incomeExpected: 3000,
        daysUntilPayday: 6,
      });

      expect(sendMailMock).not.toHaveBeenCalled();
    });

    it("chama sendMail com dias e mes corretos quando SMTP configurado", async () => {
      configureSmtp();

      await sendPaydayReminderEmail({
        email: "u@test.dev",
        projectedBalance: 500,
        month: "2026-03",
        incomeExpected: 3000,
        daysUntilPayday: 6,
      });

      expect(sendMailMock).toHaveBeenCalledOnce();
      const [options] = sendMailMock.mock.calls[0];
      expect(options.to).toBe("u@test.dev");
      expect(options.subject).toContain("6 dias");
      expect(options.html).toContain("2026-03");
    });
  });

  // ─── sendPasswordResetEmail ──────────────────────────────────────────────────

  describe("sendPasswordResetEmail", () => {
    it("nao chama sendMail quando SMTP nao esta configurado", async () => {
      await sendPasswordResetEmail({
        email: "u@test.dev",
        resetUrl: "http://localhost/reset?token=abc",
      });

      expect(sendMailMock).not.toHaveBeenCalled();
    });

    it("chama sendMail com resetUrl no corpo quando SMTP configurado", async () => {
      configureSmtp();
      const resetUrl = "https://app.control.finance/reset-password?token=abc123";

      await sendPasswordResetEmail({ email: "u@test.dev", resetUrl });

      expect(sendMailMock).toHaveBeenCalledOnce();
      const [options] = sendMailMock.mock.calls[0];
      expect(options.to).toBe("u@test.dev");
      expect(options.html).toContain(resetUrl);
    });

    it("propaga erro quando sendMail falha (SMTP connection refused)", async () => {
      configureSmtp();
      sendMailMock.mockRejectedValueOnce(new Error("Connection refused"));

      await expect(
        sendPasswordResetEmail({
          email: "u@test.dev",
          resetUrl: "http://localhost/reset?token=abc",
        }),
      ).rejects.toThrow("Connection refused");
    });
  });
});
