import { dbQuery, withDbTransaction } from "../db/index.js";
import { TRANSACTION_TYPE_EXIT } from "../constants/transaction-types.js";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const TITLE_MAX_LENGTH = 200;
const VALID_STATUS_FILTERS = new Set(["pending", "paid", "overdue"]);
const VALID_BILL_TYPES = new Set(["energy", "water", "rent", "internet", "phone", "gas", "other"]);

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const toISODate = (value = new Date()) => {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toISODateTime = (value) => {
  if (typeof value === "string") return value;
  return new Date(value).toISOString();
};

const isValidISODate = (value) => {
  if (typeof value !== "string" || !ISO_DATE_REGEX.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  return toISODate(parsed) === value;
};

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const toMoney = (value) => Number(Number(value || 0).toFixed(2));

// ─── Normalization ────────────────────────────────────────────────────────────

const normalizeUserId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(401, "Usuario nao autenticado.");
  }
  return parsed;
};

const normalizeBillId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(400, "ID de pendencia invalido.");
  }
  return parsed;
};

const normalizeTitle = (value) => {
  if (!value || !String(value).trim()) {
    throw createError(400, "Titulo e obrigatorio.");
  }
  const t = String(value).trim();
  if (t.length > TITLE_MAX_LENGTH) {
    throw createError(400, `Titulo muito longo (max ${TITLE_MAX_LENGTH} caracteres).`);
  }
  return t;
};

const normalizeAmount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw createError(400, "Valor invalido. Informe um numero maior que zero.");
  }
  return Number(parsed.toFixed(2));
};

const normalizeDueDate = (value) => {
  if (!isValidISODate(value)) {
    throw createError(400, "Data de vencimento invalida. Use YYYY-MM-DD.");
  }
  return value;
};

const normalizeOptionalTitle = (value) => {
  if (typeof value === "undefined") return undefined;
  return normalizeTitle(value);
};

const normalizeOptionalAmount = (value) => {
  if (typeof value === "undefined") return undefined;
  return normalizeAmount(value);
};

const normalizeOptionalDueDate = (value) => {
  if (typeof value === "undefined") return undefined;
  return normalizeDueDate(value);
};

const normalizeOptionalCategoryId = (value) => {
  if (typeof value === "undefined" || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(400, "ID de categoria invalido.");
  }
  return parsed;
};

const normalizeOptionalText = (value, fieldName) => {
  if (typeof value === "undefined") return undefined;
  if (value === null || value === "") return null;
  const trimmed = String(value).trim();
  if (trimmed.length > 500) {
    throw createError(400, `${fieldName} muito longo.`);
  }
  return trimmed || null;
};

const normalizeOptionalReferenceMonth = (value) => {
  if (typeof value === "undefined") return undefined;
  if (value === null || value === "") return null;
  const trimmed = String(value).trim();
  if (!ISO_MONTH_REGEX.test(trimmed)) {
    throw createError(400, "Mes de referencia invalido. Use YYYY-MM.");
  }
  return trimmed;
};

const normalizePaginationLimit = (value) => {
  if (typeof value === "undefined" || value === null || value === "") return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
};

const normalizePaginationOffset = (value) => {
  if (typeof value === "undefined" || value === null || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return parsed;
};

const normalizeStatusFilter = (value) => {
  if (typeof value === "undefined" || value === null || value === "") return undefined;
  const lower = String(value).toLowerCase().trim();
  if (!VALID_STATUS_FILTERS.has(lower)) return undefined;
  return lower;
};

const normalizePaidAt = (value) => {
  if (typeof value === "undefined" || value === null || value === "") return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw createError(400, "Data de pagamento invalida.");
  }
  return parsed;
};

const normalizeOptionalBillType = (value) => {
  if (value == null || value === "") return null;
  const lower = String(value).toLowerCase().trim();
  if (!VALID_BILL_TYPES.has(lower)) return null;
  return lower;
};

const normalizeOptionalImportSessionId = (value) => {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  return s || null;
};

// ─── Row mapping ──────────────────────────────────────────────────────────────

const mapBillRow = (row) => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  title: row.title,
  amount: toMoney(row.amount),
  dueDate: typeof row.due_date === "string" ? row.due_date : row.due_date.toISOString().slice(0, 10),
  status: row.status,
  isOverdue: row.status === "pending" && new Date(row.due_date) < startOfToday(),
  categoryId: row.category_id ? Number(row.category_id) : null,
  paidAt: row.paid_at ? toISODateTime(row.paid_at) : null,
  notes: row.notes || null,
  provider: row.provider || null,
  referenceMonth: row.reference_month || null,
  billType: row.bill_type || null,
  sourceImportSessionId: row.source_import_session_id || null,
  createdAt: toISODateTime(row.created_at),
  updatedAt: toISODateTime(row.updated_at),
});

const mapTransactionRow = (row) => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  type: row.type,
  value: toMoney(row.value),
  date: typeof row.date === "string" ? row.date : toISODate(row.date),
  description: row.description || null,
  categoryId: row.category_id ? Number(row.category_id) : null,
  createdAt: toISODateTime(row.created_at),
});

// ─── Public API ───────────────────────────────────────────────────────────────

export const createBillForUser = async (userId, payload = {}) => {
  const normalizedUserId = normalizeUserId(userId);
  const title = normalizeTitle(payload.title);
  const amount = normalizeAmount(payload.amount);
  const dueDate = normalizeDueDate(payload.dueDate);
  const categoryId = normalizeOptionalCategoryId(payload.categoryId);
  const notes = normalizeOptionalText(payload.notes, "Notas");
  const provider = normalizeOptionalText(payload.provider, "Fornecedor");
  const referenceMonth = normalizeOptionalReferenceMonth(payload.referenceMonth);
  const billType = normalizeOptionalBillType(payload.billType);
  const sourceImportSessionId = normalizeOptionalImportSessionId(payload.sourceImportSessionId);

  const result = await dbQuery(
    `INSERT INTO bills (user_id, title, amount, due_date, category_id, notes, provider, reference_month, bill_type, source_import_session_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [normalizedUserId, title, amount, dueDate, categoryId ?? null, notes ?? null, provider ?? null, referenceMonth ?? null, billType, sourceImportSessionId],
  );

  return mapBillRow(result.rows[0]);
};

export const listBillsByUser = async (userId, filters = {}) => {
  const normalizedUserId = normalizeUserId(userId);
  const status = normalizeStatusFilter(filters.status);
  const limit = normalizePaginationLimit(filters.limit);
  const offset = normalizePaginationOffset(filters.offset);

  const whereConditions = ["user_id = $1"];
  const params = [normalizedUserId];
  let paramIndex = 2;

  if (status === "overdue") {
    whereConditions.push(`status = 'pending'`);
    whereConditions.push(`due_date < CURRENT_DATE`);
  } else if (status === "pending" || status === "paid") {
    whereConditions.push(`status = $${paramIndex++}`);
    params.push(status);
  }

  const whereClause = whereConditions.join(" AND ");

  const countResult = await dbQuery(
    `SELECT COUNT(*) AS total FROM bills WHERE ${whereClause}`,
    params,
  );
  const total = Number(countResult.rows[0]?.total || 0);

  const itemsResult = await dbQuery(
    `SELECT * FROM bills
     WHERE ${whereClause}
     ORDER BY due_date ASC, id ASC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...params, limit, offset],
  );

  return {
    items: itemsResult.rows.map(mapBillRow),
    pagination: { limit, offset, total },
  };
};

export const getBillsSummaryForUser = async (userId) => {
  const normalizedUserId = normalizeUserId(userId);

  const today = new Date().toISOString().slice(0, 10);

  const result = await dbQuery(
    `SELECT
       COUNT(CASE WHEN status = 'pending' THEN 1 END)                               AS pending_count,
       COALESCE(SUM(CASE WHEN status = 'pending' THEN amount END), 0)               AS pending_total,
       COUNT(CASE WHEN status = 'pending' AND due_date < $2 THEN 1 END)             AS overdue_count,
       COALESCE(SUM(CASE WHEN status = 'pending' AND due_date < $2 THEN amount END), 0) AS overdue_total
     FROM bills
     WHERE user_id = $1`,
    [normalizedUserId, today],
  );

  const row = result.rows[0];

  return {
    pendingCount: Number(row.pending_count),
    pendingTotal: toMoney(row.pending_total),
    overdueCount: Number(row.overdue_count),
    overdueTotal: toMoney(row.overdue_total),
  };
};

export const updateBillForUser = async (userId, billId, payload = {}) => {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedBillId = normalizeBillId(billId);

  const existingResult = await dbQuery(
    `SELECT id, status, bill_type
     FROM bills
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [normalizedBillId, normalizedUserId],
  );

  if (existingResult.rows.length === 0) {
    throw createError(404, "Pendencia nao encontrada.");
  }

  const existingBill = existingResult.rows[0];

  if (existingBill.bill_type === "credit_card_invoice") {
    throw createError(409, "Fatura de cartao nao pode ser editada por esta tela.");
  }

  if (existingBill.status === "paid") {
    throw createError(409, "Pendencia ja foi paga e nao pode ser editada.");
  }

  const title = normalizeOptionalTitle(payload.title);
  const amount = normalizeOptionalAmount(payload.amount);
  const dueDate = normalizeOptionalDueDate(payload.dueDate);
  const categoryId = normalizeOptionalCategoryId(payload.categoryId);
  const notes = normalizeOptionalText(payload.notes, "Notas");
  const provider = normalizeOptionalText(payload.provider, "Fornecedor");
  const referenceMonth = normalizeOptionalReferenceMonth(payload.referenceMonth);

  const updates = [];
  const params = [normalizedBillId, normalizedUserId];
  let paramIndex = 3;

  if (typeof title !== "undefined") { updates.push(`title = $${paramIndex++}`); params.push(title); }
  if (typeof amount !== "undefined") { updates.push(`amount = $${paramIndex++}`); params.push(amount); }
  if (typeof dueDate !== "undefined") { updates.push(`due_date = $${paramIndex++}`); params.push(dueDate); }
  if (typeof categoryId !== "undefined") { updates.push(`category_id = $${paramIndex++}`); params.push(categoryId ?? null); }
  if (typeof notes !== "undefined") { updates.push(`notes = $${paramIndex++}`); params.push(notes); }
  if (typeof provider !== "undefined") { updates.push(`provider = $${paramIndex++}`); params.push(provider); }
  if (typeof referenceMonth !== "undefined") { updates.push(`reference_month = $${paramIndex++}`); params.push(referenceMonth); }

  if (updates.length === 0) {
    throw createError(400, "Nenhum campo para atualizar.");
  }

  const result = await dbQuery(
    `UPDATE bills
     SET ${updates.join(", ")}, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING *`,
    params,
  );

  if (result.rows.length === 0) {
    throw createError(409, "Pendencia ja foi paga e nao pode ser editada.");
  }

  return mapBillRow(result.rows[0]);
};

export const deleteBillForUser = async (userId, billId) => {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedBillId = normalizeBillId(billId);

  const existingResult = await dbQuery(
    `SELECT id, bill_type
     FROM bills
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [normalizedBillId, normalizedUserId],
  );

  if (existingResult.rows.length === 0) {
    throw createError(404, "Pendencia nao encontrada.");
  }

  if (existingResult.rows[0].bill_type === "credit_card_invoice") {
    throw createError(409, "Fatura de cartao nao pode ser excluida por esta tela.");
  }

  const result = await dbQuery(
    `DELETE FROM bills WHERE id = $1 AND user_id = $2 RETURNING id`,
    [normalizedBillId, normalizedUserId],
  );

  return { id: Number(result.rows[0].id) };
};

export const markBillAsPaidForUser = async (userId, billId, payload = {}) => {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedBillId = normalizeBillId(billId);
  const paidAt = normalizePaidAt(payload.paidAt);

  return withDbTransaction(async (client) => {
    const billResult = await client.query(
      `SELECT * FROM bills WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [normalizedBillId, normalizedUserId],
    );

    if (billResult.rows.length === 0) {
      throw createError(404, "Pendencia nao encontrada.");
    }

    const bill = billResult.rows[0];

    if (bill.status === "paid") {
      throw createError(409, "Pendencia ja foi paga.");
    }

    const updatedBillResult = await client.query(
      `UPDATE bills
       SET status = 'paid', paid_at = $3, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [normalizedBillId, normalizedUserId, paidAt],
    );

    const txDate = toISODate(paidAt);

    const txResult = await client.query(
      `INSERT INTO transactions (user_id, type, value, date, description, category_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        normalizedUserId,
        TRANSACTION_TYPE_EXIT,
        toMoney(bill.amount),
        txDate,
        bill.title,
        bill.category_id,
      ],
    );

    return {
      bill: mapBillRow(updatedBillResult.rows[0]),
      transaction: mapTransactionRow(txResult.rows[0]),
    };
  });
};

/**
 * Creates N bills atomically (all or nothing) in a single DB transaction.
 * @param {number} userId
 * @param {Array} payloads - validated before call, 2-24 items
 * @returns {Promise<Array>}
 */
export const createBillsBatchForUser = async (userId, payloads) => {
  const uid = normalizeUserId(userId);

  if (!Array.isArray(payloads) || payloads.length < 2 || payloads.length > 24) {
    throw createError(400, "Informe entre 2 e 24 parcelas.");
  }

  // Validate all payloads up-front (before transaction)
  const normalized = payloads.map((p) => ({
    title:          normalizeTitle(p.title),
    amount:         normalizeAmount(p.amount),
    dueDate:        normalizeDueDate(p.dueDate),
    categoryId:     normalizeOptionalCategoryId(p.categoryId) ?? null,
    notes:          normalizeOptionalText(p.notes, "Notas") ?? null,
    provider:       normalizeOptionalText(p.provider, "Fornecedor") ?? null,
    referenceMonth: normalizeOptionalReferenceMonth(p.referenceMonth) ?? null,
  }));

  return withDbTransaction(async (client) => {
    const results = [];
    for (const b of normalized) {
      const { rows } = await client.query(
        `INSERT INTO bills (user_id, title, amount, due_date, category_id, notes, provider, reference_month)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [uid, b.title, b.amount, b.dueDate, b.categoryId, b.notes, b.provider, b.referenceMonth],
      );
      results.push(mapBillRow(rows[0]));
    }
    return results;
  });
};

/**
 * Returns the sum and count of pending bills whose due_date <= endDate.
 * Used by the forecast engine to compute the adjusted projected balance.
 * @param {number} userId
 * @param {string} endDate - ISO date string "YYYY-MM-DD"
 */
export const getPendingBillsDueByDate = async (userId, endDate) => {
  const uid = normalizeUserId(userId);
  const { rows } = await dbQuery(
    `SELECT COALESCE(SUM(amount), 0)::float AS bills_total,
            COUNT(*)::int                   AS bills_count
     FROM bills
     WHERE user_id  = $1
       AND status   = 'pending'
       AND due_date <= $2`,
    [uid, endDate],
  );
  return {
    billsTotal: rows[0].bills_total,
    billsCount: rows[0].bills_count,
  };
};
