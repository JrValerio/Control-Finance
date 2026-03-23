import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import { resetImportRateLimiterState, resetWriteRateLimiterState } from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import { registerAndLogin, setupTestDb } from "./test-helpers.js";

describe("POST /analytics/paywall", () => {
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
    await dbQuery("DELETE FROM paywall_events");
    await dbQuery("DELETE FROM refresh_tokens");
    await dbQuery("DELETE FROM users");
  });

  it("retorna 401 sem autenticacao", async () => {
    const response = await request(app)
      .post("/analytics/paywall")
      .send({ feature: "csv_export", action: "viewed", context: "feature_gate" });

    expect(response.status).toBe(401);
  });

  it("registra evento valido e retorna 201", async () => {
    const token = await registerAndLogin("user@test.com");

    const response = await request(app)
      .post("/analytics/paywall")
      .set("Cookie", [`cf_access=${token}`])
      .send({ feature: "csv_export", action: "viewed", context: "feature_gate" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      feature: "csv_export",
      action: "viewed",
      context: "feature_gate",
    });
    expect(response.body.id).toBeDefined();
    expect(response.body.created_at).toBeDefined();
  });

  it("aceita todos os valores validos de feature", async () => {
    const token = await registerAndLogin("user2@test.com");
    const features = ["csv_import", "csv_export", "forecast", "analytics_trend", "salary", "unknown"];

    for (const feature of features) {
      const response = await request(app)
        .post("/analytics/paywall")
        .set("Cookie", [`cf_access=${token}`])
        .send({ feature, action: "viewed", context: "feature_gate" });

      expect(response.status).toBe(201);
    }
  });

  it("aceita todas as actions validas", async () => {
    const token = await registerAndLogin("user3@test.com");
    const actions = ["viewed", "clicked_upgrade", "dismissed"];

    for (const action of actions) {
      const response = await request(app)
        .post("/analytics/paywall")
        .set("Cookie", [`cf_access=${token}`])
        .send({ feature: "forecast", action, context: "feature_gate" });

      expect(response.status).toBe(201);
    }
  });

  it("retorna 400 para feature invalida", async () => {
    const token = await registerAndLogin("user4@test.com");

    const response = await request(app)
      .post("/analytics/paywall")
      .set("Cookie", [`cf_access=${token}`])
      .send({ feature: "invalid_feature", action: "viewed", context: "feature_gate" });

    expect(response.status).toBe(400);
  });

  it("retorna 400 para action invalida", async () => {
    const token = await registerAndLogin("user5@test.com");

    const response = await request(app)
      .post("/analytics/paywall")
      .set("Cookie", [`cf_access=${token}`])
      .send({ feature: "csv_export", action: "invalid_action", context: "feature_gate" });

    expect(response.status).toBe(400);
  });

  it("retorna 400 para context invalido", async () => {
    const token = await registerAndLogin("user6@test.com");

    const response = await request(app)
      .post("/analytics/paywall")
      .set("Cookie", [`cf_access=${token}`])
      .send({ feature: "csv_export", action: "viewed", context: "invalid_context" });

    expect(response.status).toBe(400);
  });

  it("persiste o user_id correto no banco", async () => {
    const token = await registerAndLogin("user7@test.com");

    await request(app)
      .post("/analytics/paywall")
      .set("Cookie", [`cf_access=${token}`])
      .send({ feature: "salary", action: "clicked_upgrade", context: "trial_expired" });

    const result = await dbQuery(
      "SELECT * FROM paywall_events WHERE feature = 'salary' AND action = 'clicked_upgrade'",
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].context).toBe("trial_expired");
    expect(result.rows[0].user_id).toBeGreaterThan(0);
  });
});
