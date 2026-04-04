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

const ALLOWED_ORIGIN = "http://localhost:5173";

const getExpectedSameSiteCookieAttribute = () => {
  const rawValue = (process.env.COOKIE_SAME_SITE || "lax").toLowerCase().trim();

  if (rawValue === "none") {
    return "SameSite=None";
  }

  if (rawValue === "strict") {
    return "SameSite=Strict";
  }

  return "SameSite=Lax";
};

describe("http hardening baseline", () => {
  beforeAll(async () => {
    const { setupTestDb } = await import("./test-helpers.js");
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
    await dbQuery("DELETE FROM refresh_tokens");
    await dbQuery("DELETE FROM subscriptions");
    await dbQuery("DELETE FROM users");
  });

  it("applies baseline security headers on sensitive route", async () => {
    const response = await request(app).get("/health").set("Origin", ALLOWED_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(response.headers["cross-origin-embedder-policy"]).toBe("require-corp");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers["x-permitted-cross-domain-policies"]).toBe("none");
    expect(response.headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("keeps OAuth popup compatibility on auth routes", async () => {
    const response = await request(app).get("/auth/me");

    expect(response.status).toBe(401);
    expect(response.headers["cross-origin-opener-policy"]).toBe("same-origin-allow-popups");
  });

  it("enforces minimal CORS contract for allowed origin", async () => {
    const response = await request(app).get("/health").set("Origin", ALLOWED_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("keeps same-origin requests without Origin header working", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("accepts legitimate preflight for allowed frontend origin", async () => {
    const response = await request(app)
      .options("/health")
      .set("Origin", ALLOWED_ORIGIN)
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "content-type");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-methods"]).toContain("GET");
  });

  it("blocks disallowed CORS origin with 403", async () => {
    const response = await request(app)
      .get("/health")
      .set("Origin", "https://malicious.example");

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("CORS origin not allowed.");
  });

  it("issues auth cookies with baseline httpOnly and sameSite flags", async () => {
    const response = await request(app).post("/auth/register").send({
      email: "http-hardening-baseline@test.dev",
      password: "Senha123",
    });

    expect(response.status).toBe(201);
    const cookies = response.headers["set-cookie"] || [];
    const accessCookie = cookies.find((cookie) => cookie.startsWith("cf_access="));
    const refreshCookie = cookies.find((cookie) => cookie.startsWith("cf_refresh="));
    const expectedSameSite = getExpectedSameSiteCookieAttribute();

    expect(accessCookie).toBeTruthy();
    expect(refreshCookie).toBeTruthy();
    expect(accessCookie).toContain("HttpOnly");
    expect(refreshCookie).toContain("HttpOnly");
    expect(accessCookie).toContain(expectedSameSite);
    expect(refreshCookie).toContain(expectedSameSite);
  });
});