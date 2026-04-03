import { createTaxError } from "../domain/tax/tax.validation.js";
import { createTaxDocumentForUser } from "./tax-documents.service.js";
import { previewTaxDocumentBySourceType } from "./tax-document-preview.service.js";
import { processTaxDocumentByIdForUser } from "./tax-extraction.service.js";

const EXECUTION_BLOCKING_CODES = new Set([
  "document_type_not_identified",
  "source_type_requires_manual_review",
  "source_type_not_supported_for_extraction",
  "text_extraction_unavailable",
  "execution_not_allowed_for_source_type",
]);

const normalizeExecuteWhenAllowed = (value) => {
  if (typeof value === "undefined" || value === null || String(value).trim() === "") {
    return true;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalizedValue = String(value).trim().toLowerCase();

  if (["true", "1", "sim", "yes"].includes(normalizedValue)) {
    return true;
  }

  if (["false", "0", "nao", "no"].includes(normalizedValue)) {
    return false;
  }

  throw createTaxError(400, "executeWhenAllowed invalido. Use true ou false.");
};

const selectExecutionBlockingRules = (preview) =>
  preview.blockingRules.filter((rule) => EXECUTION_BLOCKING_CODES.has(rule.code));

const buildIngestionPayload = (payload = {}, preview) => {
  const normalizedPayload = payload && typeof payload === "object" ? { ...payload } : {};
  const hasSourceLabel =
    typeof normalizedPayload.sourceLabel === "string" && normalizedPayload.sourceLabel.trim();

  delete normalizedPayload.executeWhenAllowed;

  if (!hasSourceLabel && preview.capabilities.canSuggest && preview.sourceLabelSuggestion) {
    normalizedPayload.sourceLabel = preview.sourceLabelSuggestion;
  }

  return normalizedPayload;
};

export const ingestAndExecuteTaxDocumentBySourceType = async ({
  userId,
  payload = {},
  file,
}) => {
  const executionRequested = normalizeExecuteWhenAllowed(payload.executeWhenAllowed);
  const preview = await previewTaxDocumentBySourceType(file);
  const ingestionAllowed = preview.detectedState !== "blocked";

  if (!ingestionAllowed) {
    return {
      preview,
      ingestion: {
        allowed: false,
        status: "blocked",
        documentId: null,
        blockingRules: [...preview.blockingRules],
      },
      suggestion: {
        allowed: preview.capabilities.canSuggest,
        sourceLabelSuggestion: preview.capabilities.canSuggest
          ? preview.sourceLabelSuggestion
          : null,
      },
      execution: {
        requested: executionRequested,
        allowed: false,
        status: "not_allowed",
        documentId: null,
        blockingRules: selectExecutionBlockingRules(preview),
      },
    };
  }

  const ingestedDocument = await createTaxDocumentForUser(
    userId,
    buildIngestionPayload(payload, preview),
    file,
  );

  const executionAllowed = preview.capabilities.canExecute;
  let executionStatus = "not_requested";
  let executionDocumentId = null;
  let executionBlockingRules = [];

  if (executionRequested && executionAllowed) {
    const processedDocument = await processTaxDocumentByIdForUser(userId, ingestedDocument.id);
    executionStatus = "executed";
    executionDocumentId = Number(processedDocument?.document?.id || ingestedDocument.id);
  }

  if (executionRequested && !executionAllowed) {
    executionStatus = "not_allowed";
    executionBlockingRules = selectExecutionBlockingRules(preview);
  }

  return {
    preview,
    ingestion: {
      allowed: true,
      status: "ingested",
      documentId: Number(ingestedDocument.id),
      blockingRules: [],
    },
    suggestion: {
      allowed: preview.capabilities.canSuggest,
      sourceLabelSuggestion: preview.capabilities.canSuggest
        ? preview.sourceLabelSuggestion
        : null,
    },
    execution: {
      requested: executionRequested,
      allowed: executionAllowed,
      status: executionStatus,
      documentId: executionDocumentId,
      blockingRules: executionBlockingRules,
    },
  };
};
