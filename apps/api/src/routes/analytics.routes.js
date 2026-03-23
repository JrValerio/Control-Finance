import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { attachEntitlements, requireActiveTrialOrPaidPlan } from "../middlewares/entitlement.middleware.js";
import { getMonthlyTrendForUser } from "../services/analytics.service.js";
import { recordPaywallEvent } from "../services/paywall-events.service.js";
import { recordActivationEvent } from "../services/activation-events.service.js";

const router = Router();

const DEFAULT_MONTHS = 6;
const MAX_MONTHS = 24;

router.post("/paywall", authMiddleware, async (req, res, next) => {
  try {
    const { feature, action, context } = req.body ?? {};
    const event = await recordPaywallEvent({
      userId: req.user.id,
      feature,
      action,
      context,
    });
    res.status(201).json(event);
  } catch (error) {
    next(error);
  }
});

router.post("/events", authMiddleware, async (req, res, next) => {
  try {
    const { event } = req.body ?? {};
    const record = await recordActivationEvent({ userId: req.user.id, event });
    res.status(201).json(record);
  } catch (error) {
    next(error);
  }
});

router.get("/trend", authMiddleware, requireActiveTrialOrPaidPlan, attachEntitlements, async (req, res, next) => {
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
