import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import {
  resetLoginProtectionState,
} from "./middlewares/login-protection.middleware.js";
import {
  resetImportRateLimiterState,
  resetWriteRateLimiterState,
} from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import { expectErrorResponseWithRequestId, setupTestDb } from "./test-helpers.js";

const expectNoAuthCookies = (response) => {
  const cookies = response.headers["set-cookie"] || [];
  expect(cookies.some((cookie) => cookie.startsWith("cf_access="))).toBe(false);
  expect(cookies.some((cookie) => cookie.startsWith("cf_refresh="))).toBe(false);
};

describe("auth mobile", () => {
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
    await dbQuery("DELETE FROM refresh_tokens");
    await dbQuery("DELETE FROM transactions");
    await dbQuery("DELETE FROM users");
  });

  it("POST /auth/mobile/login retorna tokens no body sem setar cookies", async () => {
    await request(app).post("/auth/register").send({
      email: "mobile-login@controlfinance.dev",
      password: "Senha123",
    });

    const response = await request(app).post("/auth/mobile/login").send({
      email: "mobile-login@controlfinance.dev",
      password: "Senha123",
    });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      email: "mobile-login@controlfinance.dev",
    });
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toEqual(expect.any(String));
    expect(response.body.tokenType).toBe("Bearer");
    expect(response.body.accessToken.length).toBeGreaterThan(10);
    expect(response.body.refreshToken.length).toBeGreaterThan(10);
    expectNoAuthCookies(response);
  });

  it("POST /auth/mobile/login reutiliza a validacao de credenciais", async () => {
    const response = await request(app).post("/auth/mobile/login").send({
      email: "",
      password: "Senha123",
    });

    expectErrorResponseWithRequestId(response, 400, "Email e senha sao obrigatorios.");
  });

  it("POST /auth/mobile/refresh rotaciona refresh token sem setar cookies", async () => {
    await request(app).post("/auth/register").send({
      email: "mobile-refresh@controlfinance.dev",
      password: "Senha123",
    });

    const loginResponse = await request(app).post("/auth/mobile/login").send({
      email: "mobile-refresh@controlfinance.dev",
      password: "Senha123",
    });

    const refreshResponse = await request(app).post("/auth/mobile/refresh").send({
      refreshToken: loginResponse.body.refreshToken,
    });

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.user.email).toBe("mobile-refresh@controlfinance.dev");
    expect(refreshResponse.body.accessToken).toEqual(expect.any(String));
    expect(refreshResponse.body.refreshToken).toEqual(expect.any(String));
    expect(refreshResponse.body.tokenType).toBe("Bearer");
    expect(refreshResponse.body.refreshToken).not.toBe(loginResponse.body.refreshToken);
    expectNoAuthCookies(refreshResponse);
  });

  it("POST /auth/mobile/refresh retorna 401 sem refresh token", async () => {
    const response = await request(app).post("/auth/mobile/refresh").send({});
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Sessao expirada.");
  });

  it("POST /auth/mobile/refresh invalida toda a familia ao reusar token revogado", async () => {
    await request(app).post("/auth/register").send({
      email: "mobile-reuse@controlfinance.dev",
      password: "Senha123",
    });

    const loginResponse = await request(app).post("/auth/mobile/login").send({
      email: "mobile-reuse@controlfinance.dev",
      password: "Senha123",
    });

    const originalRefreshToken = loginResponse.body.refreshToken;

    const firstRotation = await request(app).post("/auth/mobile/refresh").send({
      refreshToken: originalRefreshToken,
    });
    expect(firstRotation.status).toBe(200);

    const rotatedRefreshToken = firstRotation.body.refreshToken;

    const reuseAttempt = await request(app).post("/auth/mobile/refresh").send({
      refreshToken: originalRefreshToken,
    });
    expect(reuseAttempt.status).toBe(401);

    const familyTokenAttempt = await request(app).post("/auth/mobile/refresh").send({
      refreshToken: rotatedRefreshToken,
    });
    expect(familyTokenAttempt.status).toBe(401);
  });

  it("POST /auth/mobile/logout revoga refresh token e retorna 204", async () => {
    await request(app).post("/auth/register").send({
      email: "mobile-logout@controlfinance.dev",
      password: "Senha123",
    });

    const loginResponse = await request(app).post("/auth/mobile/login").send({
      email: "mobile-logout@controlfinance.dev",
      password: "Senha123",
    });

    const logoutResponse = await request(app).post("/auth/mobile/logout").send({
      refreshToken: loginResponse.body.refreshToken,
    });
    expect(logoutResponse.status).toBe(204);

    const refreshAfterLogout = await request(app).post("/auth/mobile/refresh").send({
      refreshToken: loginResponse.body.refreshToken,
    });
    expect(refreshAfterLogout.status).toBe(401);
  });

  it("POST /auth/mobile/logout retorna 204 mesmo sem refresh token", async () => {
    const response = await request(app).post("/auth/mobile/logout").send({});
    expect(response.status).toBe(204);
  });
});
