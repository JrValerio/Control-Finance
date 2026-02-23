import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireActiveTrialOrPaidPlan } from "../middlewares/entitlement.middleware.js";
import {
  maybeSendFlipNotification,
  maybeSendPaydayReminder,
} from "../services/notifications.service.js";
import { computeForecast, getLatestForecast } from "../services/forecast.service.js";

const router = Router();

router.use(authMiddleware, requireActiveTrialOrPaidPlan);

const logNotificationError = (userId, notificationType, error) => {
  console.error({
    event: "forecast.notification.failed",
    userId,
    notificationType,
    error: error?.message || "Unknown error",
  });
};

// GET /forecasts/current - latest stored forecast for this month (or null)
router.get("/current", async (req, res, next) => {
  try {
    const forecast = await getLatestForecast(req.user.id);
    res.status(200).json(forecast);
  } catch (error) {
    next(error);
  }
});

// POST /forecasts/recompute - recompute and persist, returns fresh forecast
router.post("/recompute", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const forecast = await computeForecast(userId);

    // Notifications are best-effort and must not break recompute responses.
    void maybeSendFlipNotification(userId, forecast).catch((error) => {
      logNotificationError(userId, "flip_neg", error);
    });
    void maybeSendPaydayReminder(userId, forecast).catch((error) => {
      logNotificationError(userId, "payday_reminder", error);
    });

    res.status(200).json(forecast);
  } catch (error) {
    next(error);
  }
});

export default router;
