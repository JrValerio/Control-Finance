import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { creditCardsWriteRateLimiter } from "../middlewares/rate-limit.middleware.js";
import {
  listCreditCardsByUser,
  createCreditCardForUser,
  updateCreditCardForUser,
  createCreditCardPurchaseForUser,
  createCreditCardInstallmentsForUser,
  deleteCreditCardPurchaseForUser,
  closeCreditCardInvoiceForUser,
  reopenCreditCardInvoiceForUser,
} from "../services/credit-cards.service.js";
import {
  parseCreditCardInvoicePdfForUser,
  listCreditCardInvoicesForUser,
  linkBillToInvoiceForUser,
} from "../services/credit-card-invoices.service.js";

const INVOICE_PDF_MAX_BYTES = Number(process.env.INVOICE_PDF_MAX_SIZE_BYTES || 10 * 1024 * 1024);

const invoiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize:
      Number.isInteger(INVOICE_PDF_MAX_BYTES) && INVOICE_PDF_MAX_BYTES > 0
        ? INVOICE_PDF_MAX_BYTES
        : 10 * 1024 * 1024,
  },
});

const ensureInvoicePdfFile = (file) => {
  if (!file || !file.buffer || file.buffer.length === 0) {
    const err = new Error("Arquivo PDF (file) e obrigatorio.");
    err.status = 400;
    throw err;
  }
  const ext = path.extname(String(file.originalname || "")).toLowerCase();
  const mime = String(file.mimetype || "").toLowerCase();
  if (ext !== ".pdf" && mime !== "application/pdf") {
    const err = new Error("Apenas arquivos PDF sao aceitos.");
    err.status = 400;
    throw err;
  }
};

const router = Router();

router.use(authMiddleware);

router.get("/", async (req, res, next) => {
  try {
    const result = await listCreditCardsByUser(req.user.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/", creditCardsWriteRateLimiter, async (req, res, next) => {
  try {
    const card = await createCreditCardForUser(req.user.id, req.body || {});
    res.status(201).json(card);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", creditCardsWriteRateLimiter, async (req, res, next) => {
  try {
    const card = await updateCreditCardForUser(req.user.id, req.params.id, req.body || {});
    res.status(200).json(card);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/purchases", creditCardsWriteRateLimiter, async (req, res, next) => {
  try {
    const purchase = await createCreditCardPurchaseForUser(req.user.id, req.params.id, req.body || {});
    res.status(201).json(purchase);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/installments", creditCardsWriteRateLimiter, async (req, res, next) => {
  try {
    const result = await createCreditCardInstallmentsForUser(
      req.user.id,
      req.params.id,
      req.body || {},
    );
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.delete("/purchases/:purchaseId", creditCardsWriteRateLimiter, async (req, res, next) => {
  try {
    await deleteCreditCardPurchaseForUser(req.user.id, req.params.purchaseId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post("/:id/close-invoice", creditCardsWriteRateLimiter, async (req, res, next) => {
  try {
    const result = await closeCreditCardInvoiceForUser(req.user.id, req.params.id, req.body || {});
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/invoices/:invoiceId/reopen", creditCardsWriteRateLimiter, async (req, res, next) => {
  try {
    const result = await reopenCreditCardInvoiceForUser(req.user.id, req.params.invoiceId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// ─── Credit card invoice PDF import ──────────────────────────────────────────

router.post("/:id/invoices/parse-pdf", creditCardsWriteRateLimiter, (req, res, next) => {
  invoiceUpload.single("file")(req, res, async (uploadError) => {
    if (uploadError) {
      if (uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_SIZE") {
        const err = new Error("Arquivo muito grande. Limite: 10 MB.");
        err.status = 413;
        return next(err);
      }
      return next(uploadError);
    }
    try {
      ensureInvoicePdfFile(req.file);
      const invoice = await parseCreditCardInvoicePdfForUser(
        req.user.id,
        req.params.id,
        req.file.buffer
      );
      return res.status(201).json(invoice);
    } catch (error) {
      return next(error);
    }
  });
});

router.get("/:id/invoices", async (req, res, next) => {
  try {
    const invoices = await listCreditCardInvoicesForUser(req.user.id, req.params.id);
    res.status(200).json(invoices);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/invoices/:invoiceId/link-bill", creditCardsWriteRateLimiter, async (req, res, next) => {
  try {
    const invoice = await linkBillToInvoiceForUser(
      req.user.id,
      req.params.id,
      req.params.invoiceId,
      req.body || {}
    );
    res.status(200).json(invoice);
  } catch (error) {
    next(error);
  }
});

export default router;
