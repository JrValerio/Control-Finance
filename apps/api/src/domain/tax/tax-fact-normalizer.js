import { createHash } from "node:crypto";

const TAX_FACT_NORMALIZER_VERSION = "1.1.0";

const normalizeTrimmedText = (value) =>
  String(value || "")
    .replace(/[º°]/g, "o")
    .trim();

const normalizeDocumentNumber = (value) => normalizeTrimmedText(value).replace(/\D/g, "");

const normalizeRoundedAmount = (value) => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  const normalizedAmount = Number(Math.abs(parsedValue).toFixed(2));
  return normalizedAmount > 0 ? normalizedAmount : null;
};

const normalizeConfidenceScore = (value) => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return Number(Math.max(0, Math.min(1, parsedValue)).toFixed(4));
};

const compactObject = (value = {}) =>
  Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => {
      if (entryValue === null || typeof entryValue === "undefined" || entryValue === "") {
        return false;
      }

      if (Array.isArray(entryValue) && entryValue.length === 0) {
        return false;
      }

      return true;
    }),
  );

const parseBrDateToIsoDate = (value) => {
  const normalizedValue = normalizeTrimmedText(value);
  const brDateMatch = normalizedValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!brDateMatch) {
    return normalizedValue;
  }

  const [, dayPart, monthPart, yearPart] = brDateMatch;
  return `${yearPart}-${monthPart}-${dayPart}`;
};

const parseReferenceMonthToIsoMonth = (value) => {
  const normalizedValue = normalizeTrimmedText(value);
  const match = normalizedValue.match(/^(\d{2})\/(\d{4})$/);

  if (!match) {
    return normalizedValue;
  }

  const [, monthPart, yearPart] = match;
  return `${yearPart}-${monthPart}`;
};

const resolveReportYear = (reportYear, taxYear) => {
  const parsedValue = Number(reportYear);

  if (Number.isInteger(parsedValue) && parsedValue >= 2000 && parsedValue <= 2100) {
    return parsedValue;
  }

  return Number(taxYear) - 1;
};

export const generateTaxFactDedupeKey = ({
  userId,
  taxYear,
  factType,
  payerDocument = "",
  referencePeriod = "",
  amount,
  dedupeDiscriminator = "",
}) =>
  createHash("sha256")
    .update(
      [
        Number(userId),
        Number(taxYear),
        normalizeTrimmedText(factType),
        normalizeDocumentNumber(payerDocument) || "none",
        normalizeTrimmedText(referencePeriod) || "none",
        Number(amount).toFixed(2),
        normalizeTrimmedText(dedupeDiscriminator) || "none",
      ].join("|"),
    )
    .digest("hex");

const buildNormalizedFact = ({
  userId,
  document,
  extraction,
  factType,
  subcategory,
  payerName = "",
  payerDocument = "",
  referencePeriod = "",
  amount,
  metadata = {},
  dedupeDiscriminator = "",
}) => {
  const normalizedAmount = normalizeRoundedAmount(amount);

  if (normalizedAmount === null) {
    return null;
  }

  const normalizedPayerName = normalizeTrimmedText(payerName);
  const normalizedPayerDocument = normalizeDocumentNumber(payerDocument);
  const normalizedReferencePeriod = normalizeTrimmedText(referencePeriod);
  const normalizedDedupeDiscriminator = normalizeTrimmedText(dedupeDiscriminator);

  return {
    userId: Number(userId),
    taxYear: Number(document.taxYear),
    sourceDocumentId: Number(document.id),
    factType,
    category: document.documentType,
    subcategory,
    payerName: normalizedPayerName,
    payerDocument: normalizedPayerDocument,
    referencePeriod: normalizedReferencePeriod,
    currency: "BRL",
    amount: normalizedAmount,
    confidenceScore: normalizeConfidenceScore(extraction.confidenceScore),
    dedupeKey: generateTaxFactDedupeKey({
      userId,
      taxYear: document.taxYear,
      factType,
      payerDocument: normalizedPayerDocument,
      referencePeriod: normalizedReferencePeriod,
      amount: normalizedAmount,
      dedupeDiscriminator: normalizedDedupeDiscriminator,
    }),
    dedupeStrength: "strong",
    metadataJson: compactObject({
      normalizerVersion: TAX_FACT_NORMALIZER_VERSION,
      sourceDocumentType: document.documentType,
      sourceExtractionId: extraction.id,
      sourceExtractorName: extraction.extractorName,
      sourceClassification: extraction.classification,
      dedupeDiscriminator: normalizedDedupeDiscriminator || undefined,
      ...metadata,
    }),
    reviewStatus: "pending",
    conflictCode: null,
    conflictMessage: null,
  };
};

const normalizeEmployerExtraction = ({ userId, document, extraction, payload }) => {
  const reportYear = resolveReportYear(payload.reportYear, document.taxYear);
  const baseMetadata = compactObject({
    reportYear,
    beneficiaryName: normalizeTrimmedText(payload.beneficiaryName),
    beneficiaryDocument: normalizeDocumentNumber(payload.beneficiaryDocument),
    officialSocialSecurity: normalizeRoundedAmount(payload.officialSocialSecurity),
  });

  return [
    buildNormalizedFact({
      userId,
      document,
      extraction,
      factType: "taxable_income",
      subcategory: "annual_taxable_income",
      payerName: payload.payerName,
      payerDocument: payload.payerDocument,
      referencePeriod: String(reportYear),
      amount: payload.taxableIncome,
      metadata: baseMetadata,
    }),
    buildNormalizedFact({
      userId,
      document,
      extraction,
      factType: "withheld_tax",
      subcategory: "annual_withheld_tax",
      payerName: payload.payerName,
      payerDocument: payload.payerDocument,
      referencePeriod: String(reportYear),
      amount: payload.withheldTax,
      metadata: baseMetadata,
    }),
    buildNormalizedFact({
      userId,
      document,
      extraction,
      factType: "exclusive_tax_income",
      subcategory: "thirteenth_salary",
      payerName: payload.payerName,
      payerDocument: payload.payerDocument,
      referencePeriod: String(reportYear),
      amount: payload.thirteenthSalary,
      metadata: baseMetadata,
    }),
  ].filter(Boolean);
};

const getAssetSubcategory = (item = {}) => {
  if (item.groupCode === "06" && item.itemCode === "01") {
    return "bank_account_balance";
  }

  if (item.groupCode === "04") {
    return "bank_investment_balance";
  }

  return "bank_asset_balance";
};

const normalizeAnnualBankIncomeReport = ({ userId, document, extraction, payload }) => {
  const reportYear = resolveReportYear(payload.reportYear, document.taxYear);
  const annualReferencePeriod = `${reportYear}-annual`;
  const yearEndReferencePeriod = `${reportYear}-12-31`;
  const baseMetadata = compactObject({
    reportYear,
    reportProfile: payload.reportProfile,
    customerName: normalizeTrimmedText(payload.customerName),
    customerDocument: normalizeDocumentNumber(payload.customerDocument),
    detectedSections: Array.isArray(payload.detectedSections) ? payload.detectedSections : [],
  });
  const exclusiveIncomeFacts = Array.isArray(payload.exclusiveIncomeItems)
    ? payload.exclusiveIncomeItems
        .map((item) =>
          buildNormalizedFact({
            userId,
            document,
            extraction,
            factType: "exclusive_tax_income",
            subcategory: "bank_annual_exclusive_income",
            payerName: item.institutionName || payload.institutionName,
            payerDocument: item.institutionDocument || payload.institutionDocument,
            referencePeriod: annualReferencePeriod,
            amount: item.declarableAmount ?? item.grossIncome,
            dedupeDiscriminator: [
              item.incomeTypeCode,
              item.product,
              item.branchAccount,
            ]
              .filter(Boolean)
              .join("|"),
            metadata: compactObject({
              ...baseMetadata,
              incomeTypeCode: normalizeTrimmedText(item.incomeTypeCode),
              product: normalizeTrimmedText(item.product),
              branchAccount: normalizeTrimmedText(item.branchAccount),
              grossIncome: normalizeRoundedAmount(item.grossIncome),
              withheldTax: normalizeRoundedAmount(item.withheldTax),
            }),
          }),
        )
        .filter(Boolean)
    : [];
  const assetFacts = Array.isArray(payload.assetItems)
    ? payload.assetItems
        .map((item) =>
          buildNormalizedFact({
            userId,
            document,
            extraction,
            factType: "asset_balance",
            subcategory: getAssetSubcategory(item),
            payerName: item.institutionName || payload.institutionName,
            payerDocument: item.institutionDocument || payload.institutionDocument,
            referencePeriod: yearEndReferencePeriod,
            amount: item.balanceCurrYear,
            dedupeDiscriminator: [
              item.groupCode,
              item.itemCode,
              item.product,
              item.branchAccount,
            ]
              .filter(Boolean)
              .join("|"),
            metadata: compactObject({
              ...baseMetadata,
              groupCode: normalizeTrimmedText(item.groupCode),
              itemCode: normalizeTrimmedText(item.itemCode),
              product: normalizeTrimmedText(item.product),
              branchAccount: normalizeTrimmedText(item.branchAccount),
              balancePrevYear: normalizeRoundedAmount(item.balancePrevYear),
            }),
          }),
        )
        .filter(Boolean)
    : [];
  const debtFacts = Array.isArray(payload.debtItems)
    ? payload.debtItems
        .map((item) =>
          buildNormalizedFact({
            userId,
            document,
            extraction,
            factType: "debt_balance",
            subcategory: "bank_debt_balance",
            payerName: item.institutionName || payload.institutionName,
            payerDocument: item.institutionDocument || payload.institutionDocument,
            referencePeriod: yearEndReferencePeriod,
            amount: item.balanceCurrYear,
            dedupeDiscriminator: [
              item.contractNumber,
              item.productCode,
              item.branchAccount,
            ]
              .filter(Boolean)
              .join("|"),
            metadata: compactObject({
              ...baseMetadata,
              productCode: normalizeTrimmedText(item.productCode),
              product: normalizeTrimmedText(item.product),
              contractNumber: normalizeTrimmedText(item.contractNumber),
              contractingDate: parseBrDateToIsoDate(item.contractingDate),
              branchAccount: normalizeTrimmedText(item.branchAccount),
              balancePrevYear: normalizeRoundedAmount(item.balancePrevYear),
            }),
          }),
        )
        .filter(Boolean)
    : [];

  return [...exclusiveIncomeFacts, ...assetFacts, ...debtFacts];
};

const normalizeGenericBankIncomeReport = ({ userId, document, extraction, payload }) => {
  const reportYear = resolveReportYear(payload.reportYear, document.taxYear);
  const baseMetadata = compactObject({
    reportYear,
    detectedSections: Array.isArray(payload.detectedSections) ? payload.detectedSections : [],
    reportProfile: payload.reportProfile,
  });
  const balanceFacts = Array.isArray(payload.yearEndBalances)
    ? payload.yearEndBalances
        .map((balance, index) =>
          buildNormalizedFact({
            userId,
            document,
            extraction,
            factType: "asset_balance",
            subcategory: "year_end_balance",
            payerName: payload.institutionName,
            payerDocument: payload.institutionDocument,
            referencePeriod: parseBrDateToIsoDate(balance?.date),
            amount: balance?.amount,
            dedupeDiscriminator: `${index}|${normalizeTrimmedText(balance?.date)}`,
            metadata: compactObject({
              ...baseMetadata,
              originalBalanceDate: normalizeTrimmedText(balance?.date),
            }),
          }),
        )
        .filter(Boolean)
    : [];

  return [
    buildNormalizedFact({
      userId,
      document,
      extraction,
      factType: "exclusive_tax_income",
      subcategory: "exclusive_income_total",
      payerName: payload.institutionName,
      payerDocument: payload.institutionDocument,
      referencePeriod: String(reportYear),
      amount: payload.exclusiveTaxIncomeTotal,
      metadata: baseMetadata,
    }),
    buildNormalizedFact({
      userId,
      document,
      extraction,
      factType: "exempt_income",
      subcategory: "exempt_income_total",
      payerName: payload.institutionName,
      payerDocument: payload.institutionDocument,
      referencePeriod: String(reportYear),
      amount: payload.exemptIncomeTotal,
      metadata: baseMetadata,
    }),
    buildNormalizedFact({
      userId,
      document,
      extraction,
      factType: "withheld_tax",
      subcategory: "withheld_tax_total",
      payerName: payload.institutionName,
      payerDocument: payload.institutionDocument,
      referencePeriod: String(reportYear),
      amount: payload.withheldTaxTotal,
      metadata: baseMetadata,
    }),
    ...balanceFacts,
  ].filter(Boolean);
};

const normalizeBankIncomeReport = ({ userId, document, extraction, payload }) => {
  if (
    payload?.reportProfile === "annual" &&
    (
      (Array.isArray(payload.exclusiveIncomeItems) && payload.exclusiveIncomeItems.length > 0) ||
      (Array.isArray(payload.assetItems) && payload.assetItems.length > 0) ||
      (Array.isArray(payload.debtItems) && payload.debtItems.length > 0)
    )
  ) {
    return normalizeAnnualBankIncomeReport({
      userId,
      document,
      extraction,
      payload,
    });
  }

  return normalizeGenericBankIncomeReport({
    userId,
    document,
    extraction,
    payload,
  });
};

const normalizeMedicalStatement = ({ userId, document, extraction, payload }) => {
  const reportYear = resolveReportYear(payload.reportYear, document.taxYear);

  return [
    buildNormalizedFact({
      userId,
      document,
      extraction,
      factType: "medical_deduction",
      subcategory: "total_paid",
      payerName: payload.providerName,
      referencePeriod: String(reportYear),
      amount: payload.totalAmount,
      metadata: compactObject({
        reportYear,
        beneficiaryName: normalizeTrimmedText(payload.beneficiaryName),
        hasReimbursement: Boolean(payload.hasReimbursement),
        hasCoparticipation: Boolean(payload.hasCoparticipation),
      }),
    }),
  ].filter(Boolean);
};

const normalizeEducationReceipt = ({ userId, document, extraction, payload }) => {
  const reportYear = resolveReportYear(payload.reportYear, document.taxYear);

  return [
    buildNormalizedFact({
      userId,
      document,
      extraction,
      factType: "education_deduction",
      subcategory: "total_paid",
      payerName: payload.institutionName,
      referencePeriod: String(reportYear),
      amount: payload.totalAmount,
      metadata: compactObject({
        reportYear,
        studentName: normalizeTrimmedText(payload.studentName),
        documentNumber: normalizeTrimmedText(payload.documentNumber),
      }),
    }),
  ].filter(Boolean);
};

const normalizeAnnualInssReport = ({ userId, document, extraction, payload }) => {
  const reportYear = resolveReportYear(payload.reportYear, document.taxYear);
  const referencePeriod = `${reportYear}-annual`;
  const baseMetadata = compactObject({
    reportYear,
    reportProfile: payload.reportProfile,
    beneficiaryName: normalizeTrimmedText(payload.beneficiaryName),
    beneficiaryDocument: normalizeDocumentNumber(payload.beneficiaryDocument),
    benefitNumber: normalizeTrimmedText(payload.benefitNumber),
    incomeNatureCode: normalizeTrimmedText(payload.incomeNatureCode),
    incomeNatureDescription: normalizeTrimmedText(payload.incomeNatureDescription),
    officialSocialSecurity: normalizeRoundedAmount(payload.officialSocialSecurity),
    privatePensionOrFapi: normalizeRoundedAmount(payload.privatePensionOrFapi),
    alimony: normalizeRoundedAmount(payload.alimony),
    annualSimplifiedDiscount: normalizeRoundedAmount(payload.annualSimplifiedDiscount),
    thirteenthSimplifiedDiscount: normalizeRoundedAmount(payload.thirteenthSimplifiedDiscount),
  });

  return [
    buildNormalizedFact({
      userId,
      document,
      extraction,
      factType: "taxable_income",
      subcategory: "inss_annual_taxable_income",
      payerName: payload.payerName,
      payerDocument: payload.payerDocument,
      referencePeriod,
      amount: payload.taxableIncome,
      dedupeDiscriminator: "taxable_income",
      metadata: baseMetadata,
    }),
    buildNormalizedFact({
      userId,
      document,
      extraction,
      factType: "withheld_tax",
      subcategory: "inss_annual_withheld_tax",
      payerName: payload.payerName,
      payerDocument: payload.payerDocument,
      referencePeriod,
      amount: payload.withheldTax,
      dedupeDiscriminator: "withheld_tax",
      metadata: baseMetadata,
    }),
    buildNormalizedFact({
      userId,
      document,
      extraction,
      factType: "exempt_income",
      subcategory: "inss_retirement_65_plus_exempt",
      payerName: payload.payerName,
      payerDocument: payload.payerDocument,
      referencePeriod,
      amount: payload.retirement65PlusExempt,
      dedupeDiscriminator: "retirement_65_plus_exempt",
      metadata: baseMetadata,
    }),
    buildNormalizedFact({
      userId,
      document,
      extraction,
      factType: "exempt_income",
      subcategory: "inss_retirement_65_plus_thirteenth_exempt",
      payerName: payload.payerName,
      payerDocument: payload.payerDocument,
      referencePeriod,
      amount: payload.retirement65PlusThirteenthExempt,
      dedupeDiscriminator: "retirement_65_plus_thirteenth_exempt",
      metadata: baseMetadata,
    }),
    buildNormalizedFact({
      userId,
      document,
      extraction,
      factType: "exclusive_tax_income",
      subcategory: "inss_thirteenth_salary_exclusive",
      payerName: payload.payerName,
      payerDocument: payload.payerDocument,
      referencePeriod,
      amount: payload.thirteenthSalary,
      dedupeDiscriminator: "thirteenth_salary",
      metadata: baseMetadata,
    }),
    buildNormalizedFact({
      userId,
      document,
      extraction,
      factType: "withheld_tax",
      subcategory: "inss_thirteenth_withheld_tax",
      payerName: payload.payerName,
      payerDocument: payload.payerDocument,
      referencePeriod,
      amount: payload.thirteenthWithheldTax,
      dedupeDiscriminator: "thirteenth_withheld_tax",
      metadata: baseMetadata,
    }),
  ].filter(Boolean);
};

const normalizeLegacyInssReport = ({ userId, document, extraction, payload }) => {
  const profileSuggestion = payload?.profileSuggestion;

  if (!profileSuggestion || typeof profileSuggestion !== "object") {
    return [];
  }

  const grossAmount = normalizeRoundedAmount(profileSuggestion.grossAmount);
  const netAmount = normalizeRoundedAmount(profileSuggestion.netAmount);
  const amount = grossAmount || netAmount;

  if (amount === null) {
    return [];
  }

  return [
    buildNormalizedFact({
      userId,
      document,
      extraction,
      factType: "other",
      subcategory: "profile_suggestion_amount",
      payerName: "INSS",
      referencePeriod: parseReferenceMonthToIsoMonth(profileSuggestion.referenceMonth),
      amount,
      metadata: compactObject({
        reportProfile: payload.reportProfile,
        benefitId: normalizeTrimmedText(profileSuggestion.benefitId),
        benefitKind: normalizeTrimmedText(profileSuggestion.benefitKind),
        paymentDate: parseBrDateToIsoDate(profileSuggestion.paymentDate),
        grossAmount,
        netAmount,
        amountBasis: grossAmount ? "gross_amount" : "net_amount",
        deductions: Array.isArray(profileSuggestion.deductions) ? profileSuggestion.deductions : [],
      }),
    }),
  ].filter(Boolean);
};

const normalizeInssReport = ({ userId, document, extraction, payload }) => {
  if (payload?.reportProfile === "annual" && payload?.taxableIncome !== undefined) {
    return normalizeAnnualInssReport({
      userId,
      document,
      extraction,
      payload,
    });
  }

  return normalizeLegacyInssReport({
    userId,
    document,
    extraction,
    payload,
  });
};

const NORMALIZERS_BY_DOCUMENT_TYPE = Object.freeze({
  income_report_bank: normalizeBankIncomeReport,
  income_report_employer: normalizeEmployerExtraction,
  income_report_inss: normalizeInssReport,
  medical_statement: normalizeMedicalStatement,
  education_receipt: normalizeEducationReceipt,
});

export const normalizeTaxExtractionToFacts = ({
  userId,
  document,
  extraction,
}) => {
  const documentType = normalizeTrimmedText(extraction?.classification || document?.documentType);
  const extractionPayload = extraction?.rawJson?.extraction;
  const normalizer = NORMALIZERS_BY_DOCUMENT_TYPE[documentType];

  if (!normalizer || !extractionPayload || typeof extractionPayload !== "object") {
    return [];
  }

  return normalizer({
    userId,
    document: {
      id: Number(document.id),
      taxYear: Number(document.taxYear),
      documentType,
    },
    extraction,
    payload: extractionPayload,
  });
};
