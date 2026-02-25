import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import {
  resetImportRateLimiterState,
  resetWriteRateLimiterState,
} from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import { makeProUser, registerAndLogin, setupTestDb } from "./test-helpers.js";

const { mockSessionCreate } = vi.hoisted(() => ({
  mockSessionCreate: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockSessionCreate } },
  })),
}));

describe("billing checkout", () => {
  beforeAll(async () => {
    await setupTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock_controlfinance";
    process.env.STRIPE_CHECKOUT_SUCCESS_URL = "https://app.test/billing/success";
    process.env.STRIPE_CHECKOUT_CANCEL_URL = "https://app.test/billing/cancel";
    process.env.STRIPE_PRICE_ID_PRO_MONTHLY = "price_pro_monthly_env";
    process.env.STRIPE_PRICE_ID_PRO_YEARLY = "price_pro_yearly_env";
    await dbQuery(`UPDATE plans SET stripe_price_id = 'price_pro_monthly' WHERE name = 'pro'`);
  });

  afterAll(async () => {
    await clearDbClientForTests();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_CHECKOUT_SUCCESS_URL;
    delete process.env.STRIPE_CHECKOUT_CANCEL_URL;
    delete process.env.STRIPE_PRICE_ID_PRO_MONTHLY;
    delete process.env.STRIPE_PRICE_ID_PRO_YEARLY;
    delete process.env.STRIPE_PRICE_ID_PRO;
    delete process.env.STRIPE_PREPAID_PRO_AMOUNT_CENTS;
    delete process.env.STRIPE_PREPAID_PRO_DURATION_MONTHS;
  });

  beforeEach(async () => {
    resetLoginProtectionState();
    resetImportRateLimiterState();
    resetWriteRateLimiterState();
    resetHttpMetricsForTests();
    await dbQuery("DELETE FROM subscriptions");
    await dbQuery("DELETE FROM transactions");
    await dbQuery("DELETE FROM users");
    mockSessionCreate.mockReset();
    mockSessionCreate.mockResolvedValue({ url: "https://checkout.stripe.com/test-session-001" });
  });

  it("retorna 401 sem token", async () => {
    const response = await request(app).post("/billing/checkout");
    expect(response.status).toBe(401);
  });

  it("retorna 409 se usuario ja possui assinatura ativa", async () => {
    const email = "checkout-already-pro@controlfinance.dev";
    const token = await registerAndLogin(email);
    await makeProUser(email);

    const response = await request(app)
      .post("/billing/checkout")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("Voce ja possui uma assinatura ativa.");
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("retorna 201 com url para usuario free", async () => {
    const token = await registerAndLogin("checkout-free@controlfinance.dev");

    const response = await request(app)
      .post("/billing/checkout")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(201);
    expect(response.body.url).toBe("https://checkout.stripe.com/test-session-001");
  });

  it("passa metadata.userId, price_id e URLs corretos para Stripe", async () => {
    const email = "checkout-meta@controlfinance.dev";
    const token = await registerAndLogin(email);
    const userResult = await dbQuery(`SELECT id FROM users WHERE email = $1`, [email]);
    const userId = userResult.rows[0].id;

    await request(app)
      .post("/billing/checkout")
      .set("Authorization", `Bearer ${token}`);

    expect(mockSessionCreate).toHaveBeenCalledOnce();
    const args = mockSessionCreate.mock.calls[0][0];
    expect(args.mode).toBe("subscription");
    expect(args.line_items[0].price).toBe("price_pro_monthly_env");
    expect(args.line_items[0].quantity).toBe(1);
    expect(args.metadata.userId).toBe(String(userId));
    expect(args.metadata.billing_interval).toBe("month");
    expect(args.success_url).toBe("https://app.test/billing/success");
    expect(args.cancel_url).toBe("https://app.test/billing/cancel");
  });

  it("usa price anual quando interval=year", async () => {
    const token = await registerAndLogin("checkout-yearly@controlfinance.dev");

    const response = await request(app)
      .post("/billing/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ interval: "year" });

    expect(response.status).toBe(201);
    expect(mockSessionCreate).toHaveBeenCalledOnce();
    const args = mockSessionCreate.mock.calls[0][0];
    expect(args.line_items[0].price).toBe("price_pro_yearly_env");
    expect(args.metadata.billing_interval).toBe("year");
  });

  it("retorna 400 para interval invalido", async () => {
    const token = await registerAndLogin("checkout-invalid-interval@controlfinance.dev");

    const response = await request(app)
      .post("/billing/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ interval: "weekly" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("BILLING_CHECKOUT_INTERVAL_INVALID");
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("passa customer_email quando disponivel no token", async () => {
    const email = "checkout-email@controlfinance.dev";
    const token = await registerAndLogin(email);

    await request(app)
      .post("/billing/checkout")
      .set("Authorization", `Bearer ${token}`);

    expect(mockSessionCreate).toHaveBeenCalledOnce();
    const args = mockSessionCreate.mock.calls[0][0];
    expect(args.customer_email).toBe(email);
  });

  it("retorna 500 se STRIPE_SECRET_KEY nao configurado", async () => {
    const saved = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      const token = await registerAndLogin("checkout-no-key@controlfinance.dev");
      const response = await request(app)
        .post("/billing/checkout")
        .set("Authorization", `Bearer ${token}`);
      expect(response.status).toBe(500);
      expect(response.body.code).toBe("BILLING_STRIPE_SECRET_MISSING");
      expect(mockSessionCreate).not.toHaveBeenCalled();
    } finally {
      process.env.STRIPE_SECRET_KEY = saved;
    }
  });

  it("retorna 500 se checkout URLs nao configurados", async () => {
    const saved = process.env.STRIPE_CHECKOUT_SUCCESS_URL;
    delete process.env.STRIPE_CHECKOUT_SUCCESS_URL;
    try {
      const token = await registerAndLogin("checkout-no-url@controlfinance.dev");
      const response = await request(app)
        .post("/billing/checkout")
        .set("Authorization", `Bearer ${token}`);
      expect(response.status).toBe(500);
      expect(response.body.code).toBe("BILLING_CHECKOUT_URLS_NOT_CONFIGURED");
      expect(mockSessionCreate).not.toHaveBeenCalled();
    } finally {
      process.env.STRIPE_CHECKOUT_SUCCESS_URL = saved;
    }
  });

  it("retorna 500 quando nao existe price id configurado", async () => {
    const savedMonthly = process.env.STRIPE_PRICE_ID_PRO_MONTHLY;
    const savedLegacy = process.env.STRIPE_PRICE_ID_PRO;
    delete process.env.STRIPE_PRICE_ID_PRO_MONTHLY;
    delete process.env.STRIPE_PRICE_ID_PRO;
    await dbQuery(`UPDATE plans SET stripe_price_id = NULL WHERE name = 'pro'`);

    try {
      const token = await registerAndLogin("checkout-no-price@controlfinance.dev");
      const response = await request(app)
        .post("/billing/checkout")
        .set("Authorization", `Bearer ${token}`);
      expect(response.status).toBe(500);
      expect(response.body.code).toBe("BILLING_PRO_PRICE_NOT_CONFIGURED");
      expect(mockSessionCreate).not.toHaveBeenCalled();
    } finally {
      process.env.STRIPE_PRICE_ID_PRO_MONTHLY = savedMonthly;
      process.env.STRIPE_PRICE_ID_PRO = savedLegacy;
      await dbQuery(`UPDATE plans SET stripe_price_id = 'price_pro_monthly' WHERE name = 'pro'`);
    }
  });

  it("retorna 500 quando price id configurado e invalido", async () => {
    const savedMonthly = process.env.STRIPE_PRICE_ID_PRO_MONTHLY;
    process.env.STRIPE_PRICE_ID_PRO_MONTHLY = "prod_invalid";

    try {
      const token = await registerAndLogin("checkout-invalid-price@controlfinance.dev");
      const response = await request(app)
        .post("/billing/checkout")
        .set("Authorization", `Bearer ${token}`);
      expect(response.status).toBe(500);
      expect(response.body.code).toBe("BILLING_PRO_PRICE_ID_INVALID");
      expect(mockSessionCreate).not.toHaveBeenCalled();
    } finally {
      process.env.STRIPE_PRICE_ID_PRO_MONTHLY = savedMonthly;
    }
  });

  it("retorna 500 quando price anual nao configurado", async () => {
    const savedYearly = process.env.STRIPE_PRICE_ID_PRO_YEARLY;
    delete process.env.STRIPE_PRICE_ID_PRO_YEARLY;

    try {
      const token = await registerAndLogin("checkout-missing-year-price@controlfinance.dev");
      const response = await request(app)
        .post("/billing/checkout")
        .set("Authorization", `Bearer ${token}`)
        .send({ interval: "year" });

      expect(response.status).toBe(500);
      expect(response.body.code).toBe("BILLING_PRO_PRICE_NOT_CONFIGURED");
      expect(mockSessionCreate).not.toHaveBeenCalled();
    } finally {
      process.env.STRIPE_PRICE_ID_PRO_YEARLY = savedYearly;
    }
  });

  it("checkout-prepaid retorna 401 sem token", async () => {
    const response = await request(app).post("/billing/checkout-prepaid");
    expect(response.status).toBe(401);
  });

  it("checkout-prepaid retorna 201 com url para usuario sem assinatura recorrente", async () => {
    const email = "checkout-prepaid-free@controlfinance.dev";
    const token = await registerAndLogin(email);

    const response = await request(app)
      .post("/billing/checkout-prepaid")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(201);
    expect(response.body.url).toBe("https://checkout.stripe.com/test-session-001");
  });

  it("checkout-prepaid envia payload esperado para Stripe", async () => {
    const email = "checkout-prepaid-metadata@controlfinance.dev";
    const token = await registerAndLogin(email);
    const userResult = await dbQuery(`SELECT id FROM users WHERE email = $1`, [email]);
    const userId = userResult.rows[0].id;

    await request(app)
      .post("/billing/checkout-prepaid")
      .set("Authorization", `Bearer ${token}`);

    expect(mockSessionCreate).toHaveBeenCalledOnce();
    const args = mockSessionCreate.mock.calls[0][0];
    expect(args.mode).toBe("payment");
    expect(args.automatic_payment_methods).toEqual({ enabled: true });
    expect(args.line_items[0].price_data.currency).toBe("brl");
    expect(args.line_items[0].price_data.unit_amount).toBe(1990);
    expect(args.metadata.userId).toBe(String(userId));
    expect(args.metadata.entitlement).toBe("pro_6_months");
    expect(args.metadata.entitlement_months).toBe("6");
  });

  it("checkout-prepaid retorna 409 para usuario com assinatura recorrente ativa", async () => {
    const email = "checkout-prepaid-with-sub@controlfinance.dev";
    const token = await registerAndLogin(email);
    await makeProUser(email);

    const response = await request(app)
      .post("/billing/checkout-prepaid")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("BILLING_RECURRING_SUBSCRIPTION_ALREADY_ACTIVE");
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("checkout-prepaid retorna 500 com amount invalido em env", async () => {
    process.env.STRIPE_PREPAID_PRO_AMOUNT_CENTS = "abc";
    try {
      const token = await registerAndLogin("checkout-prepaid-invalid-amount@controlfinance.dev");
      const response = await request(app)
        .post("/billing/checkout-prepaid")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(500);
      expect(response.body.code).toBe("BILLING_PREPAID_AMOUNT_INVALID");
      expect(mockSessionCreate).not.toHaveBeenCalled();
    } finally {
      delete process.env.STRIPE_PREPAID_PRO_AMOUNT_CENTS;
    }
  });

  it("checkout-prepaid retorna 500 com duration invalida em env", async () => {
    process.env.STRIPE_PREPAID_PRO_DURATION_MONTHS = "0";
    try {
      const token = await registerAndLogin("checkout-prepaid-invalid-duration@controlfinance.dev");
      const response = await request(app)
        .post("/billing/checkout-prepaid")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(500);
      expect(response.body.code).toBe("BILLING_PREPAID_DURATION_INVALID");
      expect(mockSessionCreate).not.toHaveBeenCalled();
    } finally {
      delete process.env.STRIPE_PREPAID_PRO_DURATION_MONTHS;
    }
  });
});
