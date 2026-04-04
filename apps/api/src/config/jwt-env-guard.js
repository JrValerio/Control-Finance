const normalizeEnvValue = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeSecretValue = (value) =>
  typeof value === "string" ? value.trim() : "";

const MIN_PRODUCTION_JWT_SECRET_LENGTH = 32;
const DEFAULT_DEV_JWT_SECRET = "control-finance-dev-only-jwt-secret";
const DEFAULT_TEST_JWT_SECRET = "control-finance-test-only-jwt-secret";

const PLACEHOLDER_SECRETS = new Set([
  "secret",
  "default",
  "changeme",
  "change-me",
  "troque-isto",
  "your_jwt_secret",
  "jwt_secret",
  "control-finance-dev-secret",
  DEFAULT_DEV_JWT_SECRET,
  DEFAULT_TEST_JWT_SECRET,
]);

const createJwtEnvError = (message, code = "JWT_SECRET_INVALID") => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const isPlaceholderSecret = (secret) => {
  const normalizedSecret = normalizeEnvValue(secret);

  if (!normalizedSecret) {
    return true;
  }

  if (PLACEHOLDER_SECRETS.has(normalizedSecret)) {
    return true;
  }

  return normalizedSecret.includes("changeme") || normalizedSecret.includes("troque");
};

const resolveDefaultSecretForNodeEnv = (nodeEnv) =>
  nodeEnv === "test" ? DEFAULT_TEST_JWT_SECRET : DEFAULT_DEV_JWT_SECRET;

export const resolveJwtSecretForRuntime = (env = process.env) => {
  const nodeEnv = normalizeEnvValue(env.NODE_ENV || "development");
  const configuredSecret = normalizeSecretValue(env.JWT_SECRET || "");

  if (nodeEnv === "production") {
    if (!configuredSecret) {
      throw createJwtEnvError(
        "Invalid JWT environment: NODE_ENV=production requires JWT_SECRET to be explicitly configured.",
        "JWT_SECRET_MISSING",
      );
    }

    if (isPlaceholderSecret(configuredSecret)) {
      throw createJwtEnvError(
        "Invalid JWT environment: NODE_ENV=production does not allow placeholder/default JWT_SECRET values.",
      );
    }

    if (configuredSecret.length < MIN_PRODUCTION_JWT_SECRET_LENGTH) {
      throw createJwtEnvError(
        `Invalid JWT environment: NODE_ENV=production requires JWT_SECRET with at least ${MIN_PRODUCTION_JWT_SECRET_LENGTH} characters.`,
      );
    }

    return configuredSecret;
  }

  if (configuredSecret) {
    return configuredSecret;
  }

  const fallbackSecret = resolveDefaultSecretForNodeEnv(nodeEnv);
  env.JWT_SECRET = fallbackSecret;
  return fallbackSecret;
};

export const assertJwtEnvironmentConsistency = (env = process.env) => {
  resolveJwtSecretForRuntime(env);
};
