/**
 * Nubank credit card invoice PDF parser.
 *
 * Pure function — no I/O, no DB access, no AI.
 * Input:  rawText (string from extractTextFromPdfWithOcr)
 * Output: ParsedNubankInvoice | null
 *
 * Returns null only when mandatory fields (totalAmount + dueDate) are missing.
 * Period inference from closing_day is handled by the service layer.
 * The parser signals missing period via periodStart/periodEnd = null.
 *
 * Nubank-specific format:
 *   Due date  : "Data de vencimento: DD MES YYYY"  (PT-BR month abbreviation)
 *   Total     : "Total a pagar R$ X.XXX,XX"
 *   Period    : "Período vigente: DD MES a DD MES"  (no year — inferred)
 *   Tx line   : "DD MES Description -?R$ X,XX"
 */

// ─── Month map PT-BR ─────────────────────────────────────────────────────────

const MONTH_MAP = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
};

const MONTHS_PAT = Object.keys(MONTH_MAP).join("|");

// ─── Currency helpers ─────────────────────────────────────────────────────────

/**
 * Parse a Nubank amount string to float.
 * Accepts "R$ 767,23", "1.247,80", "103,09" — strips "R$" prefix first.
 * Returns null for zero or non-parseable input.
 */
export const parseNubankBRL = (str) => {
  if (typeof str !== "string") return null;
  const cleaned = str
    .trim()
    .replace(/^R\$\s*/, "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : null;
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Convert day (string), PT-BR month abbreviation (string), year (string) →
 * "YYYY-MM-DD". Returns null for unknown month abbreviation.
 */
const nubankDateToIso = (day, mon, year) => {
  const m = MONTH_MAP[String(mon).toUpperCase()];
  if (!m) return null;
  return `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

/**
 * Extract year from invoice due date "YYYY-MM-DD". Falls back to current year.
 */
const invoiceYear = (dueDate) => {
  if (typeof dueDate === "string" && /^\d{4}/.test(dueDate)) return dueDate.slice(0, 4);
  return String(new Date().getFullYear());
};

// ─── Field extractors ─────────────────────────────────────────────────────────

const extractDueDate = (text) => {
  // "Data de vencimento: 15 AGO 2025" or "Data de vencimento 18 NOV 2024"
  const re = new RegExp(
    `data\\s+de\\s+vencimento\\s*:?\\s*(\\d{2})\\s+(${MONTHS_PAT})\\s+(\\d{4})`,
    "i",
  );
  const m = text.match(re);
  if (m) {
    const iso = nubankDateToIso(m[1], m[2], m[3]);
    if (iso) return { value: iso, source: "regex:DATA_VENCIMENTO" };
  }
  return null;
};

const extractTotalAmount = (text) => {
  // "Total a pagar R$ 945,49" — primary Nubank format (RESUMO section)
  // "Valor para pagamento à vista R$ 504,16" — secondary (negotiated/discounted)
  const patterns = [
    /TOTAL\s+A\s+PAGAR\s+R\$\s*([\d.,]+)/i,
    /VALOR\s+PARA\s+PAGAMENTO\s+[AÀ]\s+VISTA\s+R\$\s*([\d.,]+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const val = parseNubankBRL(m[1]);
      if (val !== null) return { value: val, source: "regex:TOTAL_A_PAGAR" };
    }
  }
  return null;
};

const extractPeriod = (text, dueDateYear) => {
  // "Período vigente: 08 JUL a 08 AGO" — no year; derived from dueDate year.
  // Cross-year boundary: if startMonth > endMonth, start belongs to prior year.
  const re = new RegExp(
    `per[ií]odo\\s+vigente\\s*:?\\s*(\\d{2})\\s+(${MONTHS_PAT})\\s+[aA]\\s+(\\d{2})\\s+(${MONTHS_PAT})`,
    "i",
  );
  const m = text.match(re);
  if (!m) return null;

  const year = dueDateYear || String(new Date().getFullYear());
  const startMonNum = MONTH_MAP[m[2].toUpperCase()];
  const endMonNum = MONTH_MAP[m[4].toUpperCase()];
  if (!startMonNum || !endMonNum) return null;

  const startYear = startMonNum > endMonNum ? String(Number(year) - 1) : year;
  const start = `${startYear}-${String(startMonNum).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  const end = `${year}-${String(endMonNum).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;

  if (start >= end) return null;
  return { start, end, source: "regex:PERIODO_VIGENTE" };
};

const extractMinimumPayment = (text) => {
  const re = /pagamento\s+m[ií]nimo\s+R\$\s*([\d.,]+)/i;
  const m = text.match(re);
  return m ? parseNubankBRL(m[1]) : null;
};

const extractCardLast4 = (text) => {
  const patterns = [
    /cart[aã]o\s+final\s+(\d{4})/i,
    /\*{4}\s*(\d{4})/,
    /final\s+(\d{4})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1];
  }
  return null;
};

// ─── Transaction parser ───────────────────────────────────────────────────────

/**
 * Description patterns for non-purchase lines that must be filtered out.
 * Tested against the normalized (accent-stripped, lowercased) description string.
 */
const SKIP_DESCRIPTION_PATTERNS = [
  /^pagamento\s+em\s+\d/i,
  /^credito\s+de\s+rotativo/i,
  /^saldo\s+em\s+rotativo/i,
];

/**
 * Sub-line / continuation patterns — these belong to the previous transaction
 * entry and must not be parsed as standalone transactions.
 */
const CONTINUATION_LINE_PATTERNS = [
  /^[•·]/,
  /^brl\s/i,
  /^convers[aã]o/i,
  /^referente\s/i,
  /^saldo\s+parcelado/i,
  /^total\s+a\s+pagar\s*:/i,
  /^valor\s+original\s*:/i,
  /^usd\s+[\d]/i,
  /^como\s+assegurado/i,
  /^v[aá]lido\s+apenas/i,
  /^\.\s*valor\s+do\s+iof/i,
  /^\.\s*saldo/i,
];

const TRANSACTION_LINE_RE = new RegExp(
  `^(\\d{2})\\s+(${MONTHS_PAT})\\s+(.+?)\\s+(-?\\s*R\\$\\s*[\\d.,]+)$`,
  "i",
);

/**
 * Parse individual purchase/service transactions from a Nubank invoice PDF text.
 *
 * Returns an array of raw import rows compatible with the statement-import pipeline:
 *   { line: number, raw: { date, type, value, description, notes, category } }
 *
 * Rules:
 *   - Positive amount  → type "Saida"  (purchase charged to card)
 *   - Negative amount  → type "Entrada" (refund/reversal credited to card)
 *   - Pagamento / Crédito de rotativo / Saldo em rotativo → filtered
 *   - Continuation sub-lines (bullet, BRL, Conversão, Referente) → skipped
 */
export const parseNubankInvoiceTransactions = (rawText) => {
  if (typeof rawText !== "string" || !rawText.trim()) {
    throw new Error("Nao foi possivel extrair transacoes da fatura.");
  }

  const invoiceMetadata = parseNubankInvoice(rawText);
  const year = invoiceYear(invoiceMetadata?.dueDate ?? null);

  const lines = rawText
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const rows = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (CONTINUATION_LINE_PATTERNS.some((re) => re.test(line))) continue;

    const match = line.match(TRANSACTION_LINE_RE);
    if (!match) continue;

    const [, day, mon, rawDescription, rawAmount] = match;
    const description = rawDescription.trim();

    const normalizedDesc = description
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    if (SKIP_DESCRIPTION_PATTERNS.some((re) => re.test(normalizedDesc))) continue;

    const isNegative = rawAmount.trim().startsWith("-");
    const amountStr = rawAmount.replace(/^-?\s*R\$\s*/, "").trim();
    const val = parseNubankBRL(amountStr);
    if (val === null) continue;

    const isoDate = nubankDateToIso(day, mon, year);
    if (!isoDate) continue;

    rows.push({
      line: i + 1,
      raw: {
        date: isoDate,
        type: isNegative ? "Entrada" : "Saida",
        value: String(val.toFixed(2)),
        description,
        notes: "",
        category: "",
      },
    });
  }

  if (rows.length === 0) {
    throw new Error("Nenhuma transacao reconhecida na fatura.");
  }

  return rows;
};

// ─── Main parser ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ParsedNubankInvoice
 * @property {number}      totalAmount
 * @property {string}      dueDate          - "YYYY-MM-DD"
 * @property {string|null} periodStart      - null when not found in PDF
 * @property {string|null} periodEnd        - null when not found in PDF
 * @property {number|null} minimumPayment
 * @property {null}        financedBalance  - not applicable to Nubank format
 * @property {string|null} cardLast4
 * @property {string}      issuer           - always 'nubank'
 * @property {Object}      fieldsSources    - which regex matched each field
 */

/**
 * Parse raw text from a Nubank credit card invoice PDF.
 * Returns null if mandatory fields (totalAmount OR dueDate) are missing.
 */
export const parseNubankInvoice = (rawText) => {
  if (typeof rawText !== "string" || !rawText.trim()) return null;

  const text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const totalResult = extractTotalAmount(text);
  if (!totalResult) return null;

  const dueDateResult = extractDueDate(text);
  if (!dueDateResult) return null;

  const year = dueDateResult.value.slice(0, 4);
  const periodResult = extractPeriod(text, year);
  const minimumPayment = extractMinimumPayment(text);
  const cardLast4 = extractCardLast4(text);

  return {
    totalAmount: totalResult.value,
    dueDate: dueDateResult.value,
    periodStart: periodResult ? periodResult.start : null,
    periodEnd: periodResult ? periodResult.end : null,
    minimumPayment,
    financedBalance: null,
    cardLast4,
    issuer: "nubank",
    fieldsSources: {
      totalAmount: totalResult.source,
      dueDate: dueDateResult.source,
      periodStart: periodResult ? periodResult.source : null,
      periodEnd: periodResult ? periodResult.source : null,
    },
  };
};
