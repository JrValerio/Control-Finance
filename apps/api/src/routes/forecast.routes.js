import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireActiveTrialOrPaidPlan } from "../middlewares/entitlement.middleware.js";
import { computeForecast, getLatestForecast } from "../services/forecast.service.js";

const router = Router();

router.use(authMiddleware, requireActiveTrialOrPaidPlan);

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
    const forecast = await computeForecast(req.user.id);
    res.status(200).json(forecast);
  } catch (error) {
    next(error);
  }
});

export default router;
