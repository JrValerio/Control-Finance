import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import healthRoutes from "./routes/health.routes.js";
import metricsRoutes from "./routes/metrics.routes.js";
import authRoutes from "./routes/auth.routes.js";
import categoriesRoutes from "./routes/categories.routes.js";
import budgetsRoutes from "./routes/budgets.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import transactionsRoutes from "./routes/transactions.routes.js";
import billingRoutes from "./routes/billing.routes.js";
import meRoutes from "./routes/me.routes.js";
import forecastRoutes from "./routes/forecast.routes.js";
import stripeWebhooksRoutes from "./routes/stripe-webhooks.routes.js";
import billsRoutes from "./routes/bills.routes.js";
import incomeSourcesRoutes from "./routes/income-sources.routes.js";
import salaryRoutes from "./routes/salary.routes.js";
import opsRoutes from "./routes/ops.routes.js";
import { notFoundHandler, errorHandler } from "./middlewares/error.middleware.js";
import { requestIdMiddleware } from "./middlewares/request-id.middleware.js";
import { requestLoggingMiddleware } from "./middlewares/request-logging.middleware.js";
import { httpMetricsMiddleware } from "./observability/http-metrics.js";

dotenv.config();

const app = express();

const resolveTrustProxyValue = () => {
  const rawValue = (process.env.TRUST_PROXY || "").trim().toLowerCase();

  if (!rawValue) {
    return process.env.NODE_ENV === "production" ? 1 : false;
  }

  if (rawValue === "true") {
    return true;
  }

  if (rawValue === "false") {
    return false;
  }

  const parsedValue = Number(rawValue);

  if (Number.isInteger(parsedValue) && parsedValue >= 0) {
    return parsedValue;
  }

  return rawValue;
};

app.set("trust proxy", resolveTrustProxyValue());
app.use(requestIdMiddleware);
app.use(httpMetricsMiddleware);
app.use(requestLoggingMiddleware);

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      const corsError = new Error("CORS origin not allowed.");
      corsError.status = 403;
      return callback(corsError);
    },
    credentials: true,
  }),
);

app.use("/billing/webhooks", stripeWebhooksRoutes);
app.use(express.json());
app.use(cookieParser());
app.use("/health", healthRoutes);
app.use("/metrics", metricsRoutes);
app.use("/auth", authRoutes);
app.use("/categories", categoriesRoutes);
app.use("/budgets", budgetsRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/transactions", transactionsRoutes);
app.use("/billing", billingRoutes);
app.use("/me", meRoutes);
app.use("/forecasts", forecastRoutes);
app.use("/bills", billsRoutes);
app.use("/income-sources", incomeSourcesRoutes);
app.use("/salary", salaryRoutes);
app.use("/ops", opsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
