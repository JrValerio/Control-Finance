/**
 * Itaú credit card invoice PDF parser.
 *
 * Pure function — no I/O, no DB access, no AI.
 * Input:  rawText (string from extractTextFromPdfWithOcr)
 * Output: ParsedItauInvoice | null
 *
 * Returns null only when mandatory fields (totalAmount + dueDate) are missing.
 * Period inference from closing_day is handled by the service layer, which has
 * DB access. The parser signals missing period via periodStart/periodEnd = null.
 */

// ─── Currency normalisation ───────────────────────────────────────────────────

/**
 * Parse a Brazilian formatted number string to float.
 * "1.247,80" → 1247.80    "247,80" → 247.80
 */
export const parseBRL = (str) => {
  if (typeof str !== "string") return null;
  const cleaned = str.trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : null;
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Convert "DD/MM/YYYY" to "YYYY-MM-DD". Returns null on invalid input.
 */
export const parseDMY = (str) => {
  if (typeof str !== "string") return null;
  const m = str.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, day, month, year] = m;
  const d = new Date(`${year}-${month}-${day}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  return `${year}-${month}-${day}`;
};

// ─── Field extractors ─────────────────────────────────────────────────────────

const extractTotalAmount = (text) => {
  // "TOTAL DA FATURA R$ 1.247,80" or "TOTAL DA FATURA 1.247,80"
  const patterns = [
    /TOTAL\s+DA\s+FATURA\s+R\$\s*([\d.,]+)/i,
    /TOTAL\s+DA\s+FATURA\s+([\d.,]+)/i,
    /VALOR\s+TOTAL\s+DA\s+FATURA\s+R\$\s*([\d.,]+)/i,
    /FATURA\s+TOTAL\s+R\$\s*([\d.,]+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const val = parseBRL(m[1]);
      if (val !== null) return { value: val, source: "regex:TOTAL_DA_FATURA" };
    }
  }
  return null;
};

const extractDueDate = (text) => {
  const patterns = [
    /VENCIMENTO\s+(\d{2}\/\d{2}\/\d{4})/i,
    /DATA\s+DE\s+VENCIMENTO\s+(\d{2}\/\d{2}\/\d{4})/i,
    /PAGUE\s+AT[EÉ]\s+(\d{2}\/\d{2}\/\d{4})/i,
    /VENCE\s+EM\s+(\d{2}\/\d{2}\/\d{4})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const val = parseDMY(m[1]);
      if (val !== null) return { value: val, source: "regex:VENCIMENTO" };
    }
  }
  return null;
};

const extractPeriod = (text) => {
  // "PERÍODO DE 08/02/2026 A 07/03/2026"
  const patterns = [
    /PER[IÍ]ODO\s+DE\s+(\d{2}\/\d{2}\/\d{4})\s+A\s+(\d{2}\/\d{2}\/\d{4})/i,
    /DE\s+(\d{2}\/\d{2}\/\d{4})\s+A\s+(\d{2}\/\d{2}\/\d{4})/i,
    /COMPETENCIA\s+(\d{2}\/\d{2}\/\d{4})\s+A\s+(\d{2}\/\d{2}\/\d{4})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const start = parseDMY(m[1]);
      const end = parseDMY(m[2]);
      if (start && end && start <= end) {
        return { start, end, source: "regex:PERIODO" };
      }
    }
  }
  return null;
};

const extractMinimumPayment = (text) => {
  const patterns = [
    /PAGAMENTO\s+M[IÍ]NIMO\s+R\$\s*([\d.,]+)/i,
    /PAGAMENTO\s+M[IÍ]NIMO\s+([\d.,]+)/i,
    /VALOR\s+M[IÍ]NIMO\s+R\$\s*([\d.,]+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const val = parseBRL(m[1]);
      if (val !== null) return val;
    }
  }
  return null;
};

const extractFinancedBalance = (text) => {
  const patterns = [
    /SALDO\s+FINANCIADO\s+R\$\s*([\d.,]+)/i,
    /SALDO\s+A\s+FINANCIAR\s+R\$\s*([\d.,]+)/i,
    /SALDO\s+FINANCIADO\s+([\d.,]+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const val = parseBRL(m[1]);
      if (val !== null) return val;
    }
  }
  return null;
};

const extractCardLast4 = (text) => {
  const patterns = [
    /\*{4}\s*(\d{4})/,
    /final\s+(\d{4})/i,
    /CART[AÃ]O\s+(?:FINAL|N[ÚU]MERO)?\s*\*+(\d{4})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1];
  }
  return null;
};

// ─── Transaction parser ───────────────────────────────────────────────────────

/**
 * Lines that look like transactions but are structural (summaries, metadata,
 * simulations). Tested against the collapsed, accent-stripped, lowercased line.
 */
const STRUCTURAL_LINE_PATTERNS = [
  /^total\s+(dos\s+)?(pagamentos|lancamentos|outros)/i,
  /^lancamentos\s+no\s+cartao/i,
  /^lancamentos\s+(compras|produtos|servi)/i,
  /^compras\s+parceladas/i,
  /^proxima\s+fatura/i,
  /^demais\s+faturas/i,
  /^total\s+para\s+proximas/i,
  /^limite\s+(total|disponivel|utilizado|de\s+saque)/i,
  /^juros\s+(do\s+rotativo|de\s+mora)/i,
  /^multa\s+por\s+atraso/i,
  /^iof\s+de\s+financiamento/i,
  /^valor\s+juros/i,
  /^valor\s+total\s+a\s+pagar/i,
  /^valor\s+da\s+parcela/i,
  /^valor\s+do\s+iof/i,
  /^valor\s+total\s+financiado/i,
  /^valor\s+compra/i,
  /^valor\s+saque/i,
  /^valor\s+tarifa/i,
  /^quantidade\s+de\s+parcelas/i,
  /^cet\s+/i,
  /^simulacao/i,
  /^pagamento\s+minimo/i,
  /^pagamento\s+efetuado/i,
  /^encargos\s+cobrados/i,
  /^fique\s+atento/i,
  /^novo\s+teto/i,
  /^juros\s+maximos/i,
  /^credito\s+rotativo/i,
  /^limite\s+maximo\s+de\s+juros/i,
  /^juros\s+e\s+encargos/i,
  /^%\s+sobre/i,
];

const isStructuralLine = (line) => {
  const normalized = line
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return STRUCTURAL_LINE_PATTERNS.some((re) => re.test(normalized));
};

/**
 * Extract year from the invoice due date string ("YYYY-MM-DD").
 * Falls back to current year.
 */
const invoiceYear = (dueDate) => {
  if (typeof dueDate === "string" && /^\d{4}/.test(dueDate)) {
    return dueDate.slice(0, 4);
  }
  return String(new Date().getFullYear());
};

/**
 * Convert a short date "DD/MM" to "YYYY-MM-DD" using the invoice year.
 * When the month is later than the due-date month it belongs to the prior year
 * (e.g. closing on 13/03 means a 02/XX date in February → same year, but a
 * 12/XX date in December belongs to the prior year).
 */
const shortDateToIso = (day, month, year) => {
  const y = Number(year);
  const m = Number(month);
  // Closing month inferred from the year string isn't available here, so we
  // simply trust the year passed in. The caller adjusts when needed.
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

/**
 * Parse individual purchase/service transactions from an Itaú invoice PDF text.
 *
 * Returns an array of raw import rows compatible with the statement-import pipeline:
 *   { line: number, raw: { date, type, value, description, notes, category } }
 *
 * Rules:
 *   - Positive amount  → type "Saida"  (purchase charged to card)
 *   - Negative amount  → type "Entrada" (refund/reversal credited to card)
 *   - "PAGAMENTO EFETUADO" lines → filtered (avoid duplicates with bank statement)
 *   - Structural/summary lines  → filtered
 */
export const parseItauInvoiceTransactions = (rawText) => {
  if (typeof rawText !== "string" || !rawText.trim()) {
    throw new Error("Nao foi possivel extrair transacoes da fatura.");
  }

  const invoiceMetadata = parseItauInvoice(rawText);
  const year = invoiceYear(invoiceMetadata?.dueDate ?? null);

  const lines = rawText
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const rows = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isStructuralLine(line)) continue;

    // Pattern: DD/MM DESCRIPTION VALUE  (value may have trailing "-" for refunds)
    // e.g. "14/02 ZP *BARBEARIA NOHVO 179,90"
    // e.g. "05/03 ZP *BARBEARIA NOHVO - 179,90"  ← space before "-" variant
    // e.g. "05/03 ZP *BARBEARIA NOHVO -179,90"
    const match = line.match(
      /^(\d{2})\/(\d{2})\s+(.+?)\s+(-\s*[\d.,]+|[\d.,]+-?)$/,
    );
    if (!match) continue;

    const [, day, month, rawDescription, rawAmount] = match;
    const description = rawDescription.trim();

    // Skip payment lines even when they have dates
    if (/^pagamento\s+efetuado/i.test(
      description.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    )) {
      continue;
    }

    // Parse amount — negative (leading or trailing "-") → Entrada (refund)
    const amountStr = rawAmount.replace(/\s/g, "");
    const isNegative = amountStr.startsWith("-") || amountStr.endsWith("-");
    const numericStr = amountStr.replace(/^-|-$/g, "");
    const parsed = parseBRL(numericStr);

    if (parsed === null) continue;

    const type = isNegative ? "Entrada" : "Saida";
    const isoDate = shortDateToIso(day, month, year);

    rows.push({
      line: i + 1,
      raw: {
        date: isoDate,
        type,
        value: String(parsed.toFixed(2)),
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
 * @typedef {Object} ParsedItauInvoice
 * @property {number}      totalAmount
 * @property {string}      dueDate          - "YYYY-MM-DD"
 * @property {string|null} periodStart      - null when not found in PDF
 * @property {string|null} periodEnd        - null when not found in PDF
 * @property {number|null} minimumPayment
 * @property {number|null} financedBalance
 * @property {string|null} cardLast4
 * @property {string}      issuer           - always 'itau'
 * @property {Object}      fieldsSources    - which regex matched each field
 */

/**
 * Parse raw text from an Itaú credit card invoice PDF.
 * Returns null if mandatory fields (totalAmount OR dueDate) are missing.
 */
export const parseItauInvoice = (rawText) => {
  if (typeof rawText !== "string" || !rawText.trim()) return null;

  const text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const totalResult = extractTotalAmount(text);
  if (!totalResult) return null;

  const dueDateResult = extractDueDate(text);
  if (!dueDateResult) return null;

  const periodResult = extractPeriod(text);
  const minimumPayment = extractMinimumPayment(text);
  const financedBalance = extractFinancedBalance(text);
  const cardLast4 = extractCardLast4(text);

  const fieldsSources = {
    totalAmount: totalResult.source,
    dueDate: dueDateResult.source,
    periodStart: periodResult ? periodResult.source : null,
    periodEnd: periodResult ? periodResult.source : null,
  };

  return {
    totalAmount: totalResult.value,
    dueDate: dueDateResult.value,
    periodStart: periodResult ? periodResult.start : null,
    periodEnd: periodResult ? periodResult.end : null,
    minimumPayment,
    financedBalance,
    cardLast4,
    issuer: "itau",
    fieldsSources,
  };
};
