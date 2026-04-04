import { Router } from "express";
import path from "node:path";
import multer from "multer";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  importRateLimiter,
  transactionsWriteRateLimiter,
} from "../middlewares/rate-limit.middleware.js";
import { requireFeature } from "../middlewares/entitlement.middleware.js";
import {
  createElapsedTimer,
  logImportEvent,
  trackCommitAttemptMetrics,
  trackCommitFailMetrics,
  trackCommitSuccessMetrics,
  trackDryRunMetrics,
  trackDryRunSemanticDriftMetrics,
  trackDryRunUtilityGateDecisionMetrics,
} from "../observability/import-observability.js";
import {
  trackDomainFlowError,
  trackDomainFlowSuccess,
} from "../observability/domain-metrics.js";
import {
  createTransactionForUser,
  deleteTransactionForUser,
  exportTransactionsCsvByUser,
  getMonthlySummaryForUser,
  listTransactionsByUser,
  restoreTransactionForUser,
  updateTransactionForUser,
} from "../services/transactions.service.js";
import {
  bulkDeleteTransactionsForUser,
  commitTransactionsImportForUser,
  deleteImportSessionForUser,
  dryRunTransactionsImportForUser,
  getTransactionsImportMetricsByUser,
  listTransactionsImportSessionsByUser,
} from "../services/transactions-import.service.ts";
import {
  deleteTransactionImportCategoryRuleForUser,
  listTransactionImportCategoryRulesByUser,
  upsertTransactionImportCategoryRuleForUser,
} from "../services/transactions-import-rules.service.js";

const router = Router();

const IMPORT_METRICS_SUNSET_UTC = "Fri, 31 Jul 2026 23:59:59 GMT";
const IMPORT_MAX_FILE_SIZE_BYTES = Number(
  process.env.IMPORT_CSV_MAX_FILE_SIZE_BYTES || 2 * 1024 * 1024,
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize:
      Number.isInteger(IMPORT_MAX_FILE_SIZE_BYTES) && IMPORT_MAX_FILE_SIZE_BYTES > 0
        ? IMPORT_MAX_FILE_SIZE_BYTES
        : 2 * 1024 * 1024,
  },
});

router.use(authMiddleware);

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const isExplicitConfirmation = (value) => {
  const normalizedValue = String(value || "").trim().toLowerCase();

  return ["true", "1", "yes", "confirm"].includes(normalizedValue);
};

const ensureDestructiveActionConfirmation = (value) => {
  if (!isExplicitConfirmation(value)) {
    throw createError(400, "Confirmacao explicita obrigatoria para esta acao destrutiva.");
  }
};

const ensureValidImportFile = (file) => {
  if (!file) {
    throw createError(400, "Arquivo do extrato (file) e obrigatorio.");
  }

  const originalName = String(file.originalname || "");
  const extension = path.extname(originalName).toLowerCase();
  const mimeType = String(file.mimetype || "").toLowerCase();
  const hasCsvExtension = extension === ".csv";
  const hasPdfExtension = extension === ".pdf";
  const hasOfxExtension = extension === ".ofx";
  const hasCsvMimeType = ["text/csv", "application/csv", "application/vnd.ms-excel"].includes(mimeType);
  const hasPdfMimeType = ["application/pdf"].includes(mimeType);
  const hasOfxMimeType = ["application/ofx", "application/x-ofx", "application/octet-stream"].includes(
    mimeType,
  );

  if (
    (
      !hasCsvExtension &&
      !hasCsvMimeType &&
      !hasPdfExtension &&
      !hasPdfMimeType &&
      !hasOfxExtension &&
      !hasOfxMimeType
    ) ||
    !file.buffer ||
    file.buffer.length === 0
  ) {
    throw createError(400, "Arquivo invalido. Envie um CSV, OFX ou PDF de extrato.");
  }
};

const UTILITY_DOCUMENT_EXPECTED_BILL_TYPES = {
  utility_bill_energy: new Set(["energy"]),
  utility_bill_water: new Set(["water"]),
  utility_bill_gas: new Set(["gas"]),
  utility_bill_telecom: new Set(["internet", "phone", "tv"]),
};

const normalizeBillTypeCandidate = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue || null;
};

const collectObservedBillTypes = (dryRunResult = {}) => {
  const observedTypes = [];
  const suggestionCandidates = [];

  if (dryRunResult?.suggestion && typeof dryRunResult.suggestion === "object") {
    suggestionCandidates.push(dryRunResult.suggestion);
  }

  if (Array.isArray(dryRunResult?.suggestions)) {
    suggestionCandidates.push(...dryRunResult.suggestions);
  }

  suggestionCandidates.forEach((suggestion) => {
    if (!suggestion || typeof suggestion !== "object") {
      return;
    }

    if (String(suggestion.type || "").trim().toLowerCase() !== "bill") {
      return;
    }

    const normalizedBillType = normalizeBillTypeCandidate(suggestion.billType);
    if (normalizedBillType) {
      observedTypes.push(normalizedBillType);
    }
  });

  return [...new Set(observedTypes)];
};

const detectUtilityDryRunSemanticDrift = (dryRunResult = {}) => {
  const normalizedDocumentType =
    typeof dryRunResult?.documentType === "string"
      ? dryRunResult.documentType.trim().toLowerCase()
      : "";

  const expectedBillTypesSet = UTILITY_DOCUMENT_EXPECTED_BILL_TYPES[normalizedDocumentType];

  if (!expectedBillTypesSet) {
    return {
      driftDetected: false,
      documentType: normalizedDocumentType || null,
      expectedBillTypes: [],
      observedBillTypes: [],
      reason: null,
    };
  }

  const observedBillTypes = collectObservedBillTypes(dryRunResult);
  const expectedBillTypes = [...expectedBillTypesSet];

  if (observedBillTypes.length === 0) {
    return {
      driftDetected: true,
      documentType: normalizedDocumentType,
      expectedBillTypes,
      observedBillTypes,
      reason: "missing_bill_suggestion",
    };
  }

  const hasExpectedBillType = observedBillTypes.some((billType) => expectedBillTypesSet.has(billType));

  if (!hasExpectedBillType) {
    return {
      driftDetected: true,
      documentType: normalizedDocumentType,
      expectedBillTypes,
      observedBillTypes,
      reason: "bill_type_mismatch",
    };
  }

  return {
    driftDetected: false,
    documentType: normalizedDocumentType,
    expectedBillTypes,
    observedBillTypes,
    reason: null,
  };
};

const getListFiltersFromQuery = (query = {}, options = {}) => {
  const includePagination = options.includePagination !== false;
  const filters = {
    includeDeleted: String(query.includeDeleted || "").toLowerCase() === "true",
    type: query.type,
    from: query.from,
    to: query.to,
    q: query.q,
    categoryId: query.categoryId,
    sort: query.sort,
  };

  if (includePagination) {
    filters.page = query.page;
    filters.limit = query.limit;
    filters.offset = query.offset;
  }

  return filters;
};

router.get("/export.csv", requireFeature("csv_export"), async (req, res, next) => {
  try {
    const csvExport = await exportTransactionsCsvByUser(
      req.user.id,
      getListFiltersFromQuery(req.query, { includePagination: false }),
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${csvExport.fileName}"`,
    );

    res.status(200).send(csvExport.content);
  } catch (error) {
    next(error);
  }
});

router.get("/summary", async (req, res, next) => {
  try {
    const summary = await getMonthlySummaryForUser(
      req.user.id,
      req.query.month,
      req.query.compare,
    );
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
});

router.get("/imports/metrics", async (req, res, next) => {
  const elapsedTimer = createElapsedTimer();
  const userId = Number(req.user.id);
  const requestId = req.requestId || null;

  try {
    // Compatibility-first prune: mark endpoint as deprecated before hard removal.
    res.setHeader("Deprecation", "true");
    res.setHeader("Sunset", IMPORT_METRICS_SUNSET_UTC);
    res.setHeader("X-Contract-Status", "deprecated");

    const metrics = await getTransactionsImportMetricsByUser(req.user.id);

    logImportEvent("import.metrics.success", {
      requestId,
      userId,
      importId: null,
      total: metrics.total,
      last30Days: metrics.last30Days,
      lastImportAt: metrics.lastImportAt,
      elapsedMs: elapsedTimer(),
      statusCode: 200,
    });

    res.status(200).json(metrics);
  } catch (error) {
    logImportEvent("import.metrics.error", {
      requestId,
      userId,
      importId: null,
      total: 0,
      last30Days: 0,
      lastImportAt: null,
      elapsedMs: elapsedTimer(),
      statusCode: Number.isInteger(error?.status) ? error.status : 500,
      message: error?.message || "Unexpected error.",
    });

    next(error);
  }
});

router.get("/imports", async (req, res, next) => {
  const elapsedTimer = createElapsedTimer();
  const userId = Number(req.user.id);
  const requestId = req.requestId || null;

  try {
    const imports = await listTransactionsImportSessionsByUser(req.user.id, req.query || {});
    const importsSummary = (imports.items || []).reduce(
      (accumulator, item) => {
        const summary = item?.summary || {};

        return {
          rowsTotal: accumulator.rowsTotal + (Number(summary.totalRows) || 0),
          validRows: accumulator.validRows + (Number(summary.validRows) || 0),
          invalidRows: accumulator.invalidRows + (Number(summary.invalidRows) || 0),
        };
      },
      { rowsTotal: 0, validRows: 0, invalidRows: 0 },
    );

    logImportEvent("import.history.list.success", {
      requestId,
      userId,
      importId: null,
      rowsTotal: importsSummary.rowsTotal,
      validRows: importsSummary.validRows,
      invalidRows: importsSummary.invalidRows,
      itemsCount: Array.isArray(imports.items) ? imports.items.length : 0,
      limit: Number(imports.pagination?.limit) || 0,
      offset: Number(imports.pagination?.offset) || 0,
      elapsedMs: elapsedTimer(),
      statusCode: 200,
    });

    res.status(200).json(imports);
  } catch (error) {
    logImportEvent("import.history.list.error", {
      requestId,
      userId,
      importId: null,
      rowsTotal: 0,
      validRows: 0,
      invalidRows: 0,
      elapsedMs: elapsedTimer(),
      statusCode: Number.isInteger(error?.status) ? error.status : 500,
      message: error?.message || "Unexpected error.",
    });

    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const transactions = await listTransactionsByUser(
      req.user.id,
      getListFiltersFromQuery(req.query),
    );
    res.status(200).json(transactions);
  } catch (error) {
    next(error);
  }
});

router.post("/", transactionsWriteRateLimiter, async (req, res, next) => {
  try {
    const transaction = await createTransactionForUser(req.user.id, req.body || {});
    trackDomainFlowSuccess({ flow: "transactions", operation: "create" });
    res.status(201).json(transaction);
  } catch (error) {
    trackDomainFlowError({ flow: "transactions", operation: "create" });
    next(error);
  }
});

router.delete("/imports/:sessionId", transactionsWriteRateLimiter, async (req, res, next) => {
  try {
    ensureDestructiveActionConfirmation(req.body?.confirm ?? req.query?.confirm);
    const result = await deleteImportSessionForUser(req.user.id, req.params.sessionId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/bulk-delete", transactionsWriteRateLimiter, async (req, res, next) => {
  try {
    ensureDestructiveActionConfirmation(req.body?.confirm ?? req.query?.confirm);
    const ids = Array.isArray(req.body?.transactionIds) ? req.body.transactionIds : [];
    const result = await bulkDeleteTransactionsForUser(req.user.id, ids);
    trackDomainFlowSuccess({
      flow: "transactions",
      operation: "bulk_delete",
      records: result.deletedCount,
    });
    res.status(200).json(result);
  } catch (error) {
    trackDomainFlowError({ flow: "transactions", operation: "bulk_delete" });
    next(error);
  }
});

router.patch("/:id", transactionsWriteRateLimiter, async (req, res, next) => {
  try {
    const updatedTransaction = await updateTransactionForUser(
      req.user.id,
      req.params.id,
      req.body || {},
    );
    trackDomainFlowSuccess({ flow: "transactions", operation: "update" });
    res.status(200).json(updatedTransaction);
  } catch (error) {
    trackDomainFlowError({ flow: "transactions", operation: "update" });
    next(error);
  }
});

router.delete("/:id", transactionsWriteRateLimiter, async (req, res, next) => {
  try {
    const removedTransaction = await deleteTransactionForUser(req.user.id, req.params.id);
    trackDomainFlowSuccess({ flow: "transactions", operation: "delete" });
    res.status(200).json({
      id: removedTransaction.id,
      success: true,
    });
  } catch (error) {
    trackDomainFlowError({ flow: "transactions", operation: "delete" });
    next(error);
  }
});

router.post("/:id/restore", transactionsWriteRateLimiter, async (req, res, next) => {
  try {
    const restoredTransaction = await restoreTransactionForUser(req.user.id, req.params.id);
    trackDomainFlowSuccess({ flow: "transactions", operation: "restore" });
    res.status(200).json(restoredTransaction);
  } catch (error) {
    trackDomainFlowError({ flow: "transactions", operation: "restore" });
    next(error);
  }
});

router.post("/import/dry-run", importRateLimiter, requireFeature("csv_import"), (req, res, next) => {
  const elapsedTimer = createElapsedTimer();
  const userId = Number(req.user.id);
  const requestId = req.requestId || null;

  upload.single("file")(req, res, async (error) => {
    if (error) {
      let normalizedError = error;

      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        normalizedError = createError(413, "Arquivo muito grande.");
      }

      logImportEvent("import.dry_run.error", {
        requestId,
        userId,
        importId: null,
        rowsTotal: 0,
        validRows: 0,
        invalidRows: 0,
        elapsedMs: elapsedTimer(),
        statusCode: Number.isInteger(normalizedError?.status) ? normalizedError.status : 500,
        message: normalizedError?.message || "Unexpected error.",
      });

      return next(normalizedError);
    }

    try {
      ensureValidImportFile(req.file);
      const dryRunResult = await dryRunTransactionsImportForUser(req.user.id, req.file);
      const rowsTotal = Number(dryRunResult.summary?.totalRows) || 0;
      const validRows = Number(dryRunResult.summary?.validRows) || 0;
      const invalidRows = Number(dryRunResult.summary?.invalidRows) || 0;
      const semanticDrift = detectUtilityDryRunSemanticDrift(dryRunResult);
      const utilityGateDecision =
        dryRunResult?.utilityBillImportDecision?.decision === "supported"
          ? "supported"
          : dryRunResult?.utilityBillImportDecision?.decision === "blocked"
            ? "blocked"
            : null;

      trackDryRunMetrics({ rowsTotal });
      trackDryRunSemanticDriftMetrics({ driftDetected: semanticDrift.driftDetected });
      trackDryRunUtilityGateDecisionMetrics({ decision: utilityGateDecision });

      if (semanticDrift.driftDetected) {
        logImportEvent("import.dry_run.semantic_drift", {
          requestId,
          userId,
          importId: dryRunResult.importId || null,
          documentType: semanticDrift.documentType,
          expectedBillTypes: semanticDrift.expectedBillTypes,
          observedBillTypes: semanticDrift.observedBillTypes,
          driftReason: semanticDrift.reason,
          elapsedMs: elapsedTimer(),
          statusCode: 200,
        });
      }

      logImportEvent("import.dry_run.success", {
        requestId,
        userId,
        importId: dryRunResult.importId || null,
        rowsTotal,
        validRows,
        invalidRows,
        utilityBillImportDecision: dryRunResult?.utilityBillImportDecision || null,
        elapsedMs: elapsedTimer(),
        statusCode: 200,
      });

      trackDomainFlowSuccess({
        flow: "transactions_import",
        operation: "dry_run",
        records: rowsTotal,
      });

      return res.status(200).json(dryRunResult);
    } catch (serviceError) {
      logImportEvent("import.dry_run.error", {
        requestId,
        userId,
        importId: null,
        rowsTotal: 0,
        validRows: 0,
        invalidRows: 0,
        elapsedMs: elapsedTimer(),
        statusCode: Number.isInteger(serviceError?.status) ? serviceError.status : 500,
        message: serviceError?.message || "Unexpected error.",
      });

      trackDomainFlowError({ flow: "transactions_import", operation: "dry_run" });

      return next(serviceError);
    }
  });
});

router.post("/import/commit", importRateLimiter, requireFeature("csv_import"), async (req, res, next) => {
  const elapsedTimer = createElapsedTimer();
  const userId = Number(req.user.id);
  const requestId = req.requestId || null;
  const requestImportId = typeof req.body?.importId === "string" ? req.body.importId.trim() : null;

  trackCommitAttemptMetrics();

  try {
    const categoryOverrides = Array.isArray(req.body?.categoryOverrides)
      ? req.body.categoryOverrides
      : [];
    const commitResult = await commitTransactionsImportForUser(
      req.user.id,
      req.body?.importId,
      categoryOverrides,
    );
    const observability = commitResult.observability || {};
    const rowsTotal = Number(observability.totalRows) || Number(commitResult.imported) || 0;
    const validRows = Number(observability.validRows) || Number(commitResult.imported) || 0;
    const invalidRows = Number(observability.invalidRows) || 0;

    trackCommitSuccessMetrics({ rowsImported: commitResult.imported });
    trackDomainFlowSuccess({
      flow: "transactions_import",
      operation: "commit",
      records: Number(commitResult.imported) || 0,
    });
    logImportEvent("import.commit.success", {
      requestId,
      userId,
      importId: observability.importId || requestImportId || null,
      rowsTotal,
      validRows,
      invalidRows,
      imported: Number(commitResult.imported) || 0,
      elapsedMs: elapsedTimer(),
      statusCode: 200,
    });

    res.status(200).json({
      imported: commitResult.imported,
      importSessionId: commitResult.importSessionId,
      createdTransactions: commitResult.createdTransactions ?? [],
      summary: commitResult.summary,
    });
  } catch (error) {
    const statusCode = Number.isInteger(error?.status) ? error.status : 500;
    const errorEvent =
      statusCode === 409
        ? "import.commit.already_committed"
        : statusCode === 410
          ? "import.commit.expired"
          : "import.commit.error";

    trackCommitFailMetrics();
    logImportEvent(errorEvent, {
      requestId,
      userId,
      importId: requestImportId,
      rowsTotal: 0,
      validRows: 0,
      invalidRows: 0,
      elapsedMs: elapsedTimer(),
      statusCode,
      message: error?.message || "Unexpected error.",
    });

    trackDomainFlowError({ flow: "transactions_import", operation: "commit" });

    next(error);
  }
});

router.get("/import/rules", requireFeature("csv_import"), async (req, res, next) => {
  try {
    const items = await listTransactionImportCategoryRulesByUser(req.user.id);
    res.status(200).json({ items });
  } catch (error) {
    next(error);
  }
});

router.post("/import/rules", transactionsWriteRateLimiter, requireFeature("csv_import"), async (req, res, next) => {
  try {
    const rule = await upsertTransactionImportCategoryRuleForUser(req.user.id, {
      matchText: req.body?.matchText,
      categoryId: req.body?.categoryId,
      transactionType: req.body?.transactionType,
    });
    res.status(201).json(rule);
  } catch (error) {
    next(error);
  }
});

router.delete("/import/rules/:ruleId", transactionsWriteRateLimiter, requireFeature("csv_import"), async (req, res, next) => {
  try {
    const result = await deleteTransactionImportCategoryRuleForUser(req.user.id, req.params.ruleId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
