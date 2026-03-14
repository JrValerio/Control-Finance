import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import {
  setupTestDb,
  registerAndLogin,
  expectErrorResponseWithRequestId,
  extractAccessToken,
} from "./test-helpers.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import {
  resetImportRateLimiterState,
  resetWriteRateLimiterState,
} from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";

const GOOGLE_ONLY_EMAIL = "googleonly@passwordtest.dev";
const GOOGLE_ONLY_SUB = "google-sub-password-test";

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    verifyIdToken: vi.fn().mockResolvedValue({
      getPayload: () => ({
        sub: GOOGLE_ONLY_SUB,
        email: GOOGLE_ONLY_EMAIL,
        name: "Google Only User",
      }),
    }),
  })),
}));

describe("PATCH /auth/password", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await clearDbClientForTests();
  });

  beforeEach(async () => {
    resetLoginProtectionState();
    resetImportRateLimiterState();
    resetWriteRateLimiterState();
    resetHttpMetricsForTests();
    await dbQuery("DELETE FROM transactions");
    await dbQuery("DELETE FROM user_identities");
    await dbQuery("DELETE FROM users");
  });

  it("retorna 401 quando nao autenticado", async () => {
    const response = await request(app)
      .patch("/auth/password")
      .send({ newPassword: "Senha123" });

    expect(response.status).toBe(401);
  });

  it("usuario com senha pode alterar com currentPassword correto", async () => {
    const token = await registerAndLogin("user@test.dev", "Senha123");

    const response = await request(app)
      .patch("/auth/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "Senha123", newPassword: "NovaSenha456" });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Senha atualizada com sucesso.");

    // Confirm new password works for login
    const loginResponse = await request(app)
      .post("/auth/login")
      .send({ email: "user@test.dev", password: "NovaSenha456" });
    expect(loginResponse.status).toBe(200);
  });

  it("retorna 400 quando currentPassword ausente para usuario com senha", async () => {
    const token = await registerAndLogin("user@test.dev", "Senha123");

    const response = await request(app)
      .patch("/auth/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ newPassword: "NovaSenha456" });

    expectErrorResponseWithRequestId(response, 400, "Senha atual e obrigatoria.");
  });

  it("retorna 401 quando currentPassword incorreto", async () => {
    const token = await registerAndLogin("user@test.dev", "Senha123");

    const response = await request(app)
      .patch("/auth/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "SenhaErrada", newPassword: "NovaSenha456" });

    expectErrorResponseWithRequestId(response, 401, "Senha atual incorreta.");
  });

  it("retorna 400 quando newPassword e fraca", async () => {
    const token = await registerAndLogin("user@test.dev", "Senha123");

    const response = await request(app)
      .patch("/auth/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "Senha123", newPassword: "fraca" });

    expect(response.status).toBe(400);
  });

  it("retorna 400 quando newPassword ausente", async () => {
    const token = await registerAndLogin("user@test.dev", "Senha123");

    const response = await request(app)
      .patch("/auth/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "Senha123" });

    expectErrorResponseWithRequestId(response, 400, "Nova senha e obrigatoria.");
  });

  it("usuario Google-only pode definir senha sem currentPassword", async () => {
    // Create Google-only user via POST /auth/google
    const googleResponse = await request(app)
      .post("/auth/google")
      .send({ idToken: "valid-google-token" });
    expect(googleResponse.status).toBe(200);
    const token = extractAccessToken(googleResponse);

    const response = await request(app)
      .patch("/auth/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ newPassword: "NovaSenha789" });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Senha atualizada com sucesso.");

    // Confirm password login now works for this account
    const loginResponse = await request(app)
      .post("/auth/login")
      .send({ email: GOOGLE_ONLY_EMAIL, password: "NovaSenha789" });
    expect(loginResponse.status).toBe(200);
  });
});
