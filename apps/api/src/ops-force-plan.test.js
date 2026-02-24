import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import {
  resetImportRateLimiterState,
  resetWriteRateLimiterState,
} from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import {
  expectErrorResponseWithRequestId,
  getUserIdByEmail,
  registerAndLogin,
  setupTestDb,
} from "./test-helpers.js";

const OPS_TOKEN_TEST = "ops-token-test";

describe("ops force-plan", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalOpsToken = process.env.OPS_TOKEN;

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.OPS_TOKEN = originalOpsToken;
    await clearDbClientForTests();
  });

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    process.env.OPS_TOKEN = OPS_TOKEN_TEST;

    resetLoginProtectionState();
    resetImportRateLimiterState();
    resetWriteRateLimiterState();
    resetHttpMetricsForTests();

    await dbQuery("DELETE FROM subscriptions");
    await dbQuery("DELETE FROM transactions");
    await dbQuery("DELETE FROM users");
  });

  it("POST /ops/force-plan retorna 401 sem x-ops-token", async () => {
    const response = await request(app).post("/ops/force-plan").send({
      email: "ops-no-token@controlfinance.dev",
      plan: "pro",
    });

    expectErrorResponseWithRequestId(response, 401, "Ops token ausente ou invalido.");
  });

  it("POST /ops/force-plan retorna 404 quando OPS_TOKEN nao esta configurado", async () => {
    delete process.env.OPS_TOKEN;

    const response = await request(app)
      .post("/ops/force-plan")
      .set("x-ops-token", OPS_TOKEN_TEST)
      .send({
        email: "ops-no-env@controlfinance.dev",
        plan: "pro",
      });

    expectErrorResponseWithRequestId(response, 404, "Route not found");
  });

  it("POST /ops/force-plan retorna 404 em NODE_ENV=production", async () => {
    process.env.NODE_ENV = "production";

    const response = await request(app)
      .post("/ops/force-plan")
      .set("x-ops-token", OPS_TOKEN_TEST)
      .send({
        email: "ops-production@controlfinance.dev",
        plan: "pro",
      });

    expectErrorResponseWithRequestId(response, 404, "Route not found");
  });

  it("POST /ops/force-plan retorna 422 para plan diferente de pro", async () => {
    const response = await request(app)
      .post("/ops/force-plan")
      .set("x-ops-token", OPS_TOKEN_TEST)
      .send({
        email: "ops-invalid-plan@controlfinance.dev",
        plan: "free",
      });

    expectErrorResponseWithRequestId(response, 422, "plan deve ser 'pro'.");
  });

  it("promove usuario para pro e /billing/subscription retorna salary_annual=true", async () => {
    const email = "ops-force-pro@controlfinance.dev";
    const token = await registerAndLogin(email);
    const userId = await getUserIdByEmail(email);

    await dbQuery(
      `UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
      [userId],
    );

    const preResponse = await request(app)
      .get("/billing/subscription")
      .set("Authorization", `Bearer ${token}`);

    expect(preResponse.status).toBe(200);
    expect(preResponse.body.plan).toBe("free");
    expect(preResponse.body.features.salary_annual).toBe(false);

    const forceResponse = await request(app)
      .post("/ops/force-plan")
      .set("x-ops-token", OPS_TOKEN_TEST)
      .send({
        email,
        plan: "pro",
      });

    expect(forceResponse.status).toBe(200);
    expect(forceResponse.body).toMatchObject({
      email,
      plan: "pro",
      status: "active",
    });

    const postResponse = await request(app)
      .get("/billing/subscription")
      .set("Authorization", `Bearer ${token}`);

    expect(postResponse.status).toBe(200);
    expect(postResponse.body.plan).toBe("pro");
    expect(postResponse.body.features.salary_annual).toBe(true);
    expect(postResponse.body.subscription).toMatchObject({
      status: "active",
    });
  });
});

