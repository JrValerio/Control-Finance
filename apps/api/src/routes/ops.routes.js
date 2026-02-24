import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { forcePlanForEmail } from "../services/ops-force-plan.service.js";

const router = Router();

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const readHeaderValue = (value) => {
  if (Array.isArray(value)) {
    const firstItem = value.find(
      (item) => typeof item === "string" && item.trim(),
    );
    return readHeaderValue(firstItem || "");
  }

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const secureTokenEquals = (provided, expected) => {
  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
};

const isProduction = () =>
  (process.env.NODE_ENV || "").trim().toLowerCase() === "production";

const getOpsToken = () =>
  typeof process.env.OPS_TOKEN === "string" ? process.env.OPS_TOKEN.trim() : "";

router.use((req, _res, next) => {
  if (isProduction()) {
    return next(createError(404, "Route not found"));
  }

  const expectedToken = getOpsToken();

  if (!expectedToken) {
    return next(createError(404, "Route not found"));
  }

  const providedToken = readHeaderValue(req.headers["x-ops-token"]);

  if (!providedToken || !secureTokenEquals(providedToken, expectedToken)) {
    return next(createError(401, "Ops token ausente ou invalido."));
  }

  return next();
});

router.post("/force-plan", async (req, res, next) => {
  try {
    const result = await forcePlanForEmail({
      email: req.body?.email,
      plan: req.body?.plan,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;

