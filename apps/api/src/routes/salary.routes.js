import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  getSalaryProfileForUser,
  upsertSalaryProfileForUser,
} from "../services/salary-profile.service.js";

const router = Router();

router.use(authMiddleware);

router.get("/profile", async (req, res, next) => {
  try {
    const profile = await getSalaryProfileForUser(req.user.id);
    res.status(200).json(profile);
  } catch (error) {
    next(error);
  }
});

router.put("/profile", async (req, res, next) => {
  try {
    const profile = await upsertSalaryProfileForUser(req.user.id, req.body || {});
    res.status(200).json(profile);
  } catch (error) {
    next(error);
  }
});

export default router;
