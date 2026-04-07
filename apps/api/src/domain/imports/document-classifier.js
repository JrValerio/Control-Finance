const normalizeForClassification = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const INSS_SIGNALS = [
  "instituto nacional do seguro social",
  "historico de creditos",
  "especie:",
  "competencia",
  "beneficio",
  "meu.inss.gov.br",
  "aps:",
  "nb:",
];

const PAYROLL_PRIMARY_SIGNALS = [
  "holerite",
  "contracheque",
  "demonstrativo de pagamento",
  "demonstrativo de pagamento de salario",
  "recibo de pagamento",
  "folha de pagamento",
];

const PAYROLL_SECONDARY_SIGNALS = [
  "salario base",
  "total de proventos",
  "total proventos",
  "total de descontos",
  "liquido a receber",
  "valor liquido",
  "matricula",
  "empresa",
  "empregador",
  "admissao",
];

const ENERGY_SIGNALS = [
  "neoenergia",
  "elektro",
  "enel",
  "cpfl",
  "light s.a",
  "kwh",
  "codigo de instalacao",
  "leitura anterior",
  "leitura atual",
  "consumo te",
  "consumo tusd",
  "tarifa de energia",
  "nota fiscal de energia eletrica",
];

const WATER_SIGNALS = [
  "saae",
  "sabesp",
  "sanepar",
  "copasa",
  "faturamento agua",
  "faturamento esgoto",
  "agua e esgoto",
  "consumo m3",
  "matricula",
  "leitura ant.",
  "hidrometro",
];

const GAS_SIGNALS = [
  "comgas",
  "naturgy",
  "gas natural",
  "gas canalizado",
  "fornecimento de gas",
  "tarifa de gas",
  "conta de gas",
  "leitura anterior",
  "leitura atual",
  "consumo m3",
];

const TELECOM_SIGNALS = [
  "vivo",
  "tim",
  "claro",
  "oi",
  "sky",
  "net claro",
  "fatura digital",
  "internet fixa",
  "banda larga",
  "fibra",
  "linha movel",
  "linha fixa",
  "servico movel pessoal",
  "tv por assinatura",
  "combo",
  "numero da linha",
  "codigo de barras",
];

const CREDIT_CARD_INVOICE_ITAU_SIGNALS = [
  "total da fatura anterior",
  "pagamentos efetuados",
  "lancamentos no cartao",
  "saldo financiado",
  "limite total de credito",
];

const CREDIT_CARD_INVOICE_NUBANK_SIGNALS = [
  "nu pagamentos",
  "periodo vigente",
  "total a pagar",
  "pagamentos e financiamentos",
  "data de vencimento",
];

const BANK_STATEMENT_SIGNALS = [
  "saldo anterior",
  "saldo final",
  "saldo do dia",
  "lancamentos",
  "data lancamento",
  "historico",
  "stmttrn",
  "fitid",
  "trnamt",
];

const countMatches = (normalized, signals) =>
  signals.filter((s) => normalized.includes(s)).length;

export const detectDocumentType = ({ text = "", extension = "" }) => {
  if (extension === ".ofx" || extension === ".csv") return "bank_statement";

  const normalized = normalizeForClassification(text);

  if (!normalized) return "unknown";

  // INSS — requires "instituto nacional" + at least one more signal
  if (
    normalized.includes("instituto nacional do seguro social") &&
    countMatches(normalized, INSS_SIGNALS) >= 2
  ) {
    return "income_statement_inss";
  }

  if (
    PAYROLL_PRIMARY_SIGNALS.some((signal) => normalized.includes(signal)) &&
    countMatches(normalized, [...PAYROLL_PRIMARY_SIGNALS, ...PAYROLL_SECONDARY_SIGNALS]) >= 3
  ) {
    return "income_statement_payroll";
  }

  // Energy bill — 2+ signals
  if (countMatches(normalized, ENERGY_SIGNALS) >= 2) {
    return "utility_bill_energy";
  }

  // Water bill — 2+ signals
  if (countMatches(normalized, WATER_SIGNALS) >= 2) {
    return "utility_bill_water";
  }

  // Gas bill — 2+ signals
  if (countMatches(normalized, GAS_SIGNALS) >= 2) {
    return "utility_bill_gas";
  }

  // Telecom bill (internet/phone/tv) — 2+ signals
  if (countMatches(normalized, TELECOM_SIGNALS) >= 2) {
    return "utility_bill_telecom";
  }

  // Itaú credit card invoice — requires "itau" + 2 structural signals
  if (
    normalized.includes("itau") &&
    countMatches(normalized, CREDIT_CARD_INVOICE_ITAU_SIGNALS) >= 2
  ) {
    return "credit_card_invoice_itau";
  }

  // Nubank credit card invoice — requires "nu pagamentos" + 2 structural signals
  if (
    normalized.includes("nu pagamentos") &&
    countMatches(normalized, CREDIT_CARD_INVOICE_NUBANK_SIGNALS) >= 2
  ) {
    return "credit_card_invoice_nubank";
  }

  // PDF with bank statement content
  if (countMatches(normalized, BANK_STATEMENT_SIGNALS) >= 1) {
    return "bank_statement";
  }

  return "unknown";
};
