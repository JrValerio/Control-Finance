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
import { requireActiveTrialOrPaidPlan } from "./middlewares/entitlement.middleware.js";

// Mount a minimal app just for testing this middleware
const testApp = express();
testApp.use(express.json());
testApp.get(
  "/trial-gated",
  authMiddleware,
  requireActiveTrialOrPaidPlan,
  (_req, res) => res.json({ ok: true }),
);
// eslint-disable-next-line no-unused-vars
testApp.use((err, _req, res, next) => {
  res.status(err.status || 500).json({ message: err.message });
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
});
