import { dbQuery } from "../db/index.js";
import { createTaxError, normalizeTaxUserId, normalizeTaxYear } from "../domain/tax/tax.validation.js";
import { logInfo, logWarn } from "../observability/logger.js";
import {
  previewTaxDocumentProcessingByIdForUser,
  processTaxDocumentByIdForUser,
} from "./tax-extraction.service.js";
import { rebuildTaxSummaryByYear } from "./tax-summary.service.js";

const DEFAULT_BATCH_LIMIT = 50;
const MAX_BATCH_LIMIT = 200;

const normalizeBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "y"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "n"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
};

const normalizeOptionalPositiveInteger = (value, fieldName, { max = Number.MAX_SAFE_INTEGER } = {}) => {
  if (typeof value === "undefined" || value === null || value === "") {
    return undefined;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0 || parsedValue > max) {
    throw createTaxError(400, `${fieldName} invalido.`);
  }

  return parsedValue;
};

const normalizeBatchLimit = (value) =>
  normalizeOptionalPositiveInteger(value, "limit", { max: MAX_BATCH_LIMIT }) || DEFAULT_BATCH_LIMIT;

const normalizeDocumentNumber = (value) => String(value || "").replace(/\D/g, "");

const resolveFactOwnerDocument = (fact) => {
  const metadata = fact?.metadataJson || fact?.metadata_json || {};

  return normalizeDocumentNumber(
    metadata.beneficiaryDocument ||
      metadata.customerDocument ||
      metadata.studentDocument ||
      metadata.ownerDocument,
  );
};

const isFactEligibleForOfficialCalc = (fact, taxpayerCpf) => {
  const normalizedTaxpayerCpf = normalizeDocumentNumber(taxpayerCpf);

  if (!normalizedTaxpayerCpf) {
    return true;
  }

  const ownerDocument = resolveFactOwnerDocument(fact);

  if (!ownerDocument) {
    return true;
  }

  return ownerDocument === normalizedTaxpayerCpf;
};

const getUserTaxpayerCpf = async (userId, cache) => {
  if (cache.has(userId)) {
    return cache.get(userId);
  }

  const result = await dbQuery(
    `SELECT taxpayer_cpf
     FROM user_profiles
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );
  const taxpayerCpf = normalizeDocumentNumber(result.rows[0]?.taxpayer_cpf);
  cache.set(userId, taxpayerCpf);
  return taxpayerCpf;
};

const listEligibleTaxDocuments = async ({
  limit,
  userId,
  taxYear,
  afterDocumentId,
}) => {
  const whereClauses = ["1 = 1"];
  const params = [];

  if (userId) {
    params.push(userId);
    whereClauses.push(`user_id = $${params.length}`);
  }

  if (taxYear) {
    params.push(taxYear);
    whereClauses.push(`tax_year = $${params.length}`);
  }

  if (afterDocumentId) {
    params.push(afterDocumentId);
    whereClauses.push(`id > $${params.length}`);
  }

  params.push(limit);

  const result = await dbQuery(
    `SELECT
       id,
       user_id,
       tax_year,
       original_file_name,
       document_type,
       processing_status
     FROM tax_documents
     WHERE ${whereClauses.join(" AND ")}
     ORDER BY id ASC
     LIMIT $${params.length}`,
    params,
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    userId: Number(row.user_id),
    taxYear: Number(row.tax_year),
    originalFileName: row.original_file_name,
    documentType: row.document_type,
    processingStatus: row.processing_status,
  }));
};

export const reprocessLegacyTaxDocuments = async (payload = {}) => {
  const dryRun = normalizeBoolean(payload.dryRun, false);
  const userId = normalizeOptionalPositiveInteger(payload.userId, "userId")
    ? normalizeTaxUserId(payload.userId)
    : undefined;
  const taxYear =
    typeof payload.taxYear === "undefined" || payload.taxYear === null || payload.taxYear === ""
      ? undefined
      : normalizeTaxYear(payload.taxYear);
  const limit = normalizeBatchLimit(payload.limit);
  const afterDocumentId = normalizeOptionalPositiveInteger(payload.afterDocumentId, "afterDocumentId");

  const documents = await listEligibleTaxDocuments({
    limit,
    userId,
    taxYear,
    afterDocumentId,
  });
  const taxpayerCpfCache = new Map();
  const summaryKeysToRebuild = new Set();
  const items = [];
  let succeeded = 0;
  let failed = 0;
  let updatedExtractions = 0;
  let updatedTaxFacts = 0;
  let totalFactsGenerated = 0;
  let excludedByCpfMismatch = 0;

  for (const document of documents) {
    try {
      const taxpayerCpf = await getUserTaxpayerCpf(document.userId, taxpayerCpfCache);
      const preview = await previewTaxDocumentProcessingByIdForUser(document.userId, document.id);
      const eligibleFactsCount = preview.normalizedFacts.filter((fact) =>
        isFactEligibleForOfficialCalc(fact, taxpayerCpf)
      ).length;
      const excludedFactsCount = Math.max(preview.normalizedFacts.length - eligibleFactsCount, 0);

      const item = {
        documentId: document.id,
        userId: document.userId,
        taxYear: document.taxYear,
        originalFileName: document.originalFileName,
        documentTypeBefore: document.documentType,
        documentTypeAfter: preview.classification.documentType,
        statusBefore: document.processingStatus,
        statusAfter: "normalized",
        factsGenerated: preview.normalizedFacts.length,
        officialEligibleFacts: eligibleFactsCount,
        excludedByCpfMismatch: excludedFactsCount,
        dryRun,
      };

      if (!dryRun) {
        await processTaxDocumentByIdForUser(document.userId, document.id);
        summaryKeysToRebuild.add(`${document.userId}:${document.taxYear}`);
        updatedExtractions += 1;
        updatedTaxFacts += 1;
      }

      succeeded += 1;
      totalFactsGenerated += preview.normalizedFacts.length;
      excludedByCpfMismatch += excludedFactsCount;
      items.push(item);

      logInfo({
        event: "tax.legacy_reprocess.document_processed",
        dryRun,
        documentId: document.id,
        userId: document.userId,
        taxYear: document.taxYear,
        statusBefore: document.processingStatus,
        statusAfter: item.statusAfter,
        documentTypeBefore: document.documentType,
        documentTypeAfter: preview.classification.documentType,
        factsGenerated: preview.normalizedFacts.length,
        officialEligibleFacts: eligibleFactsCount,
        excludedByCpfMismatch: excludedFactsCount,
      });
    } catch (error) {
      failed += 1;
      items.push({
        documentId: document.id,
        userId: document.userId,
        taxYear: document.taxYear,
        originalFileName: document.originalFileName,
        documentTypeBefore: document.documentType,
        statusBefore: document.processingStatus,
        statusAfter: "failed",
        factsGenerated: 0,
        officialEligibleFacts: 0,
        excludedByCpfMismatch: 0,
        dryRun,
        error: error?.message || "Falha ao reprocessar documento fiscal.",
      });

      logWarn({
        event: "tax.legacy_reprocess.document_failed",
        dryRun,
        documentId: document.id,
        userId: document.userId,
        taxYear: document.taxYear,
        statusBefore: document.processingStatus,
        error: error?.message || "unknown_tax_legacy_reprocess_error",
      });
    }
  }

  let summariesRebuilt = 0;

  if (!dryRun) {
    for (const summaryKey of summaryKeysToRebuild) {
      const [summaryUserId, summaryTaxYear] = summaryKey.split(":").map(Number);

      try {
        await rebuildTaxSummaryByYear(summaryUserId, summaryTaxYear);
        summariesRebuilt += 1;
      } catch (error) {
        logWarn({
          event: "tax.legacy_reprocess.summary_rebuild_failed",
          userId: summaryUserId,
          taxYear: summaryTaxYear,
          error: error?.message || "unknown_tax_summary_rebuild_error",
        });
      }
    }
  }

  return {
    dryRun,
    processed: documents.length,
    succeeded,
    failed,
    updatedExtractions,
    updatedTaxFacts,
    totalFactsGenerated,
    excludedByCpfMismatch,
    summariesRebuilt,
    nextAfterDocumentId: documents.length > 0 ? documents[documents.length - 1].id : null,
    items,
  };
};
