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
