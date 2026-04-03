import { hasTaxExtractorForDocumentType } from "../domain/tax/tax-document-extractors.js";
import { classifyTaxDocumentBuffer } from "./tax-classification.service.js";

const SOURCE_TYPE_BY_DOCUMENT_TYPE = Object.freeze({
  income_report_bank: "income",
  income_report_employer: "income",
  clt_payslip: "income",
  income_report_inss: "income",
  medical_statement: "deduction",
  education_receipt: "deduction",
  loan_statement: "debt",
  bank_statement_support: "support",
  unknown: "unknown",
});

const SOURCE_TYPE_POLICY = Object.freeze({
  income: {
    supportsExtraction: true,
    allowsSuggestion: true,
    allowsExecution: true,
  },
  deduction: {
    supportsExtraction: true,
    allowsSuggestion: true,
    allowsExecution: true,
  },
  debt: {
    supportsExtraction: false,
    allowsSuggestion: true,
    allowsExecution: false,
  },
  support: {
    supportsExtraction: false,
    allowsSuggestion: true,
    allowsExecution: false,
  },
  unknown: {
    supportsExtraction: false,
    allowsSuggestion: false,
    allowsExecution: false,
  },
});

const BLOCKED_TEXT_SOURCES = new Set([
  "pdf_text_error",
  "image_text_pending",
  "unsupported_text_source",
]);

const resolvePolicyBySourceType = (sourceType) =>
  SOURCE_TYPE_POLICY[String(sourceType || "").trim()] || SOURCE_TYPE_POLICY.unknown;

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
  SOURCE_TYPE_BY_DOCUMENT_TYPE[String(documentType || "").trim()] || "unknown";

export const previewTaxDocumentBySourceType = async (file) => {
  const classification = await classifyTaxDocumentBuffer({
    buffer: file.buffer,
    originalFileName: file.originalname,
  });

  const sourceType = resolveTaxDocumentSourceType(classification.documentType);
  const policy = resolvePolicyBySourceType(sourceType);
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