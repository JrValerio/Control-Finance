import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import {
  LOGIN_THROTTLE_MESSAGE,
  resetLoginProtectionState,
} from "./middlewares/login-protection.middleware.js";
import {
  resetImportRateLimiterState,
  resetWriteRateLimiterState,
} from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import {
  expectErrorResponseWithRequestId,
  extractAccessToken,
  setupTestDb,
  snapshotAuthSecurityEnv,
  restoreAuthSecurityEnv,
} from "./test-helpers.js";

// Helper: extract cf_refresh raw value from Set-Cookie header
const extractRefreshToken = (response) => {
  const cookies = response.headers["set-cookie"] || [];
  const refreshCookie = cookies.find((c) => c.startsWith("cf_refresh="));
  if (!refreshCookie) return null;
  return refreshCookie.split(";")[0].split("=")[1];
};

// Helper: assert both auth cookies are present on a response
const expectAuthCookies = (response) => {
  const cookies = response.headers["set-cookie"] || [];
  expect(cookies.some((c) => c.startsWith("cf_access="))).toBe(true);
  expect(cookies.some((c) => c.startsWith("cf_refresh="))).toBe(true);
};

// Helper: assert both auth cookies are cleared (maxAge=0)
const expectClearedCookies = (response) => {
  const cookies = response.headers["set-cookie"] || [];
  const access = cookies.find((c) => c.startsWith("cf_access="));
  const refresh = cookies.find((c) => c.startsWith("cf_refresh="));
  expect(access).toBeDefined();
  expect(refresh).toBeDefined();
  expect(access).toMatch(/Max-Age=0/i);
  expect(refresh).toMatch(/Max-Age=0/i);
};

describe("auth", () => {
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

  // ─── Register ───────────────────────────────────────────────────────────────

  it("POST /auth/register cria usuario e seta cookies", async () => {
    const response = await request(app).post("/auth/register").send({
      name: "Junior",
      email: "jr@controlfinance.dev",
      password: "Senha123",
    });

    expect(response.status).toBe(201);
    expect(response.body.token).toBeUndefined();
    expect(response.body.user).toMatchObject({
      name: "Junior",
      email: "jr@controlfinance.dev",
    });
    expect(Number.isInteger(response.body.user.id)).toBe(true);
    expect(response.body.user.id).toBeGreaterThan(0);
    expect(response.body.user.password_hash).toBeUndefined();
    expectAuthCookies(response);

    const token = extractAccessToken(response);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(10);
  });

  it("POST /auth/register bloqueia email duplicado", async () => {
    await request(app).post("/auth/register").send({
      email: "duplicado@controlfinance.dev",
      password: "Senha123",
    });

    const response = await request(app).post("/auth/register").send({
      email: "duplicado@controlfinance.dev",
      password: "Senha123",
    });

    expectErrorResponseWithRequestId(response, 409, "Usuario ja cadastrado.");
  });

  it("POST /auth/register retorna erro quando email esta vazio", async () => {
    const response = await request(app).post("/auth/register").send({
      email: "",
      password: "Senha123",
    });

    expectErrorResponseWithRequestId(response, 400, "Email e senha sao obrigatorios.");
  });

  it("POST /auth/register retorna erro quando senha esta vazia", async () => {
    const response = await request(app).post("/auth/register").send({
      email: "vazio-register@controlfinance.dev",
      password: "",
    });

    expectErrorResponseWithRequestId(response, 400, "Email e senha sao obrigatorios.");
  });

  // ─── Login ──────────────────────────────────────────────────────────────────

  it("POST /auth/login seta cookies e nao retorna token no body", async () => {
    await request(app).post("/auth/register").send({
      email: "login@controlfinance.dev",
      password: "Senha123",
    });

    const response = await request(app).post("/auth/login").send({
      email: "login@controlfinance.dev",
      password: "Senha123",
    });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe("login@controlfinance.dev");
    expect(response.body.token).toBeUndefined();
    expect(response.body.user.password_hash).toBeUndefined();
    expectAuthCookies(response);

    const token = extractAccessToken(response);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(10);
  });

  it("POST /auth/login retorna erro quando email esta vazio", async () => {
    const response = await request(app).post("/auth/login").send({
      email: "",
      password: "Senha123",
    });

    expectErrorResponseWithRequestId(response, 400, "Email e senha sao obrigatorios.");
  });

  it("POST /auth/login retorna erro quando senha esta vazia", async () => {
    const response = await request(app).post("/auth/login").send({
      email: "vazio-login@controlfinance.dev",
      password: "",
    });

    expectErrorResponseWithRequestId(response, 400, "Email e senha sao obrigatorios.");
  });

  // ─── Brute-force protection ──────────────────────────────────────────────────

  it("aplica bloqueio por brute force e desbloqueia apos janela", async () => {
    const envSnapshot = snapshotAuthSecurityEnv();
    const lockWindowInMs = 1000;
    let now = Date.parse("2026-01-01T00:00:00.000Z");
    const dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);

    process.env.AUTH_BRUTE_FORCE_MAX_ATTEMPTS = "2";
    process.env.AUTH_BRUTE_FORCE_WINDOW_MS = String(lockWindowInMs);
    process.env.AUTH_BRUTE_FORCE_LOCK_MS = String(lockWindowInMs);
    resetLoginProtectionState();

    try {
      await request(app).post("/auth/register").send({
        email: "brute-window@controlfinance.dev",
        password: "Senha123",
      });

      const invalidCredentials = {
        email: "brute-window@controlfinance.dev",
        password: "Senha999",
      };

      const firstFailure = await request(app).post("/auth/login").send(invalidCredentials);
      const secondFailure = await request(app)
        .post("/auth/login")
        .send(invalidCredentials);
      const blockedAttempt = await request(app)
        .post("/auth/login")
        .send(invalidCredentials);

      expect(firstFailure.status).toBe(401);
      expect(secondFailure.status).toBe(401);
      expect(blockedAttempt.status).toBe(429);
      expect(blockedAttempt.body.message).toBe(LOGIN_THROTTLE_MESSAGE);

      now += lockWindowInMs + 1;

      const unlockedAttempt = await request(app)
        .post("/auth/login")
        .send(invalidCredentials);

      expect(unlockedAttempt.status).toBe(401);
    } finally {
      dateNowSpy.mockRestore();
      restoreAuthSecurityEnv(envSnapshot);
      resetLoginProtectionState();
    }
  });

  it("isola bloqueio por combinacao de IP + email", async () => {
    const envSnapshot = snapshotAuthSecurityEnv();
    process.env.AUTH_BRUTE_FORCE_MAX_ATTEMPTS = "2";
    process.env.AUTH_BRUTE_FORCE_WINDOW_MS = "1000";
    process.env.AUTH_BRUTE_FORCE_LOCK_MS = "1000";

    try {
      await request(app).post("/auth/register").send({
        email: "brute-a@controlfinance.dev",
        password: "Senha123",
      });

      await request(app).post("/auth/register").send({
        email: "brute-b@controlfinance.dev",
        password: "Senha123",
      });

      const invalidForUserA = {
        email: "brute-a@controlfinance.dev",
        password: "Senha999",
      };

      await request(app).post("/auth/login").send(invalidForUserA);
      await request(app).post("/auth/login").send(invalidForUserA);

      const blockedUserA = await request(app).post("/auth/login").send(invalidForUserA);
      expect(blockedUserA.status).toBe(429);

      const invalidForUserB = await request(app).post("/auth/login").send({
        email: "brute-b@controlfinance.dev",
        password: "Senha999",
      });

      expect(invalidForUserB.status).toBe(401);
    } finally {
      restoreAuthSecurityEnv(envSnapshot);
      resetLoginProtectionState();
    }
  });

  // ─── Password rules ──────────────────────────────────────────────────────────

  it.each([
    ["12345678", "somente-numeros"],
    ["abcdefgh", "somente-letras"],
    ["abc123", "menos-8"],
  ])(
    "POST /auth/register bloqueia senha fraca (%s - %s)",
    async (password, label) => {
      const response = await request(app).post("/auth/register").send({
        email: `fraca-${label}@controlfinance.dev`,
        password,
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        "Senha fraca: use no minimo 8 caracteres com letras e numeros.",
      );
    },
  );

  it("POST /auth/register aceita senha forte", async () => {
    const response = await request(app).post("/auth/register").send({
      email: "forte@controlfinance.dev",
      password: "abc12345",
    });

    expect(response.status).toBe(201);
  });

  // ─── /auth/me ────────────────────────────────────────────────────────────────

  it("GET /auth/me retorna 401 sem token", async () => {
    const response = await request(app).get("/auth/me");
    expect(response.status).toBe(401);
  });

  it("GET /auth/me retorna id e email com bearer token (fallback)", async () => {
    const reg = await request(app)
      .post("/auth/register")
      .send({ email: "me@controlfinance.dev", password: "Senha123" });

    const token = extractAccessToken(reg);

    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.email).toBe("me@controlfinance.dev");
    expect(Number.isInteger(response.body.id)).toBe(true);
    expect(response.body.id).toBeGreaterThan(0);
  });

  // ─── /auth/refresh ──────────────────────────────────────────────────────────

  it("POST /auth/refresh emite novos cookies com refresh token valido", async () => {
    const loginRes = await request(app).post("/auth/register").send({
      email: "refresh@controlfinance.dev",
      password: "Senha123",
    });
    const refreshToken = extractRefreshToken(loginRes);

    const refreshRes = await request(app)
      .post("/auth/refresh")
      .set("Cookie", `cf_refresh=${refreshToken}`);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.user.email).toBe("refresh@controlfinance.dev");
    expectAuthCookies(refreshRes);

    const newRefreshToken = extractRefreshToken(refreshRes);
    expect(newRefreshToken).not.toBe(refreshToken);
  });

  it("POST /auth/refresh retorna 401 sem cookie", async () => {
    const response = await request(app).post("/auth/refresh");
    expect(response.status).toBe(401);
  });

  it("POST /auth/refresh retorna 401 com token invalido", async () => {
    const response = await request(app)
      .post("/auth/refresh")
      .set("Cookie", "cf_refresh=token-invalido-qualquer");
    expect(response.status).toBe(401);
  });

  it("POST /auth/refresh invalida toda a familia ao reusar token revogado", async () => {
    const loginRes = await request(app).post("/auth/register").send({
      email: "reuse@controlfinance.dev",
      password: "Senha123",
    });
    const originalRefresh = extractRefreshToken(loginRes);

    // First rotation — original token is now revoked
    const firstRefresh = await request(app)
      .post("/auth/refresh")
      .set("Cookie", `cf_refresh=${originalRefresh}`);
    expect(firstRefresh.status).toBe(200);

    const rotatedRefresh = extractRefreshToken(firstRefresh);

    // Replay the already-revoked original token — triggers family revocation
    const reuseAttempt = await request(app)
      .post("/auth/refresh")
      .set("Cookie", `cf_refresh=${originalRefresh}`);
    expect(reuseAttempt.status).toBe(401);

    // The rotated token (from the same family) is also now invalid
    const familyTokenAttempt = await request(app)
      .post("/auth/refresh")
      .set("Cookie", `cf_refresh=${rotatedRefresh}`);
    expect(familyTokenAttempt.status).toBe(401);
  });

  // ─── /auth/logout ────────────────────────────────────────────────────────────

  it("DELETE /auth/logout limpa cookies e retorna 204", async () => {
    const loginRes = await request(app).post("/auth/register").send({
      email: "logout@controlfinance.dev",
      password: "Senha123",
    });
    const refreshToken = extractRefreshToken(loginRes);

    const logoutRes = await request(app)
      .delete("/auth/logout")
      .set("Cookie", `cf_refresh=${refreshToken}`);

    expect(logoutRes.status).toBe(204);
    expectClearedCookies(logoutRes);
  });

  it("DELETE /auth/logout retorna 204 mesmo sem cookie (idempotente)", async () => {
    const response = await request(app).delete("/auth/logout");
    expect(response.status).toBe(204);
  });

  it("DELETE /auth/logout revoga refresh token (nao pode ser reusado)", async () => {
    const loginRes = await request(app).post("/auth/register").send({
      email: "logout-revoke@controlfinance.dev",
      password: "Senha123",
    });
    const refreshToken = extractRefreshToken(loginRes);

    await request(app)
      .delete("/auth/logout")
      .set("Cookie", `cf_refresh=${refreshToken}`);

    const refreshAfterLogout = await request(app)
      .post("/auth/refresh")
      .set("Cookie", `cf_refresh=${refreshToken}`);

    expect(refreshAfterLogout.status).toBe(401);
  });
});
