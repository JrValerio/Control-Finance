import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { incomeSourcesWriteRateLimiter } from "../middlewares/rate-limit.middleware.js";
import {
  createIncomeSourceForUser,
  listIncomeSourcesForUser,
  updateIncomeSourceForUser,
  deleteIncomeSourceForUser,
  createDeductionForSource,
  updateDeductionForSource,
  deleteDeductionForSource,
  createStatementDraftForSource,
  getStatementWithDeductions,
  updateStatementForSource,
  postStatementForSource,
  listStatementsForSource,
  linkStatementToTransaction,
} from "../services/income-sources.service.js";

const router = Router();

router.use(authMiddleware);

// ─── Income Sources ────────────────────────────────────────────────────────────

router.get("/", async (req, res, next) => {
  try {
    const sources = await listIncomeSourcesForUser(req.user.id);
    res.status(200).json({ sources });
  } catch (error) {
    next(error);
  }
});

router.post("/", incomeSourcesWriteRateLimiter, async (req, res, next) => {
  try {
    const source = await createIncomeSourceForUser(req.user.id, req.body || {});
    res.status(201).json(source);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", incomeSourcesWriteRateLimiter, async (req, res, next) => {
  try {
    const source = await updateIncomeSourceForUser(req.user.id, req.params.id, req.body || {});
    res.status(200).json(source);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", incomeSourcesWriteRateLimiter, async (req, res, next) => {
  try {
    await deleteIncomeSourceForUser(req.user.id, req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ─── Deductions ────────────────────────────────────────────────────────────────

router.post("/:id/deductions", incomeSourcesWriteRateLimiter, async (req, res, next) => {
  try {
    const deduction = await createDeductionForSource(req.user.id, req.params.id, req.body || {});
    res.status(201).json(deduction);
  } catch (error) {
    next(error);
  }
});

router.patch("/deductions/:deductionId", incomeSourcesWriteRateLimiter, async (req, res, next) => {
  try {
    const deduction = await updateDeductionForSource(
      req.user.id,
      req.params.deductionId,
      req.body || {},
    );
    res.status(200).json(deduction);
  } catch (error) {
    next(error);
  }
});

router.delete("/deductions/:deductionId", incomeSourcesWriteRateLimiter, async (req, res, next) => {
  try {
    await deleteDeductionForSource(req.user.id, req.params.deductionId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ─── Statements ────────────────────────────────────────────────────────────────

router.get("/:id/statements", async (req, res, next) => {
  try {
    const statements = await listStatementsForSource(req.user.id, req.params.id);
    res.status(200).json({ statements });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/statements", incomeSourcesWriteRateLimiter, async (req, res, next) => {
  try {
    const result = await createStatementDraftForSource(req.user.id, req.params.id, req.body || {});
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/statements/:statementId", async (req, res, next) => {
  try {
    const result = await getStatementWithDeductions(req.user.id, req.params.statementId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.patch("/statements/:statementId", incomeSourcesWriteRateLimiter, async (req, res, next) => {
  try {
    const result = await updateStatementForSource(
      req.user.id,
      req.params.statementId,
      req.body || {},
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/statements/:statementId/post",
  incomeSourcesWriteRateLimiter,
  async (req, res, next) => {
    try {
      const result = await postStatementForSource(req.user.id, req.params.statementId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/statements/:statementId/link-transaction",
  incomeSourcesWriteRateLimiter,
  async (req, res, next) => {
    try {
      const statement = await linkStatementToTransaction(
        req.user.id,
        req.params.statementId,
        req.body?.transactionId,
      );
      res.status(200).json({ statement });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
