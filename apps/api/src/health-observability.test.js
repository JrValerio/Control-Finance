import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery, setDbClientForTests } from "./db/index.js";
import {
  resetLoginProtectionState,
} from "./middlewares/login-protection.middleware.js";
import {
  resetImportRateLimiterState,
  resetWriteRateLimiterState,
} from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import { expectErrorResponseWithRequestId, setupTestDb } from "./test-helpers.js";

let testDbPool;

describe("health and observability", () => {
  beforeAll(async () => {
    testDbPool = await setupTestDb();
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

  it("GET /health responde com status 200 e sinais operacionais", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(typeof response.body.version).toBe("string");
    expect(response.body.version.length).toBeGreaterThan(0);
    expect(typeof response.body.commit).toBe("string");
    expect(response.body.commit.length).toBeGreaterThan(0);
    expect(typeof response.body.buildTimestamp).toBe("string");
    expect(response.body.buildTimestamp.length).toBeGreaterThan(0);
    expect(typeof response.body.uptimeSeconds).toBe("number");
    expect(response.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(response.body.db).toMatchObject({
      status: "ok",
    });
    expect(typeof response.body.db.latencyMs).toBe("number");
    expect(response.body.db.latencyMs).toBeGreaterThanOrEqual(0);
    expect(typeof response.body.requestId).toBe("string");
    expect(response.body.requestId.length).toBeGreaterThan(0);
    expect(response.body.requestId).toBe(response.headers["x-request-id"]);
    expect(typeof response.body.migrations).toBe("object");
    expect(typeof response.body.migrations.applied).toBe("number");
    expect(response.body.migrations.applied).toBeGreaterThan(0);
    expect(typeof response.body.migrations.latest).toBe("string");
  });

  it("GET /health retorna ok=false e status 503 quando DB falha", async () => {
    setDbClientForTests({
      query: () => Promise.reject(new Error("db unavailable")),
    });

    try {
      const response = await request(app).get("/health");

      expect(response.status).toBe(503);
      expect(response.body.ok).toBe(false);
      expect(response.body.db).toMatchObject({
        status: "error",
      });
      expect(typeof response.body.db.latencyMs).toBe("number");
      expect(response.body.db.latencyMs).toBeGreaterThanOrEqual(0);
      expect(typeof response.body.requestId).toBe("string");
      expect(response.body.requestId.length).toBeGreaterThan(0);
      expect(response.body.requestId).toBe(response.headers["x-request-id"]);
      expect(response.body.migrations).toEqual({ applied: 0, latest: null });
    } finally {
      setDbClientForTests(testDbPool);
    }
  });

  it("echoa x-request-id quando informado no header", async () => {
    const response = await request(app)
      .get("/health")
      .set("x-request-id", "request-id-test-123");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("request-id-test-123");
  });

  it("gera x-request-id quando nao informado no header", async () => {
    const response = await request(app).get("/health");
    const requestId = response.headers["x-request-id"];

    expect(response.status).toBe(200);
    expect(typeof requestId).toBe("string");
    expect(requestId.length).toBeGreaterThan(0);
    expect(requestId.length).toBeLessThanOrEqual(128);
  });

  it("inclui requestId no JSON de erro quando nao informado no header", async () => {
    const response = await request(app).get("/__not_found__");

    expectErrorResponseWithRequestId(response, 404, "Route not found");
  });

  it("ecoa x-request-id no JSON de erro quando informado no header", async () => {
    const response = await request(app)
      .get("/__not_found__")
      .set("x-request-id", "rid-123");

    expectErrorResponseWithRequestId(response, 404, "Route not found");
    expect(response.body.requestId).toBe("rid-123");
    expect(response.headers["x-request-id"]).toBe("rid-123");
  });

  it("GET /metrics expõe formato Prometheus e inclui request counters por classe de status", async () => {
    const successResponse = await request(app).get("/health");
    const notFoundResponse = await request(app).get("/__not_found__");
    const metricsResponse = await request(app).get("/metrics");

    expect(successResponse.status).toBe(200);
    expect(notFoundResponse.status).toBe(404);
    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.headers["content-type"]).toContain("text/plain");
    expect(metricsResponse.text).toContain("# HELP http_requests_total");

    const status2xxMatch = metricsResponse.text.match(/http_requests_total\{status="2xx"\}\s+([0-9.]+)/);
    const status4xxMatch = metricsResponse.text.match(/http_requests_total\{status="4xx"\}\s+([0-9.]+)/);

    expect(status2xxMatch).not.toBeNull();
    expect(status4xxMatch).not.toBeNull();
    expect(Number(status2xxMatch[1])).toBeGreaterThanOrEqual(1);
    expect(Number(status4xxMatch[1])).toBeGreaterThanOrEqual(1);
  });

  it("GET /metrics registra histograma de latencia para endpoint crítico /auth/login", async () => {
    const loginResponse = await request(app).post("/auth/login").send({
      email: "",
      password: "Senha123",
    });
    const metricsResponse = await request(app).get("/metrics");

    expect(loginResponse.status).toBe(400);
    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.text).toContain('# HELP http_request_latency_ms');
    expect(metricsResponse.text).toMatch(
      /http_request_latency_ms_bucket\{[^}]*endpoint="\/auth\/login"[^}]*\}/,
    );
    expect(metricsResponse.text).toContain('http_request_latency_ms_count{endpoint="/auth/login"}');
  });

  it("GET /metrics exige token em production", async () => {
    const envSnapshot = {
      NODE_ENV: process.env.NODE_ENV,
      METRICS_AUTH_TOKEN: process.env.METRICS_AUTH_TOKEN,
    };

    process.env.NODE_ENV = "production";
    process.env.METRICS_AUTH_TOKEN = "metrics-secret";

    try {
      const forbiddenResponse = await request(app).get("/metrics");
      expectErrorResponseWithRequestId(forbiddenResponse, 403, "Forbidden.");

      const authorizedResponse = await request(app)
        .get("/metrics")
        .set("Authorization", "Bearer metrics-secret");

      expect(authorizedResponse.status).toBe(200);
      expect(authorizedResponse.headers["content-type"]).toContain("text/plain");
      expect(authorizedResponse.text).toContain("# HELP http_requests_total");
    } finally {
      if (typeof envSnapshot.NODE_ENV === "undefined") {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = envSnapshot.NODE_ENV;
      }

      if (typeof envSnapshot.METRICS_AUTH_TOKEN === "undefined") {
        delete process.env.METRICS_AUTH_TOKEN;
      } else {
        process.env.METRICS_AUTH_TOKEN = envSnapshot.METRICS_AUTH_TOKEN;
      }
    }
  });
});
