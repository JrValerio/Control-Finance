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
import {
  expectErrorResponseWithRequestId,
  getExpectedTrendMonths,
  getUserIdByEmail,
  registerAndLogin,
  setupTestDb,
} from "./test-helpers.js";

describe("analytics", () => {
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
    await dbQuery("DELETE FROM users");
  });

  it("GET /analytics/trend bloqueia sem token", async () => {
    const response = await request(app).get("/analytics/trend");

    expectErrorResponseWithRequestId(response, 401, "Token de autenticacao ausente ou invalido.");
  });

  it.each([{ months: "0" }, { months: "abc" }, { months: "999" }, { months: "1.5" }, { months: "" }])(
    "GET /analytics/trend retorna 400 para months invalido (%o)",
    async ({ months }) => {
      const token = await registerAndLogin("analytics-trend-months-invalid@controlfinance.dev");

      const response = await request(app)
        .get("/analytics/trend")
        .query({ months })
        .set("Authorization", `Bearer ${token}`);

      expectErrorResponseWithRequestId(response, 400, "months invalido. Use inteiro entre 1 e 24.");
    },
  );

  it("GET /analytics/trend retorna 6 meses por padrao para usuario em trial ativo (limite do plano)", async () => {
    const email = "analytics-trend-default@controlfinance.dev";
    const token = await registerAndLogin(email);
    // Active trial: TRIAL_FEATURES gives analytics_months_max=6, so default cap = min(6,6) = 6
    await getUserIdByEmail(email); // ensure user exists

    const response = await request(app)
      .get("/analytics/trend")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(6);
    expect(response.body.map((item) => item.month)).toEqual(getExpectedTrendMonths(6));
    response.body.forEach((item) => {
      expect(typeof item.month).toBe("string");
      expect(item.month).toMatch(/^\d{4}-\d{2}$/);
      expect(item.income).toBe(0);
      expect(item.expense).toBe(0);
      expect(item.balance).toBe(0);
    });
  });

  it("GET /analytics/trend preenche meses vazios e calcula income/expense/balance", async () => {
    const token = await registerAndLogin("analytics-trend-calc@controlfinance.dev");
    const expectedMonths = getExpectedTrendMonths(3);
    const [oldestMonth, previousMonth, currentMonth] = expectedMonths;

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 200,
        date: `${previousMonth}-10`,
        description: "Transporte",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 1000,
        date: `${currentMonth}-12`,
        description: "Salario",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 250,
        date: `${currentMonth}-13`,
        description: "Mercado",
      });

    const deletedTransactionResponse = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 999,
        date: `${currentMonth}-14`,
        description: "Ignorada",
      });

    await request(app)
      .delete(`/transactions/${deletedTransactionResponse.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    const response = await request(app)
      .get("/analytics/trend")
      .query({ months: 3 })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(3);
    expect(response.body.map((item) => item.month)).toEqual([oldestMonth, previousMonth, currentMonth]);
    expect(response.body).toEqual([
      { month: oldestMonth, income: 0, expense: 0, balance: 0 },
      { month: previousMonth, income: 0, expense: 200, balance: -200 },
      { month: currentMonth, income: 1000, expense: 250, balance: 750 },
    ]);
  });
});
