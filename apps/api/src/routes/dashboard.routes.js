import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { getDashboardSnapshot } from "../services/dashboard.service.js";

const router = Router();

router.use(authMiddleware);

router.get("/snapshot", async (req, res, next) => {
  try {
    const snapshot = await getDashboardSnapshot(req.user.id);
    res.status(200).json(snapshot);
  } catch (error) {
    next(error);
  }
});

export default router;
