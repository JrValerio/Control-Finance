import { createHmac } from "node:crypto";
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
  generateStripeSignature,
  getUserIdByEmail,
  registerAndLogin,
  setupTestDb,
} from "./test-helpers.js";

const TEST_SECRET = "whsec_test_controlfinance_2026";
process.env.STRIPE_WEBHOOK_SECRET = TEST_SECRET;

const stripePost = (event) => {
  const { header, body } = generateStripeSignature(event, TEST_SECRET);
  return request(app)
    .post("/billing/webhooks/stripe")
    .set("stripe-signature", header)
    .set("Content-Type", "application/json")
    .send(body);
};

const getSubscription = async (userId) => {
  const result = await dbQuery(
    `SELECT s.*, p.name AS plan_name
      FROM subscriptions s
      JOIN plans p ON p.id = s.plan_id
      WHERE s.user_id = $1
      ORDER BY s.created_at DESC
      LIMIT 1`,
    [userId],
  );
  return result.rows[0] ?? null;
};

const getUserProExpiresAt = async (userId) => {
  const result = await dbQuery(`SELECT pro_expires_at FROM users WHERE id = $1 LIMIT 1`, [userId]);
  return result.rows[0]?.pro_expires_at ?? null;
};

describe("stripe webhooks", () => {
  beforeAll(async () => {
    await setupTestDb();
    await dbQuery(`UPDATE plans SET stripe_price_id = 'price_pro_monthly' WHERE name = 'pro'`);
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

  it("retorna 400 sem header Stripe-Signature", async () => {
    const response = await request(app)
      .post("/billing/webhooks/stripe")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ type: "checkout.session.completed" }));

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Missing Stripe-Signature header.");
  });

  it("retorna 400 com assinatura invalida (secret errado)", async () => {
    const { header, body } = generateStripeSignature(
      { type: "checkout.session.completed" },
      "whsec_wrong_secret",
    );

    const response = await request(app)
      .post("/billing/webhooks/stripe")
      .set("stripe-signature", header)
      .set("Content-Type", "application/json")
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Stripe signature invalid.");
  });

  it("retorna 400 com timestamp expirado (replay attack)", async () => {
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 400;
    const body = JSON.stringify({ type: "checkout.session.completed" });
    const sig = createHmac("sha256", TEST_SECRET)
      .update(`${expiredTimestamp}.${body}`)
      .digest("hex");
    const header = `t=${expiredTimestamp},v1=${sig}`;

    const response = await request(app)
      .post("/billing/webhooks/stripe")
      .set("stripe-signature", header)
      .set("Content-Type", "application/json")
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Stripe webhook timestamp expired.");
  });

  it("retorna 200 para evento desconhecido sem efeito colateral", async () => {
    const response = await stripePost({
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_test_xxx" } },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });

    const count = await dbQuery("SELECT COUNT(*) FROM subscriptions");
    expect(Number(count.rows[0].count)).toBe(0);
  });

  it("checkout.session.completed cria subscription ativa para userId valido", async () => {
    await registerAndLogin("webhook-checkout@controlfinance.dev");
    const userId = await getUserIdByEmail("webhook-checkout@controlfinance.dev");

    const response = await stripePost({
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_test_001",
          subscription: "sub_test_001",
          metadata: { userId: String(userId) },
        },
      },
    });

    expect(response.status).toBe(200);

    const sub = await getSubscription(userId);
    expect(sub).not.toBeNull();
    expect(sub.plan_name).toBe("pro");
    expect(sub.status).toBe("active");
    expect(sub.stripe_customer_id).toBe("cus_test_001");
    expect(sub.stripe_subscription_id).toBe("sub_test_001");
  });

  it("checkout.session.completed ignora evento sem userId em metadata (retorna 200, sem row)", async () => {
    const response = await stripePost({
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_test_002",
          subscription: "sub_test_002",
          metadata: {},
        },
      },
    });

    expect(response.status).toBe(200);
    const count = await dbQuery("SELECT COUNT(*) FROM subscriptions");
    expect(Number(count.rows[0].count)).toBe(0);
  });

  it("checkout.session.completed resolve plano por stripe_price_id", async () => {
    await registerAndLogin("webhook-price-id@controlfinance.dev");
    const userId = await getUserIdByEmail("webhook-price-id@controlfinance.dev");

    const response = await stripePost({
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_test_003",
          subscription: "sub_test_003",
          metadata: {
            userId: String(userId),
            stripe_price_id: "price_pro_monthly",
          },
        },
      },
    });

    expect(response.status).toBe(200);

    const sub = await getSubscription(userId);
    expect(sub.plan_name).toBe("pro");
  });

  it("customer.subscription.updated atualiza status, periodos e plano", async () => {
    await registerAndLogin("webhook-sub-updated@controlfinance.dev");
    const userId = await getUserIdByEmail("webhook-sub-updated@controlfinance.dev");

    // Create initial subscription via checkout event
    await stripePost({
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_test_004",
          subscription: "sub_test_004",
          metadata: { userId: String(userId) },
        },
      },
    });

    const periodStart = 1700000000;
    const periodEnd = 1702600000;

    const response = await stripePost({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_test_004",
          customer: "cus_test_004",
          status: "trialing",
          current_period_start: periodStart,
          current_period_end: periodEnd,
          cancel_at_period_end: true,
          items: { data: [{ price: { id: "price_pro_monthly" } }] },
        },
      },
    });

    expect(response.status).toBe(200);

    const sub = await getSubscription(userId);
    expect(sub.status).toBe("trialing");
    expect(sub.cancel_at_period_end).toBe(true);
    expect(new Date(sub.current_period_start).getTime()).toBe(periodStart * 1000);
    expect(new Date(sub.current_period_end).getTime()).toBe(periodEnd * 1000);
  });

  it("customer.subscription.updated e idempotente (dois eventos identicos)", async () => {
    await registerAndLogin("webhook-idempotent@controlfinance.dev");
    const userId = await getUserIdByEmail("webhook-idempotent@controlfinance.dev");

    await stripePost({
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_test_005",
          subscription: "sub_test_005",
          metadata: { userId: String(userId) },
        },
      },
    });

    const subEvent = {
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_test_005",
          customer: "cus_test_005",
          status: "active",
          current_period_start: 1700000000,
          current_period_end: 1702600000,
          cancel_at_period_end: false,
          items: { data: [{ price: { id: "price_pro_monthly" } }] },
        },
      },
    };

    await stripePost(subEvent);
    await stripePost(subEvent);

    const count = await dbQuery(
      `SELECT COUNT(*) FROM subscriptions WHERE user_id = $1`,
      [userId],
    );
    expect(Number(count.rows[0].count)).toBe(1);
  });

  it("customer.subscription.deleted marca status como canceled", async () => {
    await registerAndLogin("webhook-deleted@controlfinance.dev");
    const userId = await getUserIdByEmail("webhook-deleted@controlfinance.dev");

    await stripePost({
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_test_006",
          subscription: "sub_test_006",
          metadata: { userId: String(userId) },
        },
      },
    });

    const response = await stripePost({
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_test_006",
          customer: "cus_test_006",
          status: "canceled",
        },
      },
    });

    expect(response.status).toBe(200);

    const sub = await getSubscription(userId);
    expect(sub.status).toBe("canceled");
  });

  it("invoice.payment_failed transiciona para past_due", async () => {
    await registerAndLogin("webhook-payment-failed@controlfinance.dev");
    const userId = await getUserIdByEmail("webhook-payment-failed@controlfinance.dev");

    await stripePost({
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_test_007",
          subscription: "sub_test_007",
          metadata: { userId: String(userId) },
        },
      },
    });

    const response = await stripePost({
      type: "invoice.payment_failed",
      data: {
        object: {
          subscription: "sub_test_007",
          customer: "cus_test_007",
        },
      },
    });

    expect(response.status).toBe(200);

    const sub = await getSubscription(userId);
    expect(sub.status).toBe("past_due");
  });

  it("apos subscription.deleted, entitlement retorna ao plano free", async () => {
    await registerAndLogin("webhook-entitlement-fallback@controlfinance.dev");
    const userId = await getUserIdByEmail("webhook-entitlement-fallback@controlfinance.dev");
    const token = (
      await request(app)
        .post("/auth/login")
        .send({ email: "webhook-entitlement-fallback@controlfinance.dev", password: "Senha123" })
    ).body.token;

    await stripePost({
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_test_008",
          subscription: "sub_test_008",
          metadata: { userId: String(userId) },
        },
      },
    });

    // Confirm user is pro
    const proResponse = await request(app)
      .get("/billing/subscription")
      .set("Authorization", `Bearer ${token}`);
    expect(proResponse.body.plan).toBe("pro");

    // Cancel subscription
    await stripePost({
      type: "customer.subscription.deleted",
      data: {
        object: { id: "sub_test_008", customer: "cus_test_008", status: "canceled" },
      },
    });

    // Confirm entitlement reverted to free
    const freeResponse = await request(app)
      .get("/billing/subscription")
      .set("Authorization", `Bearer ${token}`);
    expect(freeResponse.body.plan).toBe("free");
  });

  it("checkout.session.completed (mode=payment) concede PRO pre-pago quando payment_status=paid", async () => {
    await registerAndLogin("webhook-prepaid-completed@controlfinance.dev");
    const userId = await getUserIdByEmail("webhook-prepaid-completed@controlfinance.dev");
    const token = (
      await request(app)
        .post("/auth/login")
        .send({ email: "webhook-prepaid-completed@controlfinance.dev", password: "Senha123" })
    ).body.token;

    const response = await stripePost({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_prepaid_001",
          mode: "payment",
          payment_status: "paid",
          payment_intent: "pi_prepaid_001",
          metadata: {
            userId: String(userId),
            entitlement: "pro_6_months",
            entitlement_months: "6",
          },
        },
      },
    });

    expect(response.status).toBe(200);
    expect(await getSubscription(userId)).toBeNull();

    const proExpiresAt = await getUserProExpiresAt(userId);
    expect(proExpiresAt).not.toBeNull();
    expect(new Date(proExpiresAt).getTime()).toBeGreaterThan(Date.now());

    const summaryResponse = await request(app)
      .get("/billing/subscription")
      .set("Authorization", `Bearer ${token}`);
    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body.plan).toBe("pro");
    expect(summaryResponse.body.entitlementSource).toBe("prepaid");
  });

  it("checkout.session.completed (mode=payment) nao concede quando payment_status nao e paid", async () => {
    await registerAndLogin("webhook-prepaid-unpaid@controlfinance.dev");
    const userId = await getUserIdByEmail("webhook-prepaid-unpaid@controlfinance.dev");

    const response = await stripePost({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_prepaid_002",
          mode: "payment",
          payment_status: "unpaid",
          metadata: {
            userId: String(userId),
            entitlement: "pro_6_months",
            entitlement_months: "6",
          },
        },
      },
    });

    expect(response.status).toBe(200);
    expect(await getUserProExpiresAt(userId)).toBeNull();
  });

  it("checkout.session.async_payment_succeeded concede pre-pago com idempotencia por session id", async () => {
    await registerAndLogin("webhook-prepaid-async@controlfinance.dev");
    const userId = await getUserIdByEmail("webhook-prepaid-async@controlfinance.dev");

    const event = {
      type: "checkout.session.async_payment_succeeded",
      data: {
        object: {
          id: "cs_prepaid_003",
          mode: "payment",
          payment_status: "paid",
          payment_intent: "pi_prepaid_003",
          metadata: {
            userId: String(userId),
            entitlement: "pro_6_months",
            entitlement_months: "6",
          },
        },
      },
    };

    const firstResponse = await stripePost(event);
    const firstExpiry = await getUserProExpiresAt(userId);
    const secondResponse = await stripePost(event);
    const secondExpiry = await getUserProExpiresAt(userId);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(firstExpiry).not.toBeNull();
    expect(new Date(secondExpiry).toISOString()).toBe(new Date(firstExpiry).toISOString());

    const grantsCountResult = await dbQuery(
      `SELECT COUNT(*) FROM prepaid_pro_grants WHERE stripe_checkout_session_id = 'cs_prepaid_003'`,
    );
    expect(Number(grantsCountResult.rows[0].count)).toBe(1);
  });
});
