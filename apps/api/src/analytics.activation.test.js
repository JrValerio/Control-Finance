import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import { resetImportRateLimiterState, resetWriteRateLimiterState } from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import { registerAndLogin, setupTestDb } from "./test-helpers.js";

describe("POST /analytics/events", () => {
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
    await dbQuery("DELETE FROM activation_events");
    await dbQuery("DELETE FROM refresh_tokens");
    await dbQuery("DELETE FROM users");
  });

  it("retorna 401 sem autenticacao", async () => {
    const response = await request(app)
      .post("/analytics/events")
      .send({ event: "welcome_card_viewed" });

    expect(response.status).toBe(401);
  });

  it("registra evento valido e retorna 201", async () => {
    const token = await registerAndLogin("user@test.com");

    const response = await request(app)
      .post("/analytics/events")
      .set("Cookie", [`cf_access=${token}`])
      .send({ event: "welcome_card_viewed" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ event: "welcome_card_viewed" });
    expect(response.body.id).toBeDefined();
    expect(response.body.created_at).toBeDefined();
  });

  it("aceita todos os eventos validos", async () => {
    const token = await registerAndLogin("user2@test.com");
    const events = [
      "welcome_card_viewed",
      "welcome_cta_clicked",
      "transaction_modal_opened",
      "first_transaction_created",
    ];

    for (const event of events) {
      const response = await request(app)
        .post("/analytics/events")
        .set("Cookie", [`cf_access=${token}`])
        .send({ event });

      expect(response.status).toBe(201);
    }
  });

  it("retorna 400 para evento invalido", async () => {
    const token = await registerAndLogin("user3@test.com");

    const response = await request(app)
      .post("/analytics/events")
      .set("Cookie", [`cf_access=${token}`])
      .send({ event: "invented_event" });

    expect(response.status).toBe(400);
  });

  it("retorna 400 sem campo event", async () => {
    const token = await registerAndLogin("user4@test.com");

    const response = await request(app)
      .post("/analytics/events")
      .set("Cookie", [`cf_access=${token}`])
      .send({});

    expect(response.status).toBe(400);
  });

  it("persiste o user_id correto no banco", async () => {
    const token = await registerAndLogin("user5@test.com");

    await request(app)
      .post("/analytics/events")
      .set("Cookie", [`cf_access=${token}`])
      .send({ event: "first_transaction_created" });

    const result = await dbQuery(
      "SELECT * FROM activation_events WHERE event = 'first_transaction_created'",
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].user_id).toBeGreaterThan(0);
  });
});
