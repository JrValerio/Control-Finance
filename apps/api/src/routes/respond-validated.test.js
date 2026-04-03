import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import * as logger from "../observability/logger.js";
import { respondValidated } from "./respond-validated.js";

const createMockRes = () => ({
  statusCode: null,
  payload: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.payload = body;
    return this;
  },
});

describe("respondValidated", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it("returns payload when schema validation succeeds", () => {
    process.env.NODE_ENV = "test";
    const schema = z.object({ amount: z.number() });
    const payload = { amount: 100 };
    const req = { requestId: "req-1", method: "GET", originalUrl: "/sample", user: { id: 10 } };
    const res = createMockRes();

    const response = respondValidated(schema, payload, req, res, { routeLabel: "GET /sample" });

    expect(response).toBe(res);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ amount: 100 });
  });

  it("returns degraded payload in production when schema validation fails", () => {
    process.env.NODE_ENV = "production";
    const schema = z.object({ amount: z.number() });
    const payload = { amount: "100" };
    const req = { requestId: "req-2", method: "GET", originalUrl: "/sample", user: { id: 10 } };
    const res = createMockRes();
    const warnSpy = vi.spyOn(logger, "logWarn");

    const response = respondValidated(schema, payload, req, res, { routeLabel: "GET /sample" });

    expect(response).toBe(res);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({
      amount: "100",
      _degraded: true,
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("throws error in test environment when schema validation fails", () => {
    process.env.NODE_ENV = "test";
    const schema = z.object({ amount: z.number() });
    const payload = { amount: "100" };
    const req = { requestId: "req-3", method: "GET", originalUrl: "/sample", user: { id: 10 } };
    const res = createMockRes();

    expect(() =>
      respondValidated(schema, payload, req, res, { routeLabel: "GET /sample" }),
    ).toThrow("Response contract validation failed.");
  });
});
