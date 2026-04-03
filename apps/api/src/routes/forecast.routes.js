import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  ForecastCurrentResponseSchema,
  ForecastRecomputeResponseSchema,
} from "../domain/contracts/forecast-response.schema.ts";
import { requireActiveTrialOrPaidPlan } from "../middlewares/entitlement.middleware.js";
import { logWarn } from "../observability/logger.js";
import { respondValidated } from "./respond-validated.js";
import {
  maybeSendFlipNotification,
  maybeSendPaydayReminder,
} from "../services/notifications.service.js";
import { computeForecast, getLatestForecast } from "../services/forecast.service.js";

const router = Router();

router.use(authMiddleware, requireActiveTrialOrPaidPlan);

const logNotificationError = (requestId, userId, notificationType, error) => {
  logWarn({
    event: "forecast.notification.failed",
    requestId: requestId || null,
    userId,
    notificationType,
    error: error?.message || "Unknown error",
  });
};

// GET /forecasts/current - latest stored forecast for this month (or null)
router.get("/current", async (req, res, next) => {
  try {
    const forecast = await getLatestForecast(req.user.id);
    respondValidated(ForecastCurrentResponseSchema, forecast, req, res, {
      routeLabel: "GET /forecasts/current",
    });
  } catch (error) {
    next(error);
  }
});

// POST /forecasts/recompute - recompute and persist, returns fresh forecast
router.post("/recompute", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const requestId = req.requestId || null;
    const forecast = await computeForecast(userId);

    // Notifications are best-effort and must not break recompute responses.
    void maybeSendFlipNotification(userId, forecast).catch((error) => {
      logNotificationError(requestId, userId, "flip_neg", error);
    });
    void maybeSendPaydayReminder(userId, forecast).catch((error) => {
      logNotificationError(requestId, userId, "payday_reminder", error);
    });

    respondValidated(ForecastRecomputeResponseSchema, forecast, req, res, {
      routeLabel: "POST /forecasts/recompute",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
