import { Router } from "express";
import path from "node:path";
import multer from "multer";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { getTaxBootstrapByUser } from "../services/tax-bootstrap.service.js";
import {
  createTaxDocumentForUser,
  getTaxDocumentByIdForUser,
  listTaxDocumentsByUser,
} from "../services/tax-documents.service.js";
import { processTaxDocumentByIdForUser } from "../services/tax-extraction.service.js";
import { listTaxFactsByUser } from "../services/tax-facts.service.js";
import { bulkApproveTaxFactsByUser, reviewTaxFactByUser } from "../services/tax-reviews.service.js";
import { getTaxRuleSetsByYear } from "../services/tax-rules.service.js";
import { getTaxSummaryByYear } from "../services/tax-summary.service.js";

const router = Router();
const TAX_DOCUMENT_MAX_FILE_SIZE_BYTES = Number(
  process.env.TAX_DOCUMENT_MAX_FILE_SIZE_BYTES || 10 * 1024 * 1024,
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize:
      Number.isInteger(TAX_DOCUMENT_MAX_FILE_SIZE_BYTES) && TAX_DOCUMENT_MAX_FILE_SIZE_BYTES > 0
        ? TAX_DOCUMENT_MAX_FILE_SIZE_BYTES
        : 10 * 1024 * 1024,
  },
});

router.use(authMiddleware);

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const ensureValidTaxDocumentFile = (file) => {
  if (!file) {
    throw createError(400, "Arquivo fiscal (file) e obrigatorio.");
  }

  const originalName = String(file.originalname || "");
  const extension = path.extname(originalName).toLowerCase();
  const mimeType = String(file.mimetype || "").toLowerCase();
  const hasPdfExtension = extension === ".pdf";
  const hasCsvExtension = extension === ".csv";
  const hasPngExtension = extension === ".png";
  const hasJpgExtension = extension === ".jpg" || extension === ".jpeg";
  const hasPdfMimeType = mimeType === "application/pdf";
  const hasCsvMimeType = ["text/csv", "application/csv", "application/vnd.ms-excel"].includes(
    mimeType,
  );
  const hasPngMimeType = mimeType === "image/png";
  const hasJpgMimeType = ["image/jpeg", "image/jpg"].includes(mimeType);

  if (
    (
      !hasPdfExtension &&
      !hasCsvExtension &&
      !hasPngExtension &&
      !hasJpgExtension &&
      !hasPdfMimeType &&
      !hasCsvMimeType &&
      !hasPngMimeType &&
      !hasJpgMimeType
    ) ||
    !file.buffer ||
    file.buffer.length === 0
  ) {
    throw createError(400, "Arquivo invalido. Envie um PDF, CSV, PNG ou JPG.");
  }
};

router.get("/", async (req, res, next) => {
  try {
    const bootstrap = await getTaxBootstrapByUser(req.user.id);
    res.status(200).json(bootstrap);
  } catch (error) {
    next(error);
  }
});

router.post("/documents", (req, res, next) => {
  upload.single("file")(req, res, async (error) => {
    if (error) {
      let normalizedError = error;

      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        normalizedError = createError(413, "Arquivo muito grande.");
      }

      return next(normalizedError);
    }

    try {
      ensureValidTaxDocumentFile(req.file);
      const document = await createTaxDocumentForUser(req.user.id, req.body ?? {}, req.file);
      return res.status(201).json({ document });
    } catch (serviceError) {
      return next(serviceError);
    }
  });
});

router.get("/documents", async (req, res, next) => {
  try {
    const documents = await listTaxDocumentsByUser(req.user.id, req.query ?? {});
    res.status(200).json(documents);
  } catch (error) {
    next(error);
  }
});

router.get("/documents/:id", async (req, res, next) => {
  try {
    const document = await getTaxDocumentByIdForUser(req.user.id, req.params.id);
    res.status(200).json(document);
  } catch (error) {
    next(error);
  }
});

router.post("/documents/:id/reprocess", async (req, res, next) => {
  try {
    const document = await processTaxDocumentByIdForUser(req.user.id, req.params.id);
    res.status(200).json(document);
  } catch (error) {
    next(error);
  }
});

router.get("/facts", async (req, res, next) => {
  try {
    const facts = await listTaxFactsByUser(req.user.id, req.query ?? {});
    res.status(200).json(facts);
  } catch (error) {
    next(error);
  }
});

router.post("/facts/bulk-review", async (req, res, next) => {
  try {
    const result = await bulkApproveTaxFactsByUser(req.user.id, req.body ?? {});
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.patch("/facts/:id/review", async (req, res, next) => {
  try {
    const result = await reviewTaxFactByUser(req.user.id, req.params.id, req.body ?? {});
    res.status(200).json(result);
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
