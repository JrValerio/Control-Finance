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
import { registerAndLogin, setupTestDb } from "./test-helpers.js";

describe("smoke critical finance journey", () => {
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
    await dbQuery("DELETE FROM bills");
    await dbQuery("DELETE FROM subscriptions");
    await dbQuery("DELETE FROM users");
  });

  it("creates pending bill and reflects the amount in /bills/summary", async () => {
    const token = await registerAndLogin("smoke-critical-journey@controlfinance.dev");
    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const createResponse = await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Conta critica smoke",
        amount: 123.45,
        dueDate,
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      title: "Conta critica smoke",
      status: "pending",
    });

    const summaryResponse = await request(app)
      .get("/bills/summary")
      .set("Authorization", `Bearer ${token}`);

    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body).toMatchObject({
      pendingCount: 1,
      overdueCount: 0,
      overdueTotal: 0,
    });
    expect(summaryResponse.body.pendingTotal).toBeCloseTo(123.45, 2);
  });
});