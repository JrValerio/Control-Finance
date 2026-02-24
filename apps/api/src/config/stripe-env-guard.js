const normalizeEnvValue = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeSecretKey = (value) =>
  typeof value === "string" ? value.trim() : "";

const createStripeEnvError = (message) => {
  const error = new Error(message);
  error.code = "STRIPE_ENV_MISMATCH";
  return error;
};

export const assertStripeEnvironmentConsistency = (env = process.env) => {
  const nodeEnv = normalizeEnvValue(env.NODE_ENV || "");
  const stripeSecretKey = normalizeSecretKey(env.STRIPE_SECRET_KEY || "");

  // Guardrail only applies when a Stripe key is configured.
  if (!stripeSecretKey) {
    return;
  }

  const isLiveKey = stripeSecretKey.startsWith("sk_live_");
  const isTestKey = stripeSecretKey.startsWith("sk_test_");

  if (!isLiveKey && !isTestKey) {
    return;
  }

  if (nodeEnv === "production" && isTestKey) {
    throw createStripeEnvError(
      "Invalid Stripe environment: NODE_ENV=production requires STRIPE_SECRET_KEY starting with sk_live_.",
    );
  }

  if (nodeEnv !== "production" && isLiveKey) {
    throw createStripeEnvError(
      "Invalid Stripe environment: non-production environments require STRIPE_SECRET_KEY starting with sk_test_.",
    );
  }
};

