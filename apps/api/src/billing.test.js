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
  makeProUser,
  registerAndLogin,
  setupTestDb,
} from "./test-helpers.js";

describe("billing", () => {
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
    await dbQuery("DELETE FROM subscriptions");
    await dbQuery("DELETE FROM transactions");
    await dbQuery("DELETE FROM users");
  });

  it("GET /billing/subscription retorna 401 sem token", async () => {
    const response = await request(app).get("/billing/subscription");

    expectErrorResponseWithRequestId(response, 401, "Token de autenticacao ausente ou invalido.");
  });

  it("GET /billing/entitlement retorna 401 sem token", async () => {
    const response = await request(app).get("/billing/entitlement");

    expectErrorResponseWithRequestId(response, 401, "Token de autenticacao ausente ou invalido.");
  });

  it("GET /billing/subscription retorna plano free para novo usuario sem subscription", async () => {
    const token = await registerAndLogin("billing-free@controlfinance.dev");

    const response = await request(app)
      .get("/billing/subscription")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.plan).toBe("free");
    expect(response.body.subscription).toBeNull();
  });

  it("GET /billing/subscription retorna shape consistente", async () => {
    const email = "billing-shape@controlfinance.dev";
    const token = await registerAndLogin(email);

    const response = await request(app)
      .get("/billing/subscription")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(typeof response.body.plan).toBe("string");
    expect(typeof response.body.displayName).toBe("string");
    expect(typeof response.body.features).toBe("object");
    expect(response.body.features).toMatchObject({
      csv_import: expect.any(Boolean),
      csv_export: expect.any(Boolean),
      analytics_months_max: expect.any(Number),
      budget_tracking: expect.any(Boolean),
    });
  });

  it("GET /billing/subscription retorna entitlementSource=trial para usuario em trial ativo", async () => {
    const token = await registerAndLogin("billing-sub-trial@controlfinance.dev");

    const response = await request(app)
      .get("/billing/subscription")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.plan).toBe("free");
    expect(response.body.entitlementSource).toBe("trial");
    expect(typeof response.body.trialEndsAt).toBe("string");
    expect(response.body.subscription).toBeNull();
  });

  it("GET /billing/subscription retorna entitlementSource=free com trialExpired=true para trial vencido", async () => {
    const email = "billing-sub-trial-expired@controlfinance.dev";
    const token = await registerAndLogin(email);
    const userId = await getUserIdByEmail(email);

    await dbQuery(
      `UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
      [userId],
    );

    const response = await request(app)
      .get("/billing/subscription")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.entitlementSource).toBe("free");
    expect(response.body.trialExpired).toBe(true);
    expect(response.body.subscription).toBeNull();
  });

  it("GET /billing/entitlement retorna source=trial para usuario novo", async () => {
    const email = "billing-entitlement-trial@controlfinance.dev";
    const token = await registerAndLogin(email);

    const response = await request(app)
      .get("/billing/entitlement")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.plan).toBe("trial");
    expect(response.body.source).toBe("trial");
    expect(typeof response.body.trialEndsAt).toBe("string");
    expect(response.body.proExpiresAt).toBeNull();
  });

  it("GET /billing/entitlement retorna source=recurring_grace para usuario past_due dentro da janela", async () => {
    const email = "billing-entitlement-grace@controlfinance.dev";
    const token = await registerAndLogin(email);
    const userId = await getUserIdByEmail(email);
    await makeProUser(email);
    await dbQuery(
      `UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
      [userId],
    );
    await dbQuery(
      `UPDATE subscriptions
        SET status = 'past_due', updated_at = NOW() - INTERVAL '2 days'
        WHERE user_id = $1`,
      [userId],
    );

    const response = await request(app)
      .get("/billing/entitlement")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.plan).toBe("pro");
    expect(response.body.source).toBe("recurring_grace");
    expect(response.body.subscriptionStatus).toBe("past_due");
    expect(typeof response.body.graceEndsAt).toBe("string");
  });

  it("GET /billing/entitlement retorna source=none para usuario past_due fora da janela", async () => {
    const email = "billing-entitlement-grace-expired@controlfinance.dev";
    const token = await registerAndLogin(email);
    const userId = await getUserIdByEmail(email);
    await makeProUser(email);
    await dbQuery(
      `UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
      [userId],
    );
    await dbQuery(
      `UPDATE subscriptions
        SET status = 'past_due', updated_at = NOW() - INTERVAL '4 days'
        WHERE user_id = $1`,
      [userId],
    );

    const response = await request(app)
      .get("/billing/entitlement")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.plan).toBe("free");
    expect(response.body.source).toBe("none");
    expect(response.body.subscriptionStatus).toBe("past_due");
    expect(typeof response.body.graceEndsAt).toBe("string");
  });

  it("GET /billing/entitlement retorna source=prepaid para usuario com pro_expires_at ativo", async () => {
    const email = "billing-entitlement-prepaid@controlfinance.dev";
    const token = await registerAndLogin(email);
    const userId = await getUserIdByEmail(email);
    await dbQuery(
      `UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day', pro_expires_at = NOW() + INTERVAL '6 months' WHERE id = $1`,
      [userId],
    );

    const response = await request(app)
      .get("/billing/entitlement")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.plan).toBe("pro");
    expect(response.body.source).toBe("prepaid");
    expect(typeof response.body.proExpiresAt).toBe("string");
    expect(response.body.trialEndsAt).toBeNull();
  });

  it("GET /billing/subscription retorna plano pro para usuario com prepaid ativo", async () => {
    const email = "billing-summary-prepaid@controlfinance.dev";
    const token = await registerAndLogin(email);
    const userId = await getUserIdByEmail(email);
    await dbQuery(
      `UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day', pro_expires_at = NOW() + INTERVAL '6 months' WHERE id = $1`,
      [userId],
    );

    const response = await request(app)
      .get("/billing/subscription")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.plan).toBe("pro");
    expect(response.body.entitlementSource).toBe("prepaid");
    expect(response.body.subscription).toMatchObject({
      status: "prepaid_active",
      cancelAtPeriodEnd: true,
    });
    expect(typeof response.body.subscription.currentPeriodEnd).toBe("string");
  });

  it("GET /billing/subscription retorna entitlementSource=subscription_grace para usuario past_due dentro da janela", async () => {
    const email = "billing-summary-grace@controlfinance.dev";
    const token = await registerAndLogin(email);
    const userId = await getUserIdByEmail(email);
    await makeProUser(email);
    await dbQuery(
      `UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
      [userId],
    );
    await dbQuery(
      `UPDATE subscriptions
        SET status = 'past_due', updated_at = NOW() - INTERVAL '2 days'
        WHERE user_id = $1`,
      [userId],
    );

    const response = await request(app)
      .get("/billing/subscription")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.plan).toBe("pro");
    expect(response.body.entitlementSource).toBe("subscription_grace");
    expect(response.body.subscription).toMatchObject({
      status: "past_due",
    });
    expect(typeof response.body.graceEndsAt).toBe("string");
  });

  it("POST /transactions/import/dry-run retorna 402 para usuario free", async () => {
    const token = await registerAndLogin("billing-dryrun-free@controlfinance.dev");

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expectErrorResponseWithRequestId(response, 402, "Recurso disponivel apenas no plano Pro.");
  });

  it("GET /transactions/export.csv retorna 402 para usuario free", async () => {
    const token = await registerAndLogin("billing-export-free@controlfinance.dev");

    const response = await request(app)
      .get("/transactions/export.csv")
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(response, 402, "Recurso disponivel apenas no plano Pro.");
  });

  it("GET /analytics/trend retorna 6 meses para usuario em trial ativo (limite do plano)", async () => {
    const email = "billing-trend-free@controlfinance.dev";
    const token = await registerAndLogin(email);
    // Active trial: TRIAL_FEATURES gives analytics_months_max=6

    const response = await request(app)
      .get("/analytics/trend")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(6);
  });

  it("GET /analytics/trend retorna 402 para usuario com trial expirado (paywall)", async () => {
    const email = "billing-trend-exceeded@controlfinance.dev";
    const token = await registerAndLogin(email);
    const userId = await getUserIdByEmail(email);
    await dbQuery(`UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE id = $1`, [userId]);

    const response = await request(app)
      .get("/analytics/trend")
      .query({ months: 6 })
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(response, 402, "Periodo de teste encerrado. Ative seu plano para continuar utilizando esta funcionalidade.");
  });

  it("usuario pro acessa dry-run normalmente", async () => {
    const email = "billing-dryrun-pro@controlfinance.dev";
    const token = await registerAndLogin(email);
    await makeProUser(email);

    const csvContent = "type,value,date,description\nEntrada,100,2026-01-01,Salario";

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from(csvContent, "utf8"), {
        filename: "import.csv",
        contentType: "text/csv",
      });

    expect(response.status).toBe(200);
  });

  it("usuario pro acessa export.csv normalmente", async () => {
    const email = "billing-export-pro@controlfinance.dev";
    const token = await registerAndLogin(email);
    await makeProUser(email);

    const response = await request(app)
      .get("/transactions/export.csv")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
  });
});
