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
import {
  getMatchCandidatesForBill,
  confirmBillMatch,
  unmatchBill,
} from "../services/reconciliation.service.js";
import {
  trackDomainFlowError,
  trackDomainFlowSuccess,
} from "../observability/domain-metrics.js";

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
      bucket: req.query.bucket,
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
    trackDomainFlowSuccess({ flow: "bills", operation: "create" });
    res.status(201).json(bill);
  } catch (error) {
    trackDomainFlowError({ flow: "bills", operation: "create" });
    next(error);
  }
});

// POST /bills/batch — create N bills atomically (installments)
router.post("/batch", billsWriteRateLimiter, async (req, res, next) => {
  try {
    const bills = await createBillsBatchForUser(req.user.id, req.body?.bills ?? []);
    trackDomainFlowSuccess({
      flow: "bills",
      operation: "create_batch",
      records: Array.isArray(bills) ? bills.length : 0,
    });
    res.status(201).json({ bills });
  } catch (error) {
    trackDomainFlowError({ flow: "bills", operation: "create_batch" });
    next(error);
  }
});

router.patch("/:id/mark-paid", billsWriteRateLimiter, async (req, res, next) => {
  try {
    const result = await markBillAsPaidForUser(req.user.id, req.params.id, req.body || {});
    trackDomainFlowSuccess({ flow: "bills", operation: "mark_paid" });
    res.status(200).json(result);
  } catch (error) {
    trackDomainFlowError({ flow: "bills", operation: "mark_paid" });
    next(error);
  }
});

router.patch("/:id", billsWriteRateLimiter, async (req, res, next) => {
  try {
    const bill = await updateBillForUser(req.user.id, req.params.id, req.body || {});
    trackDomainFlowSuccess({ flow: "bills", operation: "update" });
    res.status(200).json(bill);
  } catch (error) {
    trackDomainFlowError({ flow: "bills", operation: "update" });
    next(error);
  }
});

router.delete("/:id", billsWriteRateLimiter, async (req, res, next) => {
  try {
    await deleteBillForUser(req.user.id, req.params.id);
    trackDomainFlowSuccess({ flow: "bills", operation: "delete" });
    res.status(204).send();
  } catch (error) {
    trackDomainFlowError({ flow: "bills", operation: "delete" });
    next(error);
  }
});

// ─── Reconciliation ───────────────────────────────────────────────────────────

router.get("/:id/match-candidates", async (req, res, next) => {
  try {
    const result = await getMatchCandidatesForBill(req.user.id, req.params.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/confirm-match", billsWriteRateLimiter, async (req, res, next) => {
  try {
    const result = await confirmBillMatch(req.user.id, req.params.id, req.body || {});
    trackDomainFlowSuccess({ flow: "bills", operation: "confirm_match" });
    res.status(200).json(result);
  } catch (error) {
    trackDomainFlowError({ flow: "bills", operation: "confirm_match" });
    if (error.publicCode === "DIVERGENCE_CONFIRMATION_REQUIRED") {
      return res.status(422).json({
        message: error.message,
        code: error.publicCode,
        divergencePercent: error.divergencePercent,
      });
    }
    next(error);
  }
});

router.delete("/:id/match", billsWriteRateLimiter, async (req, res, next) => {
  try {
    const result = await unmatchBill(req.user.id, req.params.id);
    trackDomainFlowSuccess({ flow: "bills", operation: "unmatch" });
    res.status(200).json(result);
  } catch (error) {
    trackDomainFlowError({ flow: "bills", operation: "unmatch" });
    next(error);
  }
});

export default router;
