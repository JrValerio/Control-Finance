import { TAX_DOCUMENT_TYPES } from "./tax.constants.js";

export const TAX_DOCUMENT_SUPPORT_MATRIX_VERSION = "2026-04-03.aud-001";

export const SOURCE_TYPE_BY_DOCUMENT_TYPE = Object.freeze({
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

export const SOURCE_TYPE_POLICY = Object.freeze({
  income: {
    supportLevel: "supported",
    supportsExtraction: true,
    allowsSuggestion: true,
    allowsExecution: true,
  },
  deduction: {
    supportLevel: "supported",
    supportsExtraction: true,
    allowsSuggestion: true,
    allowsExecution: true,
  },
  debt: {
    supportLevel: "restricted",
    supportsExtraction: false,
    allowsSuggestion: true,
    allowsExecution: false,
  },
  support: {
    supportLevel: "restricted",
    supportsExtraction: false,
    allowsSuggestion: true,
    allowsExecution: false,
  },
  unknown: {
    supportLevel: "not_supported",
    supportsExtraction: false,
    allowsSuggestion: false,
    allowsExecution: false,
  },
});

export const resolveTaxDocumentSourceType = (documentType) =>
  SOURCE_TYPE_BY_DOCUMENT_TYPE[String(documentType || "").trim()] || "unknown";

export const resolvePolicyBySourceType = (sourceType) =>
  SOURCE_TYPE_POLICY[String(sourceType || "").trim()] || SOURCE_TYPE_POLICY.unknown;

export const listTaxDocumentSupportMatrix = () =>
  TAX_DOCUMENT_TYPES.map((documentType) => {
    const sourceType = resolveTaxDocumentSourceType(documentType);
    const policy = resolvePolicyBySourceType(sourceType);

    return {
      documentType,
      sourceType,
      supportLevel: policy.supportLevel,
      supportsExtraction: policy.supportsExtraction,
      allowsSuggestion: policy.allowsSuggestion,
      allowsExecution: policy.allowsExecution,
    };
  });
