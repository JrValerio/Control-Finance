import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { DashboardSnapshotResponseSchema } from "../domain/contracts/dashboard-response.schema.ts";
import { respondValidated } from "./respond-validated.js";
import { getDashboardSnapshot } from "../services/dashboard.service.ts";

const router = Router();

router.use(authMiddleware);

router.get("/snapshot", async (req, res, next) => {
  try {
    const snapshot = await getDashboardSnapshot(req.user.id);
    respondValidated(DashboardSnapshotResponseSchema, snapshot, req, res, {
      routeLabel: "GET /dashboard/snapshot",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
