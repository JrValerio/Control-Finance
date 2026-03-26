import {
  extractInssSuggestion,
  parseInssCreditHistoryPdfText,
} from "../imports/statement-import.js";

const EXTRACTOR_VERSION = "1.0.0";
const MAX_PREVIEW_LINES = 8;

const normalizeText = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const getPreviewLines = (text, limit = MAX_PREVIEW_LINES) =>
  String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit);

const parseSignedAmount = (value) => {
  const normalizedValue = String(value || "").trim().replace(/^R\$\s*/i, "");

  if (!normalizedValue) {
    return null;
  }

  const hasComma = normalizedValue.includes(",");
  const hasDot = normalizedValue.includes(".");
  let numericValue = normalizedValue;

  if (hasComma && hasDot) {
    const decimalSeparator =
      normalizedValue.lastIndexOf(",") > normalizedValue.lastIndexOf(".") ? "," : ".";

    numericValue =
      decimalSeparator === ","
        ? normalizedValue.replace(/\./g, "").replace(",", ".")
        : normalizedValue.replace(/,/g, "");
  } else if (hasComma) {
    numericValue = normalizedValue.replace(/\./g, "").replace(",", ".");
  }

  const parsedValue = Number(numericValue);

  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return Number(parsedValue.toFixed(2));
};

const extractYear = (text) => {
  const yearMatch =
    String(text || "").match(/ano[-\s]?calendario[:\s]+(20\d{2})/i) ||
    String(text || "").match(/31\/12\/(20\d{2})/i) ||
    String(text || "").match(/\b(20\d{2})\b/);

  return yearMatch ? Number(yearMatch[1]) : null;
};

const extractAllBalances = (text) => {
  const matches = String(text || "").matchAll(/(31\/12\/20\d{2}).{0,60}?r?\$?\s*([\d.,]+)/gi);

  return [...matches]
    .map((match) => ({
      date: match[1],
      amount: parseSignedAmount(match[2]),
    }))
    .filter((item) => item.amount !== null)
    .slice(0, 4);
};

const extractFirstMatch = (text, regex) => {
  const match = String(text || "").match(regex);
  return match ? match[1].trim() : null;
};

const extractAmountByPatterns = (text, patterns) => {
  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);

    if (!match) {
      continue;
    }

    const parsedAmount = parseSignedAmount(match[1]);

    if (parsedAmount !== null) {
      return Math.abs(parsedAmount);
    }
  }

  return null;
};

const buildSectionFlags = (normalizedText, descriptors) =>
  descriptors.filter((descriptor) => normalizedText.includes(descriptor)).map((descriptor) => descriptor);

const extractBankIncomeReport = (text, classification) => {
  const normalizedText = normalizeText(text);

  return {
    extractorName: "income-report-bank",
    extractorVersion: EXTRACTOR_VERSION,
    payload: {
      reportYear: extractYear(text),
      institutionName: classification.sourceLabelSuggestion,
      institutionDocument: extractFirstMatch(text, /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/),
      exclusiveTaxIncomeTotal: extractAmountByPatterns(text, [
        /(?:rendimentos sujeitos a\s+)?tributacao exclusiva(?:[^\n\r]{0,80}?)r?\$?\s*([\d.,]+)/i,
      ]),
      exemptIncomeTotal: extractAmountByPatterns(text, [
        /rendimentos isentos(?:\s+e\s+nao\s+tributaveis)?(?:[^\n\r]{0,80}?)r?\$?\s*([\d.,]+)/i,
      ]),
      withheldTaxTotal: extractAmountByPatterns(text, [
        /imposto(?:\s+sobre\s+a\s+renda)?\s+retido\s+na\s+fonte(?:[^\n\r]{0,80}?)r?\$?\s*([\d.,]+)/i,
      ]),
      detectedSections: buildSectionFlags(normalizedText, [
        "rendimentos sujeitos",
        "tributacao exclusiva",
        "rendimentos isentos",
        "31/12/",
      ]),
      yearEndBalances: extractAllBalances(text),
      previewLines: getPreviewLines(text),
    },
    warnings: [],
  };
};

const extractEmployerIncomeReport = (text) => {
  const normalizedText = normalizeText(text);

  return {
    extractorName: "income-report-employer",
    extractorVersion: EXTRACTOR_VERSION,
    payload: {
      reportYear: extractYear(text),
      payerName:
        extractFirstMatch(text, /fonte pagadora[:\s]+([^\n\r]{3,120})/i) ||
        extractFirstMatch(text, /nome empresarial[:\s]+([^\n\r]{3,120})/i),
      payerDocument: extractFirstMatch(text, /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/),
      beneficiaryName: extractFirstMatch(text, /benefici[aá]ri[oa][:\s]+([^\n\r]{3,120})/i),
      beneficiaryDocument: extractFirstMatch(text, /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/),
      taxableIncome: extractAmountByPatterns(text, [
        /rendimentos tributaveis(?:[^\n\r]{0,80}?)r?\$?\s*([\d.,]+)/i,
        /total de rendimentos tributaveis(?:[^\n\r]{0,80}?)r?\$?\s*([\d.,]+)/i,
      ]),
      withheldTax: extractAmountByPatterns(text, [
        /imposto(?:\s+sobre\s+a\s+renda)?\s+retido\s+na\s+fonte(?:[^\n\r]{0,80}?)r?\$?\s*([\d.,]+)/i,
        /\birrf(?:\s+total)?(?:[^\n\r]{0,80}?)r?\$?\s*([\d.,]+)/i,
      ]),
      officialSocialSecurity: extractAmountByPatterns(text, [
        /contribuicao previdenciaria oficial(?:[^\n\r]{0,80}?)r?\$?\s*([\d.,]+)/i,
      ]),
      thirteenthSalary: extractAmountByPatterns(text, [
        /(?:decimo terceiro|13o salario|13º salario)(?:[^\n\r]{0,80}?)r?\$?\s*([\d.,]+)/i,
      ]),
      detectedSections: buildSectionFlags(normalizedText, [
        "rendimentos tributaveis",
        "imposto sobre a renda retido na fonte",
        "contribuicao previdenciaria oficial",
        "decimo terceiro",
      ]),
      previewLines: getPreviewLines(text),
    },
    warnings: [],
  };
};

const extractIncomeReportInss = (text) => {
  const warnings = [];
  let creditRowsPreview = [];

  try {
    creditRowsPreview = parseInssCreditHistoryPdfText(text)
      .slice(0, 3)
      .map((row) => row.raw);
  } catch {
    warnings.push("inss_preview_unavailable");
  }

  return {
    extractorName: "income-report-inss",
    extractorVersion: EXTRACTOR_VERSION,
    payload: {
      reportYear: extractYear(text),
      profileSuggestion: extractInssSuggestion(text),
      creditRowsPreview,
      previewLines: getPreviewLines(text),
    },
    warnings,
  };
};

const extractMedicalStatement = (text, classification) => {
  const normalizedText = normalizeText(text);
  const totalAmount =
    extractFirstMatch(text, /(?:valor pago|total pago|total de despesas|despesa total)[:\s]*r?\$?\s*([\d.,]+)/i);

  return {
    extractorName: "medical-statement",
    extractorVersion: EXTRACTOR_VERSION,
    payload: {
      reportYear: extractYear(text),
      providerName: classification.sourceLabelSuggestion,
      beneficiaryName: extractFirstMatch(text, /benefici[aá]ri[oa][:\s]+([^\n\r]{3,120})/i),
      totalAmount: totalAmount ? parseSignedAmount(totalAmount) : null,
      hasReimbursement: normalizedText.includes("reembolso"),
      hasCoparticipation: normalizedText.includes("coparticipacao"),
      previewLines: getPreviewLines(text),
    },
    warnings: [],
  };
};

const extractEducationReceipt = (text) => {
  const totalAmount =
    extractFirstMatch(text, /(?:valor pago|total pago|mensalidade|valor total)[:\s]*r?\$?\s*([\d.,]+)/i);

  return {
    extractorName: "education-receipt",
    extractorVersion: EXTRACTOR_VERSION,
    payload: {
      reportYear: extractYear(text),
      institutionName:
        extractFirstMatch(text, /institui[cç][aã]o de ensino[:\s]+([^\n\r]{3,120})/i) ||
        getPreviewLines(text, 1)[0] ||
        null,
      studentName:
        extractFirstMatch(text, /alun[oa][:\s]+([^\n\r]{3,120})/i) ||
        extractFirstMatch(text, /benefici[aá]ri[oa][:\s]+([^\n\r]{3,120})/i),
      documentNumber: extractFirstMatch(text, /(?:recibo|documento|nf)[\s#:nºo]*([a-z0-9\-/.]+)/i),
      totalAmount: totalAmount ? parseSignedAmount(totalAmount) : null,
      previewLines: getPreviewLines(text),
    },
    warnings: [],
  };
};

const EXTRACTORS_BY_TYPE = Object.freeze({
  income_report_bank: extractBankIncomeReport,
  income_report_employer: extractEmployerIncomeReport,
  income_report_inss: extractIncomeReportInss,
  medical_statement: extractMedicalStatement,
  education_receipt: extractEducationReceipt,
});

export const hasTaxExtractorForDocumentType = (documentType) =>
  typeof EXTRACTORS_BY_TYPE[documentType] === "function";

export const runTaxExtractorForDocument = ({
  documentType,
  text = "",
  classification = {},
}) => {
  const extractor = EXTRACTORS_BY_TYPE[documentType];

  if (!extractor) {
    return null;
  }

  return extractor(text, classification);
};
