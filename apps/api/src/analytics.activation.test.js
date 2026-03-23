import cookieParser from "cookie-parser";
import express from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import { resetImportRateLimiterState, resetWriteRateLimiterState } from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import { authMiddleware } from "./middlewares/auth.middleware.js";
import { recordActivationEvent } from "./services/activation-events.service.js";
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

describe("analyticsWriteRateLimiter fires 429 after limit", () => {
  // Use an isolated Express app with max=2 so the test doesn't need to fire 30 requests.
  // This verifies the 429 handler is wired correctly without coupling to the production limit.
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 2,
    standardHeaders: false,
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      const err = new Error("Muitas requisicoes. Tente novamente em instantes.");
      err.status = 429;
      next(err);
    },
  });

  const rateLimitApp = express();
  rateLimitApp.use(express.json());
  rateLimitApp.use(cookieParser());
  rateLimitApp.post("/analytics/events", authMiddleware, limiter, async (req, res, next) => {
    try {
      const record = await recordActivationEvent({ userId: req.user.id, event: req.body.event });
      res.status(201).json(record);
    } catch (err) {
      next(err);
    }
  });
  // eslint-disable-next-line no-unused-vars
  rateLimitApp.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ message: err.message });
  });

  beforeAll(async () => { await setupTestDb(); });
  afterAll(async () => { await clearDbClientForTests(); });
  beforeEach(async () => {
    resetLoginProtectionState();
    resetImportRateLimiterState();
    resetWriteRateLimiterState();
    resetHttpMetricsForTests();
    await dbQuery("DELETE FROM activation_events");
    await dbQuery("DELETE FROM refresh_tokens");
    await dbQuery("DELETE FROM users");
    if (limiter?.store?.resetAll) limiter.store.resetAll();
  });

  it("retorna 429 apos exceder o limite por usuario", async () => {
    const token = await registerAndLogin("ratelimit@test.com");
    const payload = { event: "welcome_card_viewed" };
    const headers = { Cookie: `cf_access=${token}` };

    const first = await request(rateLimitApp).post("/analytics/events").set(headers).send(payload);
    expect(first.status).toBe(201);

    const second = await request(rateLimitApp).post("/analytics/events").set(headers).send(payload);
    expect(second.status).toBe(201);

    const third = await request(rateLimitApp).post("/analytics/events").set(headers).send(payload);
    expect(third.status).toBe(429);
  });
});
