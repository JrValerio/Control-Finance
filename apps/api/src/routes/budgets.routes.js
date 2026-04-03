import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { budgetsWriteRateLimiter } from "../middlewares/rate-limit.middleware.js";
import {
  deleteMonthlyBudgetForUser,
  listMonthlyBudgetsByUser,
  upsertMonthlyBudgetForUser,
} from "../services/budgets.service.js";
import {
  trackDomainFlowError,
  trackDomainFlowSuccess,
} from "../observability/domain-metrics.js";

const router = Router();

router.use(authMiddleware);

router.get("/", async (req, res, next) => {
  try {
    const budgets = await listMonthlyBudgetsByUser(req.user.id, req.query?.month);
    res.status(200).json({ data: budgets });
  } catch (error) {
    next(error);
  }
});

router.post("/", budgetsWriteRateLimiter, async (req, res, next) => {
  try {
    const budget = await upsertMonthlyBudgetForUser(req.user.id, req.body || {});
    trackDomainFlowSuccess({ flow: "budgets", operation: "upsert" });
    res.status(200).json(budget);
  } catch (error) {
    trackDomainFlowError({ flow: "budgets", operation: "upsert" });
    next(error);
  }
});

router.delete("/:id", budgetsWriteRateLimiter, async (req, res, next) => {
  try {
    await deleteMonthlyBudgetForUser(req.user.id, req.params.id);
    trackDomainFlowSuccess({ flow: "budgets", operation: "delete" });
    res.status(204).send();
  } catch (error) {
    trackDomainFlowError({ flow: "budgets", operation: "delete" });
    next(error);
  }
});

export default router;
