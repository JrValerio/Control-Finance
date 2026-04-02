export const TAX_DOCUMENT_TYPES = Object.freeze([
  "unknown",
  "income_report_bank",
  "income_report_employer",
  "clt_payslip",
  "income_report_inss",
  "medical_statement",
  "education_receipt",
  "loan_statement",
  "bank_statement_support",
]);

export const TAX_DOCUMENT_PROCESSING_STATUSES = Object.freeze([
  "uploaded",
  "classified",
  "extracted",
  "normalized",
  "failed",
]);

export const TAX_FACT_TYPES = Object.freeze([
  "taxable_income",
  "exclusive_tax_income",
  "exempt_income",
  "withheld_tax",
  "asset_balance",
  "debt_balance",
  "medical_deduction",
  "education_deduction",
  "other",
]);

export const TAX_FACT_REVIEW_STATUSES = Object.freeze([
  "pending",
  "approved",
  "corrected",
  "rejected",
]);

export const TAX_FACT_SOURCE_FILTERS = Object.freeze(["with_document", "without_document"]);

export const TAX_RULE_FAMILIES = Object.freeze([
  "obligation",
  "annual_table",
  "monthly_table",
  "deduction_limits",
  "comparison_logic",
  "warning_rules",
]);

export const TAX_DEFAULT_PAGE_SIZE = 20;
export const TAX_MAX_PAGE_SIZE = 100;
