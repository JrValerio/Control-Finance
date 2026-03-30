import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { billsWriteRateLimiter } from "../middlewares/rate-limit.middleware.js";
import {
  createBillForUser,
  createBillsBatchForUser,
  listBillsByUser,
  getBillsSummaryForUser,
  getUtilityBillsPanelForUser,
  updateBillForUser,
  deleteBillForUser,
  markBillAsPaidForUser,
} from "../services/bills.service.js";

const router = Router();

router.use(authMiddleware);

router.get("/summary", async (req, res, next) => {
  try {
    const summary = await getBillsSummaryForUser(req.user.id);
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
});

router.get("/utility-panel", async (req, res, next) => {
  try {
    const panel = await getUtilityBillsPanelForUser(req.user.id);
    res.status(200).json(panel);
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const result = await listBillsByUser(req.user.id, {
      status: req.query.status,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/", billsWriteRateLimiter, async (req, res, next) => {
  try {
    const bill = await createBillForUser(req.user.id, req.body || {});
    res.status(201).json(bill);
  } catch (error) {
    next(error);
  }
});

// POST /bills/batch — create N bills atomically (installments)
router.post("/batch", billsWriteRateLimiter, async (req, res, next) => {
  try {
    const bills = await createBillsBatchForUser(req.user.id, req.body?.bills ?? []);
    res.status(201).json({ bills });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/mark-paid", billsWriteRateLimiter, async (req, res, next) => {
  try {
    const result = await markBillAsPaidForUser(req.user.id, req.params.id, req.body || {});
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", billsWriteRateLimiter, async (req, res, next) => {
  try {
    const bill = await updateBillForUser(req.user.id, req.params.id, req.body || {});
    res.status(200).json(bill);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", billsWriteRateLimiter, async (req, res, next) => {
  try {
    await deleteBillForUser(req.user.id, req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
