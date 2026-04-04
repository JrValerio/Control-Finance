import { describe, expect, it } from "vitest";
import {
  assertJwtEnvironmentConsistency,
  resolveJwtSecretForRuntime,
} from "./jwt-env-guard.js";

describe("jwt env guard", () => {
  it("falha em producao sem JWT_SECRET", () => {
    expect(() =>
      assertJwtEnvironmentConsistency({
        NODE_ENV: "production",
      }),
    ).toThrow("NODE_ENV=production requires JWT_SECRET");
  });

  it("falha em producao com placeholder", () => {
    expect(() =>
      assertJwtEnvironmentConsistency({
        NODE_ENV: "production",
        JWT_SECRET: "troque-isto",
      }),
    ).toThrow("does not allow placeholder/default JWT_SECRET");
  });

  it("falha em producao com segredo curto", () => {
    expect(() =>
      assertJwtEnvironmentConsistency({
        NODE_ENV: "production",
        JWT_SECRET: "abc123",
      }),
    ).toThrow("requires JWT_SECRET with at least 32 characters");
  });

  it("aceita producao com segredo valido", () => {
    expect(() =>
      assertJwtEnvironmentConsistency({
        NODE_ENV: "production",
        JWT_SECRET: "prod-super-secret-jwt-key-with-32-plus",
      }),
    ).not.toThrow();
  });

  it("define fallback deterministico em test quando JWT_SECRET nao existe", () => {
    const env = {
      NODE_ENV: "test",
    };

    const secret = resolveJwtSecretForRuntime(env);

    expect(secret).toBe("control-finance-test-only-jwt-secret");
    expect(env.JWT_SECRET).toBe("control-finance-test-only-jwt-secret");
  });

  it("define fallback deterministico em development quando JWT_SECRET nao existe", () => {
    const env = {
      NODE_ENV: "development",
    };

    const secret = resolveJwtSecretForRuntime(env);

    expect(secret).toBe("control-finance-dev-only-jwt-secret");
    expect(env.JWT_SECRET).toBe("control-finance-dev-only-jwt-secret");
  });
});
