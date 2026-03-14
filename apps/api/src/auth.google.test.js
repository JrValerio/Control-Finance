import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import {
  setupTestDb,
  expectErrorResponseWithRequestId,
  extractAccessToken,
} from "./test-helpers.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import {
  resetImportRateLimiterState,
  resetWriteRateLimiterState,
} from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";

const FAKE_GOOGLE_SUB = "google-sub-123456";
const FAKE_EMAIL = "googleuser@gmail.com";
const FAKE_NAME = "Google User";

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    verifyIdToken: vi.fn().mockResolvedValue({
      getPayload: () => ({
        sub: FAKE_GOOGLE_SUB,
        email: FAKE_EMAIL,
        name: FAKE_NAME,
      }),
    }),
  })),
}));

describe("POST /auth/google", () => {
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

  it("cria novo usuario, seta cookies e nao retorna token no body", async () => {
    const response = await request(app)
      .post("/auth/google")
      .send({ idToken: "valid-google-id-token" });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeUndefined();
    expect(response.body.user.email).toBe(FAKE_EMAIL);
    expect(response.body.user.name).toBe(FAKE_NAME);
    expect(Number.isInteger(response.body.user.id)).toBe(true);
    expect(response.body.user.id).toBeGreaterThan(0);
    expect(response.body.user.password_hash).toBeUndefined();

    const token = extractAccessToken(response);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(10);
  });

  it("retorna mesmo usuario em login subsequente com mesma identidade Google", async () => {
    const first = await request(app)
      .post("/auth/google")
      .send({ idToken: "valid-google-id-token" });

    const second = await request(app)
      .post("/auth/google")
      .send({ idToken: "valid-google-id-token" });

    expect(second.status).toBe(200);
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(second.body.user.email).toBe(FAKE_EMAIL);
  });

  it("vincula identidade Google a conta existente com mesmo email", async () => {
    // Pre-existing email+password account
    await request(app).post("/auth/register").send({
      email: FAKE_EMAIL,
      password: "Senha123",
    });

    const response = await request(app)
      .post("/auth/google")
      .send({ idToken: "valid-google-id-token" });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(FAKE_EMAIL);

    // Subsequent Google login must resolve same account
    const second = await request(app)
      .post("/auth/google")
      .send({ idToken: "valid-google-id-token" });

    expect(second.status).toBe(200);
    expect(second.body.user.id).toBe(response.body.user.id);
  });

  it("retorna 400 quando idToken esta ausente", async () => {
    const response = await request(app).post("/auth/google").send({});

    expectErrorResponseWithRequestId(response, 400, "Token Google ausente ou invalido.");
  });

  it("retorna 400 quando idToken e string vazia", async () => {
    const response = await request(app)
      .post("/auth/google")
      .send({ idToken: "" });

    expectErrorResponseWithRequestId(response, 400, "Token Google ausente ou invalido.");
  });
});
