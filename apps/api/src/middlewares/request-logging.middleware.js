import { logInfo } from "../observability/logger.js";

const resolveRoutePath = (req) => {
  const fullPath = typeof req?.originalUrl === "string" ? req.originalUrl : req?.url || "/";
  const [pathWithoutQuery] = String(fullPath).split("?");

  return pathWithoutQuery || "/";
};

const resolveLatencyMs = (startedAt) => {
  if (!Number.isFinite(startedAt)) {
    return null;
  }

  return Math.max(0, Date.now() - startedAt);
};

const resolveUserId = (req) => {
  const parsedUserId = Number(req?.user?.id);
  return Number.isInteger(parsedUserId) && parsedUserId > 0 ? parsedUserId : null;
};

const normalizeContextValue = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 80);
};

const resolveClientContext = (req) => ({
  feature: normalizeContextValue(req.headers?.["x-cf-feature"]),
  widget: normalizeContextValue(req.headers?.["x-cf-widget"]),
  operation: normalizeContextValue(req.headers?.["x-cf-operation"]),
});

export const requestLoggingMiddleware = (req, res, next) => {
  const startedAt = Date.now();

  req.requestStartedAt = startedAt;

  res.on("finish", () => {
    logInfo({
      event: "http.request.completed",
      requestId: req.requestId || null,
      method: req.method,
      route: resolveRoutePath(req),
      status: res.statusCode,
      latencyMs: resolveLatencyMs(startedAt),
      userId: resolveUserId(req),
      ...resolveClientContext(req),
    });
  });

  next();
};
