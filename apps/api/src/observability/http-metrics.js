import { Counter, Histogram, Registry } from "prom-client";

const METRICS_ENDPOINT_PATH = "/metrics";
const CRITICAL_ENDPOINTS = new Set(["/transactions", "/categories", "/auth/login"]);

export const metricsRegistry = new Registry();

const httpRequestsTotalCounter = new Counter({
  name: "http_requests_total",
  help: "Total de requisicoes HTTP agrupadas por classe de status.",
  labelNames: ["status"],
  registers: [metricsRegistry],
});

const httpRequestLatencyHistogram = new Histogram({
  name: "http_request_latency_ms",
  help: "Latencia HTTP em milissegundos para endpoints criticos.",
  labelNames: ["endpoint"],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000],
  registers: [metricsRegistry],
});

const resolveRoutePath = (req) => {
  const fullPath = typeof req?.originalUrl === "string" ? req.originalUrl : req?.url || "/";
  const [pathWithoutQuery] = String(fullPath).split("?");
  return pathWithoutQuery || "/";
};

const resolveStatusClass = (statusCode) => {
  if (!Number.isInteger(statusCode) || statusCode < 100) {
    return "unknown";
  }

  if (statusCode >= 200 && statusCode < 300) {
    return "2xx";
  }

  if (statusCode >= 300 && statusCode < 400) {
    return "3xx";
  }

  if (statusCode >= 400 && statusCode < 500) {
    return "4xx";
  }

  if (statusCode >= 500 && statusCode < 600) {
    return "5xx";
  }

  return "unknown";
};

const resolveCriticalEndpoint = (routePath) => {
  if (routePath === "/auth/login") {
    return "/auth/login";
  }

  if (routePath.startsWith("/transactions")) {
    return "/transactions";
  }

  if (routePath.startsWith("/categories")) {
    return "/categories";
  }

  return null;
};

export const httpMetricsMiddleware = (req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    const routePath = resolveRoutePath(req);

    if (routePath === METRICS_ENDPOINT_PATH) {
      return;
    }

    const statusClass = resolveStatusClass(res.statusCode);
    httpRequestsTotalCounter.inc({ status: statusClass });

    const criticalEndpoint = resolveCriticalEndpoint(routePath);

    if (!criticalEndpoint || !CRITICAL_ENDPOINTS.has(criticalEndpoint)) {
      return;
    }

    const latencyMs = Math.max(0, Date.now() - startedAt);
    httpRequestLatencyHistogram.observe({ endpoint: criticalEndpoint }, latencyMs);
  });

  next();
};

export const getMetricsContentType = () => metricsRegistry.contentType;

export const getMetricsSnapshot = async () => metricsRegistry.metrics();

export const resetHttpMetricsForTests = () => {
  metricsRegistry.resetMetrics();
};
