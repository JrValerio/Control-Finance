import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const DEFAULT_IMPORT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_IMPORT_RATE_LIMIT_MAX_REQUESTS = 10;
const DEFAULT_WRITE_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_WRITE_RATE_LIMIT_MAX_REQUESTS = 60;
const WRITE_RATE_LIMIT_ERROR_MESSAGE = "Muitas requisicoes. Tente novamente em instantes.";

const parsePositiveInteger = (value, fallbackValue) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return fallbackValue;
  }

  return parsedValue;
};

const getImportRateLimitWindowMs = () =>
  parsePositiveInteger(
    process.env.IMPORT_RATE_LIMIT_WINDOW_MS,
    DEFAULT_IMPORT_RATE_LIMIT_WINDOW_MS,
  );

const getImportRateLimitMaxRequests = () =>
  parsePositiveInteger(
    process.env.IMPORT_RATE_LIMIT_MAX,
    DEFAULT_IMPORT_RATE_LIMIT_MAX_REQUESTS,
  );

const getWriteRateLimitWindowMs = () =>
  parsePositiveInteger(
    process.env.WRITE_RATE_LIMIT_WINDOW_MS,
    DEFAULT_WRITE_RATE_LIMIT_WINDOW_MS,
  );

const getWriteRateLimitMaxRequests = () =>
  parsePositiveInteger(
    process.env.WRITE_RATE_LIMIT_MAX,
    DEFAULT_WRITE_RATE_LIMIT_MAX_REQUESTS,
  );

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const resolveRateLimitKey = (request, keyPrefix = "") => {
  const requestKey = request.user?.id
    ? `user:${request.user.id}`
    : `ip:${ipKeyGenerator(request.ip || "")}`;

  if (!keyPrefix) {
    return requestKey;
  }

  return `${keyPrefix}:${requestKey}`;
};

const createRateLimitExceededHandler =
  (message = WRITE_RATE_LIMIT_ERROR_MESSAGE) =>
  (_request, _response, next) => {
    next(createError(429, message));
  };

const createUserWriteRateLimiter = (keyPrefix) =>
  rateLimit({
    windowMs: getWriteRateLimitWindowMs(),
    max: getWriteRateLimitMaxRequests(),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (request) => resolveRateLimitKey(request, keyPrefix),
    handler: createRateLimitExceededHandler(),
  });

export const importRateLimiter = rateLimit({
  windowMs: getImportRateLimitWindowMs(),
  max: getImportRateLimitMaxRequests(),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (request) => resolveRateLimitKey(request, "import"),
  handler: createRateLimitExceededHandler(),
});

export const transactionsWriteRateLimiter = createUserWriteRateLimiter("transactions-write");
export const categoriesWriteRateLimiter = createUserWriteRateLimiter("categories-write");
export const budgetsWriteRateLimiter = createUserWriteRateLimiter("budgets-write");
export const billsWriteRateLimiter = createUserWriteRateLimiter("bills-write");
export const incomeSourcesWriteRateLimiter = createUserWriteRateLimiter("income-sources-write");

export const resetImportRateLimiterState = () => {
  if (importRateLimiter?.store?.resetAll) {
    importRateLimiter.store.resetAll();
  }
};

export const resetWriteRateLimiterState = () => {
  [
    transactionsWriteRateLimiter,
    categoriesWriteRateLimiter,
    budgetsWriteRateLimiter,
    billsWriteRateLimiter,
    incomeSourcesWriteRateLimiter,
  ].forEach((limiter) => {
    if (limiter?.store?.resetAll) {
      limiter.store.resetAll();
    }
  });
};
