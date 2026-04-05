import { performance } from "node:perf_hooks";
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
  createTransactionsForUser,
  registerAndLogin,
  setupTestDb,
} from "./test-helpers.js";

const PROTOCOL = {
  endpoint: "/transactions",
  query: { limit: 20, offset: 0 },
  warmupRequests: 12,
  measurementRequests: 60,
  concurrency: 6,
};

const percentile = (values, p) => {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[index].toFixed(2));
};

const average = (values) => {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(2));
};

const runConcurrentRequests = async ({
  totalRequests,
  concurrency,
  execute,
}) => {
  const durations = [];
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const requestIndex = nextIndex;
      nextIndex += 1;

      if (requestIndex >= totalRequests) {
        return;
      }

      const start = performance.now();
      await execute();
      durations.push(performance.now() - start);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return durations;
};

describe("performance baseline: transactions list", () => {
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
    await dbQuery("DELETE FROM subscriptions");
    await dbQuery("DELETE FROM users");
  });

  it("AUD-021 baseline protocol: mede p95/p99 de GET /transactions autenticado", async () => {
    const token = await registerAndLogin("aud021-latency-baseline@controlfinance.dev");
    await createTransactionsForUser(token, 30);

    const executeRequest = async () => {
      const response = await request(app)
        .get(PROTOCOL.endpoint)
        .set("Authorization", `Bearer ${token}`)
        .query(PROTOCOL.query);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toMatchObject({
        page: 1,
        limit: PROTOCOL.query.limit,
      });
    };

    await runConcurrentRequests({
      totalRequests: PROTOCOL.warmupRequests,
      concurrency: PROTOCOL.concurrency,
      execute: executeRequest,
    });

    const measuredDurations = await runConcurrentRequests({
      totalRequests: PROTOCOL.measurementRequests,
      concurrency: PROTOCOL.concurrency,
      execute: executeRequest,
    });

    const p95Ms = percentile(measuredDurations, 95);
    const p99Ms = percentile(measuredDurations, 99);
    const avgMs = average(measuredDurations);
    const minMs = Number(Math.min(...measuredDurations).toFixed(2));
    const maxMs = Number(Math.max(...measuredDurations).toFixed(2));

    const summary = {
      protocolVersion: "aud-021-v1",
      endpoint: PROTOCOL.endpoint,
      query: PROTOCOL.query,
      warmupRequests: PROTOCOL.warmupRequests,
      measurementRequests: PROTOCOL.measurementRequests,
      concurrency: PROTOCOL.concurrency,
      sampleSize: measuredDurations.length,
      p95Ms,
      p99Ms,
      avgMs,
      minMs,
      maxMs,
      capturedAt: new Date().toISOString(),
    };

    console.info(`AUD021_BASELINE_RESULT ${JSON.stringify(summary)}`);

    expect(summary.sampleSize).toBe(PROTOCOL.measurementRequests);
    expect(summary.p95Ms).toBeGreaterThan(0);
    expect(summary.p99Ms).toBeGreaterThanOrEqual(summary.p95Ms);
    expect(summary.maxMs).toBeGreaterThanOrEqual(summary.p99Ms);
  });
});