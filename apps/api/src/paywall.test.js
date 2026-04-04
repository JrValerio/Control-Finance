/**
 * Tests for requireActiveTrialOrPaidPlan middleware.
 *
 * We test via a fake route that uses the middleware rather than
 * testing the middleware function in isolation, so the full Express
 * pipeline (auth + middleware + error handler) is exercised.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import {
  setupTestDb,
  registerAndLogin,
  getUserIdByEmail,
  makeProUser,
} from "./test-helpers.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import {
  resetImportRateLimiterState,
  resetWriteRateLimiterState,
} from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import { authMiddleware } from "./middlewares/auth.middleware.js";
import {
  requireActiveTrialOrPaidPlan,
  requireFeature,
  attachEntitlements,
} from "./middlewares/entitlement.middleware.js";

// Mount a minimal app just for testing this middleware
const testApp = express();
testApp.use(express.json());
testApp.get(
  "/trial-gated",
  authMiddleware,
  requireActiveTrialOrPaidPlan,
  (_req, res) => res.json({ ok: true }),
);
testApp.get(
  "/feature-gated",
  authMiddleware,
  requireFeature("csv_import"),
  (_req, res) => res.json({ ok: true }),
);
testApp.get(
  "/entitlements",
  authMiddleware,
  attachEntitlements,
  (req, res) => res.json(req.entitlements),
);
// eslint-disable-next-line no-unused-vars
testApp.use((err, _req, res, next) => {
  const body = { message: err.message };
  if (typeof err.publicCode === "string" && err.publicCode) body.code = err.publicCode;
  res.status(err.status || 500).json(body);
});

const resetState = async () => {
  resetLoginProtectionState();
  resetImportRateLimiterState();
  resetWriteRateLimiterState();
  resetHttpMetricsForTests();
  await dbQuery("DELETE FROM subscriptions");
  await dbQuery("DELETE FROM user_profiles");
  await dbQuery("DELETE FROM transactions");
  await dbQuery("DELETE FROM user_identities");
  await dbQuery("DELETE FROM users");
};

describe("requireActiveTrialOrPaidPlan", () => {
  beforeAll(async () => { await setupTestDb(); });
  afterAll(async () => { await clearDbClientForTests(); });
  beforeEach(resetState);

  it("retorna 401 sem token de autenticacao", async () => {
    const res = await request(testApp).get("/trial-gated");
    expect(res.status).toBe(401);
  });

  it("permite acesso durante trial ativo (14 dias apos registro)", async () => {
    const token = await registerAndLogin("paywall-trial-active@test.dev");

    const res = await request(testApp)
      .get("/trial-gated")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("retorna 402 quando trial expirou e nao ha assinatura paga", async () => {
    const token = await registerAndLogin("paywall-trial-expired@test.dev");
    const userId = await getUserIdByEmail("paywall-trial-expired@test.dev");

    // Force trial to have expired
    await dbQuery(
      `UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
      [userId],
    );

    const res = await request(testApp)
      .get("/trial-gated")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(402);
    expect(res.body.message).toContain("Periodo de teste encerrado");
  });

  it("permite acesso com assinatura paga mesmo apos trial expirar", async () => {
    const token = await registerAndLogin("paywall-pro@test.dev");
    const userId = await getUserIdByEmail("paywall-pro@test.dev");

    // Expire trial AND create paid subscription
    await dbQuery(
      `UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
      [userId],
    );
    await makeProUser("paywall-pro@test.dev");

    const res = await request(testApp)
      .get("/trial-gated")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("permite acesso com assinatura paga sem nunca ter usado trial", async () => {
    const token = await registerAndLogin("paywall-pro-notrial@test.dev");
    const userId = await getUserIdByEmail("paywall-pro-notrial@test.dev");

    // Nullify trial_ends_at (simulate legacy user pre-migration)
    await dbQuery(
      `UPDATE users SET trial_ends_at = NULL WHERE id = $1`,
      [userId],
    );
    await makeProUser("paywall-pro-notrial@test.dev");

    const res = await request(testApp)
      .get("/trial-gated")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it("permite acesso em past_due dentro de 3 dias (grace) e envia header de status", async () => {
    const token = await registerAndLogin("paywall-past-due-grace@test.dev");
    const userId = await getUserIdByEmail("paywall-past-due-grace@test.dev");

    await dbQuery(
      `UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
      [userId],
    );
    await makeProUser("paywall-past-due-grace@test.dev");
    await dbQuery(
      `UPDATE subscriptions
        SET status = 'past_due', updated_at = NOW() - INTERVAL '2 days'
        WHERE user_id = $1`,
      [userId],
    );

    const res = await request(testApp)
      .get("/trial-gated")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers["x-subscription-status"]).toBe("past_due_grace");
  });

  it("retorna 402 quando past_due ultrapassa 3 dias de grace", async () => {
    const token = await registerAndLogin("paywall-past-due-expired@test.dev");
    const userId = await getUserIdByEmail("paywall-past-due-expired@test.dev");

    await dbQuery(
      `UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
      [userId],
    );
    await makeProUser("paywall-past-due-expired@test.dev");
    await dbQuery(
      `UPDATE subscriptions
        SET status = 'past_due', updated_at = NOW() - INTERVAL '4 days'
        WHERE user_id = $1`,
      [userId],
    );

    const res = await request(testApp)
      .get("/trial-gated")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(402);
    expect(res.body.message).toContain("Periodo de teste encerrado");
  });

  it("retorna 402 para usuario sem trial nem assinatura (legacy sem trial_ends_at)", async () => {
    const token = await registerAndLogin("paywall-no-trial@test.dev");
    const userId = await getUserIdByEmail("paywall-no-trial@test.dev");

    // Nullify trial_ends_at to simulate pre-migration user with no trial
    await dbQuery(
      `UPDATE users SET trial_ends_at = NULL WHERE id = $1`,
      [userId],
    );

    const res = await request(testApp)
      .get("/trial-gated")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(402);
  });

  it("402 por trial expirado inclui code TRIAL_EXPIRED no body", async () => {
    const token = await registerAndLogin("paywall-code-trial@test.dev");
    const userId = await getUserIdByEmail("paywall-code-trial@test.dev");

    await dbQuery(
      `UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
      [userId],
    );

    const res = await request(testApp)
      .get("/trial-gated")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(402);
    expect(res.body.code).toBe("TRIAL_EXPIRED");
  });
});

describe("paywall bypass (PAYWALL_BYPASS_ENABLED)", () => {
  const BYPASS_EMAIL = "bypass-dev@test.dev";

  beforeAll(async () => { await setupTestDb(); });
  afterAll(async () => { await clearDbClientForTests(); });
  beforeEach(resetState);

  it("bypass ignora paywall em requireActiveTrialOrPaidPlan (trial expirado)", async () => {
    const token = await registerAndLogin(BYPASS_EMAIL);
    const userId = await getUserIdByEmail(BYPASS_EMAIL);
    await dbQuery(`UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE id = $1`, [userId]);

    const originalEnabled = process.env.PAYWALL_BYPASS_ENABLED;
    const originalEmails  = process.env.PAYWALL_BYPASS_EMAILS;
    process.env.PAYWALL_BYPASS_ENABLED = "true";
    process.env.PAYWALL_BYPASS_EMAILS  = BYPASS_EMAIL;

    try {
      const res = await request(testApp)
        .get("/trial-gated")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
    } finally {
      process.env.PAYWALL_BYPASS_ENABLED = originalEnabled;
      process.env.PAYWALL_BYPASS_EMAILS  = originalEmails;
    }
  });

  it("bypass ignora paywall em requireFeature (csv_import bloqueado no plano free)", async () => {
    const token = await registerAndLogin(BYPASS_EMAIL);
    const userId = await getUserIdByEmail(BYPASS_EMAIL);
    await dbQuery(`UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE id = $1`, [userId]);

    const originalEnabled = process.env.PAYWALL_BYPASS_ENABLED;
    const originalEmails  = process.env.PAYWALL_BYPASS_EMAILS;
    process.env.PAYWALL_BYPASS_ENABLED = "true";
    process.env.PAYWALL_BYPASS_EMAILS  = BYPASS_EMAIL;

    try {
      const res = await request(testApp)
        .get("/feature-gated")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
    } finally {
      process.env.PAYWALL_BYPASS_ENABLED = originalEnabled;
      process.env.PAYWALL_BYPASS_EMAILS  = originalEmails;
    }
  });

  it("bypass em attachEntitlements retorna features PRO (analytics_months_max=24)", async () => {
    const token = await registerAndLogin(BYPASS_EMAIL);

    const originalEnabled = process.env.PAYWALL_BYPASS_ENABLED;
    const originalEmails  = process.env.PAYWALL_BYPASS_EMAILS;
    process.env.PAYWALL_BYPASS_ENABLED = "true";
    process.env.PAYWALL_BYPASS_EMAILS  = BYPASS_EMAIL;

    try {
      const res = await request(testApp)
        .get("/entitlements")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.csv_import).toBe(true);
      expect(res.body.csv_export).toBe(true);
      expect(res.body.analytics_months_max).toBe(24);
    } finally {
      process.env.PAYWALL_BYPASS_ENABLED = originalEnabled;
      process.env.PAYWALL_BYPASS_EMAILS  = originalEmails;
    }
  });

  it("bypass NAO se aplica quando NODE_ENV=production", async () => {
    const originalEnabled = process.env.PAYWALL_BYPASS_ENABLED;
    const originalEmails  = process.env.PAYWALL_BYPASS_EMAILS;
    const originalEnv     = process.env.NODE_ENV;
    const originalJwtSecret = process.env.JWT_SECRET;
    process.env.PAYWALL_BYPASS_ENABLED = "true";
    process.env.PAYWALL_BYPASS_EMAILS  = BYPASS_EMAIL;
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "control-finance-production-jwt-secret-123456";

    try {
      const token = await registerAndLogin(BYPASS_EMAIL);
      const userId = await getUserIdByEmail(BYPASS_EMAIL);
      await dbQuery(`UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE id = $1`, [userId]);

      const res = await request(testApp)
        .get("/trial-gated")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(402);
    } finally {
      process.env.PAYWALL_BYPASS_ENABLED = originalEnabled;
      process.env.PAYWALL_BYPASS_EMAILS  = originalEmails;
      process.env.NODE_ENV = originalEnv;
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });
});

describe("structured error codes in 402 responses", () => {
  beforeAll(async () => { await setupTestDb(); });
  afterAll(async () => { await clearDbClientForTests(); });
  beforeEach(resetState);

  it("requireActiveTrialOrPaidPlan retorna code TRIAL_EXPIRED quando trial expirou", async () => {
    const token = await registerAndLogin("code-trial-expired@test.dev");
    const userId = await getUserIdByEmail("code-trial-expired@test.dev");

    await dbQuery(
      `UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
      [userId],
    );

    const res = await request(testApp)
      .get("/trial-gated")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(402);
    expect(res.body.code).toBe("TRIAL_EXPIRED");
  });

  it("requireFeature retorna code FEATURE_GATED para usuario free", async () => {
    const token = await registerAndLogin("code-feature-gated@test.dev");
    const userId = await getUserIdByEmail("code-feature-gated@test.dev");

    await dbQuery(
      `UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
      [userId],
    );

    const res = await request(testApp)
      .get("/feature-gated")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(402);
    expect(res.body.code).toBe("FEATURE_GATED");
  });
});
