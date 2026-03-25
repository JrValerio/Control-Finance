import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireActiveTrialOrPaidPlan } from "../middlewares/entitlement.middleware.js";
import { aiRateLimiter } from "../middlewares/rate-limit.middleware.js";
import { generateFinancialInsight } from "../services/ai.service.js";

const router = Router();

// GET /ai/insight — generates a Claude Haiku financial insight for the current user.
// Returns null when no forecast exists or AI call fails (never 500 from LLM errors).
router.get("/insight", authMiddleware, requireActiveTrialOrPaidPlan, aiRateLimiter, async (req, res, next) => {
  try {
    const insight = await generateFinancialInsight(req.user.id);
    res.status(200).json(insight);
  } catch (error) {
    next(error);
  }
});

export default router;
