import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { getTaxBootstrapByUser } from "../services/tax-bootstrap.service.js";
import { listTaxDocumentsByUser } from "../services/tax-documents.service.js";
import { getTaxRuleSetsByYear } from "../services/tax-rules.service.js";
import { getTaxSummaryByYear } from "../services/tax-summary.service.js";

const router = Router();

router.use(authMiddleware);

router.get("/", async (req, res, next) => {
  try {
    const bootstrap = await getTaxBootstrapByUser(req.user.id);
    res.status(200).json(bootstrap);
  } catch (error) {
    next(error);
  }
});

router.get("/documents", async (req, res, next) => {
  try {
    const documents = await listTaxDocumentsByUser(req.user.id, req.query ?? {});
    res.status(200).json(documents);
  } catch (error) {
    next(error);
  }
});

router.get("/rules/:taxYear", async (req, res, next) => {
  try {
    const ruleSets = await getTaxRuleSetsByYear(req.user.id, req.params.taxYear);
    res.status(200).json(ruleSets);
  } catch (error) {
    next(error);
  }
});

router.get("/summary/:taxYear", async (req, res, next) => {
  try {
    const summary = await getTaxSummaryByYear(req.user.id, req.params.taxYear);
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
});

export default router;
