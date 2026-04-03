import { hasTaxExtractorForDocumentType } from "../domain/tax/tax-document-extractors.js";
import {
  resolvePolicyBySourceType as resolveDocumentPolicyBySourceType,
  resolveTaxDocumentSourceType as resolveDocumentSourceType,
} from "../domain/tax/tax-document-support-matrix.js";
import { classifyTaxDocumentBuffer } from "./tax-classification.service.js";

const BLOCKED_TEXT_SOURCES = new Set([
  "pdf_text_error",
  "image_text_pending",
  "unsupported_text_source",
]);

const buildBlockingRules = ({
  sourceType,
  documentType,
  textSource,
  supportsExtraction,
  allowsExecution,
}) => {
  const rules = [];

  if (sourceType === "unknown" || documentType === "unknown") {
    rules.push({
      code: "document_type_not_identified",
      reason: "Documento nao identificado com confianca para fluxo automatizado.",
    });
  }

  if (sourceType === "support" || sourceType === "debt") {
    rules.push({
      code: "source_type_requires_manual_review",
      reason: "Tipo documental exige revisao manual antes de qualquer execucao.",
    });
  }

  if (!supportsExtraction) {
    rules.push({
      code: "source_type_not_supported_for_extraction",
      reason: "Tipo documental ainda sem extrator operacional nesta fatia.",
    });
  }

  if (BLOCKED_TEXT_SOURCES.has(textSource)) {
    rules.push({
      code: "text_extraction_unavailable",
      reason: "Texto indisponivel para extracao automatica nesta tentativa.",
    });
  }

  if (!allowsExecution) {
    rules.push({
      code: "execution_not_allowed_for_source_type",
      reason: "Execucao automatica bloqueada para o tipo documental detectado.",
    });
  }

  return rules;
};

export const resolveTaxDocumentSourceType = (documentType) =>
  resolveDocumentSourceType(documentType);

export const previewTaxDocumentBySourceType = async (file) => {
  const classification = await classifyTaxDocumentBuffer({
    buffer: file.buffer,
    originalFileName: file.originalname,
  });

  const sourceType = resolveTaxDocumentSourceType(classification.documentType);
  const policy = resolveDocumentPolicyBySourceType(sourceType);
  const extractorAvailable = hasTaxExtractorForDocumentType(classification.documentType);
  const canExtract =
    policy.supportsExtraction &&
    extractorAvailable &&
    !BLOCKED_TEXT_SOURCES.has(classification.textSource);
  const canSuggest = policy.allowsSuggestion;
  const canExecute = canExtract && policy.allowsExecution;
  const blockingRules = buildBlockingRules({
    sourceType,
    documentType: classification.documentType,
    textSource: classification.textSource,
    supportsExtraction: policy.supportsExtraction,
    allowsExecution: policy.allowsExecution,
  });

  return {
    sourceType,
    detectedState:
      sourceType === "unknown" ? "blocked" : canExecute ? "ready" : "review_required",
    blockingRules,
    capabilities: {
      canExtract,
      canSuggest,
      canExecute,
    },
    documentType: classification.documentType,
    confidenceScore: classification.confidenceScore,
    extractorAvailable,
    sourceLabelSuggestion: classification.sourceLabelSuggestion,
    reasons: [...classification.reasons],
    warnings: [...classification.warnings],
    textSource: classification.textSource,
    textPreviewLines: [
      ...(classification.classificationPayload?.textPreviewLines || []),
    ],
  };
};