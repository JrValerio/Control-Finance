import { describe, expect, it } from "vitest";
import { assertStripeEnvironmentConsistency } from "./stripe-env-guard.js";

describe("stripe env guard", () => {
  it("permite sem STRIPE_SECRET_KEY configurada", () => {
    expect(() => {
      assertStripeEnvironmentConsistency({
        NODE_ENV: "staging",
        STRIPE_SECRET_KEY: "",
      });
    }).not.toThrow();
  });

  it("permite sk_test em staging", () => {
    expect(() => {
      assertStripeEnvironmentConsistency({
        NODE_ENV: "staging",
        STRIPE_SECRET_KEY: "sk_test_example",
      });
    }).not.toThrow();
  });

  it("bloqueia sk_live em staging", () => {
    expect(() => {
      assertStripeEnvironmentConsistency({
        NODE_ENV: "staging",
        STRIPE_SECRET_KEY: "sk_live_example",
      });
    }).toThrow("non-production");
  });

  it("bloqueia sk_test em production", () => {
    expect(() => {
      assertStripeEnvironmentConsistency({
        NODE_ENV: "production",
        STRIPE_SECRET_KEY: "sk_test_example",
      });
    }).toThrow("NODE_ENV=production");
  });

  it("permite sk_live em production", () => {
    expect(() => {
      assertStripeEnvironmentConsistency({
        NODE_ENV: "production",
        STRIPE_SECRET_KEY: "sk_live_example",
      });
    }).not.toThrow();
  });

  it("ignora prefixo desconhecido", () => {
    expect(() => {
      assertStripeEnvironmentConsistency({
        NODE_ENV: "staging",
        STRIPE_SECRET_KEY: "rk_live_example",
      });
    }).not.toThrow();
  });
});

