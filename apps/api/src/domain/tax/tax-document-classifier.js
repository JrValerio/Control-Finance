import path from "node:path";
import { detectDocumentType as detectImportDocumentType } from "../imports/document-classifier.js";

const normalizeForClassification = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[º°]/g, "o")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const countMatches = (normalizedText, signals) =>
  signals.reduce((count, signal) => count + (normalizedText.includes(signal) ? 1 : 0), 0);

const BANK_CANDIDATES = [
  { label: "Banco do Brasil", signals: ["banco do brasil"] },
  { label: "Caixa Economica Federal", signals: ["caixa economica federal", "caixa"] },
  { label: "Itau", signals: ["itau", "itau unibanco"] },
  { label: "Bradesco", signals: ["bradesco"] },
  { label: "Santander", signals: ["santander"] },
  { label: "Banco Inter", signals: ["banco inter", "inter pagamentos", "inter&co"] },
  { label: "Nubank", signals: ["nubank", "nu pagamentos"] },
  { label: "C6 Bank", signals: ["c6 bank"] },
  { label: "PicPay", signals: ["picpay", "picpay bank"] },
  { label: "BTG Pactual", signals: ["btg pactual"] },
  { label: "XP Investimentos", signals: ["xp investimentos", "xp invest"] },
  { label: "Rico", signals: ["rico investimentos", "rico"] },
  { label: "Clear", signals: ["clear corretora", "clear"] },
];

const MEDICAL_CANDIDATES = [
  { label: "Unimed", signals: ["unimed"] },
  { label: "Amil", signals: ["amil"] },
  { label: "Bradesco Saude", signals: ["bradesco saude"] },
  { label: "SulAmerica Saude", signals: ["sulamerica saude", "sul america saude"] },
  { label: "Hapvida", signals: ["hapvida"] },
  { label: "NotreDame Intermedica", signals: ["intermedica", "notredame"] },
  { label: "Porto Seguro Saude", signals: ["porto seguro saude"] },
];

const EMPLOYER_SIGNALS = [
  "comprovante de rendimentos pagos e de imposto sobre a renda retido na fonte",
  "fonte pagadora",
  "pessoa fisica beneficiaria dos rendimentos",
  "imposto sobre a renda retido na fonte",
  "rendimentos tributaveis",
  "contribuicao previdenciaria oficial",
];

const INSS_SIGNALS = [
  "instituto nacional do seguro social",
  "historico de creditos",
  "beneficio",
  "competencia",
  "meu.inss.gov.br",
  "especie",
  "nb:",
];

const INSS_ANNUAL_SIGNALS = [
  "fundo do regime geral de previdencia social",
  "numero do beneficio",
  "natureza do rendimento",
  "parcela isenta do 13o",
  "proventos de aposentadoria",
];

const BANK_INCOME_REPORT_SIGNALS = [
  "informe de rendimentos",
  "ano-calendario",
  "imposto sobre a renda",
  "31/12/",
  "rendimentos sujeitos",
  "tributacao exclusiva",
  "rendimentos isentos",
];

const MEDICAL_SIGNALS = [
  "despesas medicas",
  "plano de saude",
  "demonstrativo para imposto de renda",
  "reembolso",
  "beneficiario",
  "titular",
  "coparticipacao",
];

const EDUCATION_SIGNALS = [
  "instituicao de ensino",
  "comprovante de pagamento",
  "mensalidade",
  "curso",
  "aluno",
  "educacao",
  "recibo",
];

const LOAN_SIGNALS = [
  "saldo devedor",
  "amortizacao",
  "parcela",
  "contrato",
  "juros",
  "financiamento",
  "emprestimo",
];

const BANK_STATEMENT_SUPPORT_SIGNALS = [
  "saldo anterior",
  "saldo final",
  "saldo do dia",
  "lancamentos",
  "historico",
  "extrato",
  "stmttrn",
  "fitid",
];

const findCandidateLabel = (normalizedText, candidates) => {
  for (const candidate of candidates) {
    if (candidate.signals.some((signal) => normalizedText.includes(signal))) {
      return candidate.label;
    }
  }

  return null;
};

const isEmployerIncomeReport = (normalizedText) =>
  normalizedText.includes(EMPLOYER_SIGNALS[0]) ||
  countMatches(normalizedText, EMPLOYER_SIGNALS) >= 3;

const isInssIncomeReport = (normalizedText) =>
  normalizedText.includes("instituto nacional do seguro social") &&
  countMatches(normalizedText, INSS_SIGNALS) >= 2;

const isInssAnnualIncomeReport = (normalizedText) =>
  normalizedText.includes("comprovante de rendimentos pagos e de") &&
  normalizedText.includes("imposto sobre a renda retido na fonte") &&
  countMatches(normalizedText, INSS_ANNUAL_SIGNALS) >= 2;

const isBankIncomeReport = (normalizedText) =>
  normalizedText.includes("informe de rendimentos") &&
  (
    countMatches(normalizedText, BANK_INCOME_REPORT_SIGNALS) >= 3 ||
    findCandidateLabel(normalizedText, BANK_CANDIDATES) !== null
  );

const isMedicalStatement = (normalizedText) =>
  countMatches(normalizedText, MEDICAL_SIGNALS) >= 3 ||
  (
    normalizedText.includes("plano de saude") &&
    normalizedText.includes("beneficiario")
  );

const isEducationReceipt = (normalizedText) =>
  countMatches(normalizedText, EDUCATION_SIGNALS) >= 3;

const isLoanStatement = (normalizedText) =>
  countMatches(normalizedText, LOAN_SIGNALS) >= 3;

const isBankStatementSupport = (normalizedText, extension) =>
  detectImportDocumentType({ text: normalizedText, extension }) === "bank_statement" ||
  countMatches(normalizedText, BANK_STATEMENT_SUPPORT_SIGNALS) >= 2;

const createClassification = ({
  documentType,
  confidenceScore,
  reasons,
  sourceLabelSuggestion = null,
}) => ({
  documentType,
  confidenceScore,
  reasons,
  sourceLabelSuggestion,
  warnings: [],
});

export const classifyTaxDocument = ({
  text = "",
  originalFileName = "",
}) => {
  const normalizedText = normalizeForClassification(text);
  const extension = path.extname(String(originalFileName || "")).toLowerCase();

  if (!normalizedText) {
    return createClassification({
      documentType: "unknown",
      confidenceScore: 0.2,
      reasons: ["empty_text"],
    });
  }

  if (
    detectImportDocumentType({ text, extension }) === "income_statement_inss" ||
    isInssIncomeReport(normalizedText) ||
    isInssAnnualIncomeReport(normalizedText)
  ) {
    return createClassification({
      documentType: "income_report_inss",
      confidenceScore: 0.99,
      reasons: [
        detectImportDocumentType({ text, extension }) === "income_statement_inss"
          ? "matched_import_classifier:income_statement_inss"
          : "matched_inss_income_report_signals",
      ],
      sourceLabelSuggestion: "INSS",
    });
  }

  if (isEmployerIncomeReport(normalizedText)) {
    return createClassification({
      documentType: "income_report_employer",
      confidenceScore: 0.97,
      reasons: ["matched_employer_signals"],
    });
  }

  if (isBankIncomeReport(normalizedText)) {
    return createClassification({
      documentType: "income_report_bank",
      confidenceScore: 0.96,
      reasons: ["matched_bank_income_report_signals"],
      sourceLabelSuggestion: findCandidateLabel(normalizedText, BANK_CANDIDATES),
    });
  }

  if (isMedicalStatement(normalizedText)) {
    return createClassification({
      documentType: "medical_statement",
      confidenceScore: 0.93,
      reasons: ["matched_medical_signals"],
      sourceLabelSuggestion: findCandidateLabel(normalizedText, MEDICAL_CANDIDATES),
    });
  }

  if (isEducationReceipt(normalizedText)) {
    return createClassification({
      documentType: "education_receipt",
      confidenceScore: 0.91,
      reasons: ["matched_education_signals"],
    });
  }

  if (isLoanStatement(normalizedText)) {
    return createClassification({
      documentType: "loan_statement",
      confidenceScore: 0.9,
      reasons: ["matched_loan_signals"],
    });
  }

  if (isBankStatementSupport(normalizedText, extension)) {
    return createClassification({
      documentType: "bank_statement_support",
      confidenceScore: 0.89,
      reasons: ["matched_bank_statement_support_signals"],
      sourceLabelSuggestion: findCandidateLabel(normalizedText, BANK_CANDIDATES),
    });
  }

  return createClassification({
    documentType: "unknown",
    confidenceScore: 0.3,
    reasons: ["no_supported_tax_signals"],
  });
};
