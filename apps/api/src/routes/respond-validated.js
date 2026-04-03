import { logWarn } from "../observability/logger.js";

const resolveRoutePath = (req, routeLabel) => {
  if (typeof routeLabel === "string" && routeLabel.trim()) {
    return routeLabel.trim();
  }

  const rawRoute = (req?.originalUrl || req?.url || "/").split("?")[0];
  return rawRoute || "/";
};

const resolveUserId = (req) => {
  const parsedUserId = Number(req?.user?.id);
  if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
    return null;
  }

  return parsedUserId;
};

const summarizeIssues = (error) =>
  Array.isArray(error?.issues)
    ? error.issues.map((issue) => ({
        code: issue.code,
        path: Array.isArray(issue.path) ? issue.path.join(".") : "",
        message: issue.message,
      }))
    : [];

const buildDegradedPayload = (payload) => {
  if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    return {
      ...payload,
      _degraded: true,
    };
  }

  return {
    data: payload,
    _degraded: true,
  };
};

const isTestEnvironment = () => process.env.NODE_ENV === "test";

export const respondValidated = (schema, payload, req, res, options = {}) => {
  const status = Number.isInteger(options?.status) ? options.status : 200;
  const route = resolveRoutePath(req, options?.routeLabel);

  const parsed = schema.safeParse(payload);
  if (parsed.success) {
    return res.status(status).json(parsed.data);
  }

  const issues = summarizeIssues(parsed.error);
  logWarn({
    event: "http.response.validation.failed",
    requestId: req?.requestId || null,
    route,
    method: req?.method || null,
    userId: resolveUserId(req),
    status,
    degraded: !isTestEnvironment(),
    issues,
  });

  if (isTestEnvironment()) {
    const error = new Error("Response contract validation failed.");
    error.status = 500;
    error.internalMessage = `route=${route}; issues=${JSON.stringify(issues)}`;
    throw error;
  }

  return res.status(status).json(buildDegradedPayload(payload));
};
