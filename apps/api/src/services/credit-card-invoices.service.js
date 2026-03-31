import { dbQuery } from "../db/index.js";
import { extractTextFromPdfWithOcr } from "../domain/imports/pdf-ocr.js";
import { parseItauInvoice } from "../domain/imports/itau-invoice.parser.js";

const CREDIT_CARD_INVOICE_BILL_TYPE = "credit_card_invoice";

const createError = (status, message, extra = {}) => {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
};

const normalizeUserId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(401, "Usuario nao autenticado.");
  }
  return parsed;
};

const normalizeCardId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(400, "ID de cartao invalido.");
  }
  return parsed;
};

const normalizeInvoiceId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(400, "ID de fatura invalido.");
  }
  return parsed;
};

const toMoney = (value) => Number(Number(value || 0).toFixed(2));

// ─── Period inference ─────────────────────────────────────────────────────────

/**
 * Infer period_start and period_end from dueDate and card's closing_day.
 *
 * Logic:
 *   - period_end   = closing_day of the month BEFORE dueDate's month
 *   - period_start = day after the previous closing (closing_day + 1 of month M-2)
 *
 * Example: closing_day=7, dueDate=2026-03-15
 *   period_end   = 2026-03-07
 *   period_start = 2026-02-08
 */
const inferPeriod = (dueDate, closingDay) => {
  const due = new Date(`${dueDate}T00:00:00`);
  if (isNaN(due.getTime())) return null;

  // period_end: closing_day of the same month as dueDate
  const endYear = due.getUTCFullYear();
  const endMonth = due.getUTCMonth() + 1; // 1-based
  const daysInEndMonth = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
  const endDay = Math.min(closingDay, daysInEndMonth);

  const periodEndDate = new Date(Date.UTC(endYear, endMonth - 1, endDay));

  // If period_end >= due_date, use the previous month's closing
  if (periodEndDate >= due) {
    periodEndDate.setUTCMonth(periodEndDate.getUTCMonth() - 1);
    const prevMonthDays = new Date(
      Date.UTC(periodEndDate.getUTCFullYear(), periodEndDate.getUTCMonth() + 1, 0)
    ).getUTCDate();
    periodEndDate.setUTCDate(Math.min(closingDay, prevMonthDays));
  }

  // period_start: day after closing_day of the month before period_end
  const periodStartDate = new Date(periodEndDate);
  periodStartDate.setUTCMonth(periodStartDate.getUTCMonth() - 1);
  const prevMonthDays = new Date(
    Date.UTC(periodStartDate.getUTCFullYear(), periodStartDate.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const startClosingDay = Math.min(closingDay, prevMonthDays);
  periodStartDate.setUTCDate(startClosingDay + 1);

  const toISO = (d) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

  const start = toISO(periodStartDate);
  const end = toISO(periodEndDate);

  // Sanity check
  if (start >= end) return null;

  return { start, end };
};

// ─── Formatters ───────────────────────────────────────────────────────────────

const formatInvoice = (row) => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  creditCardId: Number(row.credit_card_id),
  issuer: row.issuer,
  cardLast4: row.card_last4 ?? null,
  periodStart: typeof row.period_start === "string"
    ? row.period_start
    : row.period_start?.toISOString().slice(0, 10) ?? null,
  periodEnd: typeof row.period_end === "string"
    ? row.period_end
    : row.period_end?.toISOString().slice(0, 10) ?? null,
  dueDate: typeof row.due_date === "string"
    ? row.due_date
    : row.due_date?.toISOString().slice(0, 10) ?? null,
  totalAmount: Number(row.total_amount),
  minimumPayment: row.minimum_payment != null ? Number(row.minimum_payment) : null,
  financedBalance: row.financed_balance != null ? Number(row.financed_balance) : null,
  parseConfidence: row.parse_confidence,
  parseMetadata: row.parse_metadata ?? {},
  linkedBillId: row.linked_bill_id ? Number(row.linked_bill_id) : null,
  createdAt: typeof row.created_at === "string" ? row.created_at : row.created_at?.toISOString(),
  updatedAt: typeof row.updated_at === "string" ? row.updated_at : row.updated_at?.toISOString(),
});

// ─── Parse PDF ────────────────────────────────────────────────────────────────

export const parseCreditCardInvoicePdfForUser = async (rawUserId, rawCardId, fileBuffer) => {
  const userId = normalizeUserId(rawUserId);
  const cardId = normalizeCardId(rawCardId);

  // Ownership check
  const { rows: cardRows } = await dbQuery(
    `SELECT id, closing_day FROM credit_cards WHERE id = $1 AND user_id = $2 AND is_active = true`,
    [cardId, userId]
  );
  if (!cardRows.length) throw createError(404, "Cartao nao encontrado.");
  const card = cardRows[0];

  // Extract text from PDF
  let rawText;
  try {
    rawText = await extractTextFromPdfWithOcr(fileBuffer);
  } catch {
    throw createError(422, "Nao foi possivel ler o PDF. Verifique se o arquivo nao esta corrompido.");
  }

  // Parse
  const parsed = parseItauInvoice(rawText);
  if (!parsed) {
    throw createError(422, "Nao foi possivel extrair dados da fatura. Verifique se o PDF e um extrato do Itau.", {
      publicCode: "INVOICE_PARSE_FAILED",
    });
  }

  // Resolve period
  let periodStart = parsed.periodStart;
  let periodEnd = parsed.periodEnd;
  let parseConfidence = "high";
  const fieldsSources = { ...parsed.fieldsSources };
  const inferenceContext = {};

  if (!periodStart || !periodEnd) {
    const closingDay = Number(card.closing_day);
    if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31) {
      throw createError(422,
        "Periodo da fatura nao encontrado no PDF e o cartao nao tem dia de fechamento cadastrado.",
        { publicCode: "INVOICE_PERIOD_INFERENCE_FAILED" }
      );
    }
    const inferred = inferPeriod(parsed.dueDate, closingDay);
    if (!inferred) {
      throw createError(422,
        "Nao foi possivel inferir o periodo da fatura a partir do dia de fechamento do cartao.",
        { publicCode: "INVOICE_PERIOD_INFERENCE_FAILED" }
      );
    }
    periodStart = inferred.start;
    periodEnd = inferred.end;
    parseConfidence = "low";
    fieldsSources.periodStart = "inference:closing_day";
    fieldsSources.periodEnd = "inference:closing_day";
    inferenceContext.closingDay = closingDay;
  }

  const parseMetadata = {
    rawExcerpt: parsed.rawExcerpt,
    fieldsSources,
    ...(Object.keys(inferenceContext).length > 0 ? { inferenceContext } : {}),
  };

  const { rows } = await dbQuery(
    `INSERT INTO credit_card_invoices
       (user_id, credit_card_id, issuer, card_last4, period_start, period_end,
        due_date, total_amount, minimum_payment, financed_balance,
        parse_confidence, parse_metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      userId, cardId, parsed.issuer, parsed.cardLast4 ?? null,
      periodStart, periodEnd, parsed.dueDate,
      parsed.totalAmount,
      parsed.minimumPayment ?? null,
      parsed.financedBalance ?? null,
      parseConfidence,
      JSON.stringify(parseMetadata),
    ]
  );

  return formatInvoice(rows[0]);
};

// ─── List ─────────────────────────────────────────────────────────────────────

export const listCreditCardInvoicesForUser = async (rawUserId, rawCardId) => {
  const userId = normalizeUserId(rawUserId);
  const cardId = normalizeCardId(rawCardId);

  // Ownership check
  const { rows: cardRows } = await dbQuery(
    `SELECT id FROM credit_cards WHERE id = $1 AND user_id = $2 AND is_active = true`,
    [cardId, userId]
  );
  if (!cardRows.length) throw createError(404, "Cartao nao encontrado.");

  const { rows } = await dbQuery(
    `SELECT * FROM credit_card_invoices
      WHERE credit_card_id = $1 AND user_id = $2
      ORDER BY period_start DESC
      LIMIT 24`,
    [cardId, userId]
  );

  return rows.map(formatInvoice);
};

// ─── Link bill ────────────────────────────────────────────────────────────────

export const linkBillToInvoiceForUser = async (rawUserId, rawCardId, rawInvoiceId, input) => {
  const userId = normalizeUserId(rawUserId);
  const cardId = normalizeCardId(rawCardId);
  const invoiceId = normalizeInvoiceId(rawInvoiceId);

  const billId = Number(input.billId);
  if (!Number.isInteger(billId) || billId <= 0) {
    throw createError(400, "billId invalido.");
  }

  // Invoice ownership
  const { rows: invRows } = await dbQuery(
    `SELECT id, linked_bill_id, total_amount FROM credit_card_invoices
      WHERE id = $1 AND credit_card_id = $2 AND user_id = $3`,
    [invoiceId, cardId, userId]
  );
  if (!invRows.length) throw createError(404, "Fatura nao encontrada.");
  if (invRows[0].linked_bill_id) throw createError(409, "Fatura ja esta vinculada a uma pendencia.");

  // Bill ownership + same card
  const { rows: billRows } = await dbQuery(
    `SELECT id, credit_card_id, bill_type, status, amount FROM bills WHERE id = $1 AND user_id = $2`,
    [billId, userId]
  );
  if (!billRows.length) throw createError(404, "Pendencia nao encontrada.");

  if (billRows[0].bill_type !== CREDIT_CARD_INVOICE_BILL_TYPE) {
    throw createError(422, "A pendencia informada nao e do tipo fatura de cartao.");
  }

  if (billRows[0].status !== "pending") {
    throw createError(409, "Apenas pendencias pendentes podem ser vinculadas a fatura.");
  }

  const billCardId = billRows[0].credit_card_id ? Number(billRows[0].credit_card_id) : null;
  if (billCardId !== cardId) {
    throw createError(422, "A pendencia deve pertencer ao mesmo cartao da fatura.");
  }

  const invoiceAmount = toMoney(invRows[0].total_amount);
  const billAmount = toMoney(billRows[0].amount);
  if (billAmount !== invoiceAmount) {
    throw createError(422, "Valor da pendencia difere do total da fatura.");
  }

  const { rows: existingLinkRows } = await dbQuery(
    `SELECT id
      FROM credit_card_invoices
      WHERE user_id = $1
        AND linked_bill_id = $2
      LIMIT 1`,
    [userId, billId],
  );
  if (existingLinkRows.length > 0) {
    throw createError(409, "Pendencia ja esta vinculada a outra fatura.");
  }

  const { rows: updated } = await dbQuery(
    `UPDATE credit_card_invoices
        SET linked_bill_id = $1, updated_at = NOW()
      WHERE id = $2 AND user_id = $3
      RETURNING *`,
    [billId, invoiceId, userId]
  );

  return formatInvoice(updated[0]);
};
