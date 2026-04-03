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

export const resolveTaxDocumentSourceType = (documentType) =>
  SOURCE_TYPE_BY_DOCUMENT_TYPE[String(documentType || "").trim()] || "unknown";

export const previewTaxDocumentBySourceType = async (file) => {
  const classification = await classifyTaxDocumentBuffer({
    buffer: file.buffer,
    originalFileName: file.originalname,
  });

  return {
    sourceType: resolveTaxDocumentSourceType(classification.documentType),
    documentType: classification.documentType,
    confidenceScore: classification.confidenceScore,
    extractorAvailable: hasTaxExtractorForDocumentType(classification.documentType),
    sourceLabelSuggestion: classification.sourceLabelSuggestion,
    reasons: [...classification.reasons],
    warnings: [...classification.warnings],
    textSource: classification.textSource,
    textPreviewLines: [
      ...(classification.classificationPayload?.textPreviewLines || []),
    ],
  };
};