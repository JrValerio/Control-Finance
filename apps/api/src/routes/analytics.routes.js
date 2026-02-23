import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { attachEntitlements, requireActiveTrialOrPaidPlan } from "../middlewares/entitlement.middleware.js";
import { getMonthlyTrendForUser } from "../services/analytics.service.js";

const router = Router();

const DEFAULT_MONTHS = 6;
const MAX_MONTHS = 24;

router.use(authMiddleware, requireActiveTrialOrPaidPlan);

router.get("/trend", attachEntitlements, async (req, res, next) => {
  try {
    const cap = req.entitlements.analytics_months_max;
    const rawMonths = req.query?.months;

    if (rawMonths !== undefined) {
      const parsedMonths = Number(String(rawMonths).trim());

      if (Number.isInteger(parsedMonths) && parsedMonths >= 1 && parsedMonths <= MAX_MONTHS && parsedMonths > cap) {
        const error = new Error("Limite de historico excedido no plano gratuito.");
        error.status = 402;
        return next(error);
      }
    }

    const effectiveMonths = rawMonths !== undefined ? rawMonths : Math.min(DEFAULT_MONTHS, cap);
    const trend = await getMonthlyTrendForUser(req.user.id, effectiveMonths);
    res.status(200).json(trend);
  } catch (error) {
    next(error);
  }
});

export default router;
