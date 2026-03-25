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

  // Energy bill — 2+ signals
  if (countMatches(normalized, ENERGY_SIGNALS) >= 2) {
    return "utility_bill_energy";
  }

  // Water bill — 2+ signals
  if (countMatches(normalized, WATER_SIGNALS) >= 2) {
    return "utility_bill_water";
  }

  // PDF with bank statement content
  if (countMatches(normalized, BANK_STATEMENT_SIGNALS) >= 1) {
    return "bank_statement";
  }

  return "unknown";
};
