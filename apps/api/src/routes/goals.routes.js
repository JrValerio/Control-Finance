import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireActiveTrialOrPaidPlan } from "../middlewares/entitlement.middleware.js";
import { goalsWriteRateLimiter } from "../middlewares/rate-limit.middleware.js";
import {
  listGoalsForUser,
  createGoalForUser,
  updateGoalForUser,
  deleteGoalForUser,
} from "../services/goals.service.js";

const router = Router();

router.use(authMiddleware, requireActiveTrialOrPaidPlan);

// GET /goals
router.get("/", async (req, res, next) => {
  try {
    const goals = await listGoalsForUser(req.user.id);
    res.status(200).json(goals);
  } catch (error) {
    next(error);
  }
});

// POST /goals
router.post("/", goalsWriteRateLimiter, async (req, res, next) => {
  try {
    const goal = await createGoalForUser(req.user.id, req.body ?? {});
    res.status(201).json(goal);
  } catch (error) {
    next(error);
  }
});

// PATCH /goals/:id
router.patch("/:id", goalsWriteRateLimiter, async (req, res, next) => {
  try {
    const goal = await updateGoalForUser(req.user.id, req.params.id, req.body ?? {});
    res.status(200).json(goal);
  } catch (error) {
    next(error);
  }
});

// DELETE /goals/:id
router.delete("/:id", goalsWriteRateLimiter, async (req, res, next) => {
  try {
    await deleteGoalForUser(req.user.id, req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
