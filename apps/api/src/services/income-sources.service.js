import { dbQuery, withDbTransaction } from "../db/index.js";
import { TRANSACTION_TYPE_ENTRY } from "../constants/transaction-types.js";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const NAME_MAX_LENGTH = 200;
const LABEL_MAX_LENGTH = 200;
const NOTES_MAX_LENGTH = 1000;

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const toISODate = (value = new Date()) => {
  const date = new Date(value);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toISODateTime = (value) => {
  if (typeof value === "string") return value;
  return new Date(value).toISOString();
};

const isValidISODate = (value) => {
  if (typeof value !== "string" || !ISO_DATE_REGEX.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime());
};

const toMoney = (value) => Number(Number(value || 0).toFixed(2));

// ─── Normalization ─────────────────────────────────────────────────────────────

const normalizeUserId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(401, "Usuario nao autenticado.");
  }
  return parsed;
};

const normalizeSourceId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(400, "ID de fonte de renda invalido.");
  }
  return parsed;
};

const normalizeDeductionId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(400, "ID de desconto invalido.");
  }
  return parsed;
};

const normalizeStatementId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(400, "ID de extrato invalido.");
  }
  return parsed;
};

const normalizeSourceName = (value) => {
  if (typeof value !== "string" || !value.trim()) {
    throw createError(400, "Nome da fonte de renda e obrigatorio.");
  }
  const trimmed = value.trim();
  if (trimmed.length > NAME_MAX_LENGTH) {
    throw createError(400, `Nome deve ter no maximo ${NAME_MAX_LENGTH} caracteres.`);
  }
  return trimmed;
};

const normalizeDeductionLabel = (value) => {
  if (typeof value !== "string" || !value.trim()) {
    throw createError(400, "Rotulo do desconto e obrigatorio.");
  }
  const trimmed = value.trim();
  if (trimmed.length > LABEL_MAX_LENGTH) {
    throw createError(400, `Rotulo deve ter no maximo ${LABEL_MAX_LENGTH} caracteres.`);
  }
  return trimmed;
};

const normalizeDeductionAmount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createError(400, "Valor do desconto deve ser maior ou igual a zero.");
  }
  return toMoney(parsed);
};

const normalizeNetAmount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw createError(400, "Valor liquido deve ser maior que zero.");
  }
  return toMoney(parsed);
};

const normalizeReferenceMonth = (value) => {
  if (typeof value !== "string" || !ISO_MONTH_REGEX.test(value)) {
    throw createError(400, "Mes de referencia invalido. Use o formato YYYY-MM.");
  }
  return value;
};

const normalizePaymentDate = (value) => {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !isValidISODate(value)) {
    throw createError(400, "Data de pagamento invalida.");
  }
  return value;
};

const normalizeOptionalCategoryId = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(400, "ID de categoria invalido.");
  }
  return parsed;
};

const normalizeOptionalDefaultDay = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
    throw createError(400, "Dia padrao deve ser entre 1 e 31.");
  }
  return parsed;
};

const normalizeOptionalNotes = (value) => {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > NOTES_MAX_LENGTH) {
    throw createError(400, `Notas deve ter no maximo ${NOTES_MAX_LENGTH} caracteres.`);
  }
  return trimmed;
};

// ─── Row mappers ───────────────────────────────────────────────────────────────

const mapSourceRow = (row) => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  name: String(row.name),
  categoryId: row.category_id != null ? Number(row.category_id) : null,
  defaultDay: row.default_day != null ? Number(row.default_day) : null,
  notes: row.notes != null ? String(row.notes) : null,
  createdAt: toISODateTime(row.created_at),
  updatedAt: toISODateTime(row.updated_at),
});

const mapDeductionRow = (row) => ({
  id: Number(row.id),
  incomeSourceId: Number(row.income_source_id),
  label: String(row.label),
  amount: toMoney(row.amount),
  isVariable: Boolean(row.is_variable),
  isActive: Boolean(row.is_active),
  createdAt: toISODateTime(row.created_at),
  updatedAt: toISODateTime(row.updated_at),
});

const mapStatementRow = (row) => ({
  id: Number(row.id),
  incomeSourceId: Number(row.income_source_id),
  referenceMonth: String(row.reference_month),
  netAmount: toMoney(row.net_amount),
  totalDeductions: toMoney(row.total_deductions),
  paymentDate: row.payment_date != null ? toISODate(row.payment_date) : null,
  status: String(row.status),
  postedTransactionId: row.posted_transaction_id != null ? Number(row.posted_transaction_id) : null,
  createdAt: toISODateTime(row.created_at),
  updatedAt: toISODateTime(row.updated_at),
});

const mapStatementDeductionRow = (row) => ({
  id: Number(row.id),
  statementId: Number(row.statement_id),
  label: String(row.label),
  amount: toMoney(row.amount),
  isVariable: Boolean(row.is_variable),
});

const mapTransactionRow = (row) => ({
  id: Number(row.id),
  type: String(row.type),
  value: toMoney(row.value),
  date: toISODate(row.date),
  description: row.description != null ? String(row.description) : null,
  categoryId: row.category_id != null ? Number(row.category_id) : null,
});

// ─── Income Sources ────────────────────────────────────────────────────────────

export const createIncomeSourceForUser = async (userId, payload) => {
  const uid = normalizeUserId(userId);
  const name = normalizeSourceName(payload.name);
  const categoryId = normalizeOptionalCategoryId(payload.categoryId);
  const defaultDay = normalizeOptionalDefaultDay(payload.defaultDay);
  const notes = normalizeOptionalNotes(payload.notes);

  const { rows } = await dbQuery(
    `INSERT INTO income_sources (user_id, name, category_id, default_day, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [uid, name, categoryId, defaultDay, notes],
  );
  return mapSourceRow(rows[0]);
};

export const listIncomeSourcesForUser = async (userId) => {
  const uid = normalizeUserId(userId);

  const { rows: sourceRows } = await dbQuery(
    `SELECT * FROM income_sources WHERE user_id = $1 ORDER BY created_at ASC`,
    [uid],
  );

  if (sourceRows.length === 0) return [];

  const { rows: deductionRows } = await dbQuery(
    `SELECT d.* FROM income_deductions d
     JOIN income_sources s ON s.id = d.income_source_id
     WHERE s.user_id = $1 AND d.is_active = TRUE
     ORDER BY d.sort_order ASC, d.id ASC`,
    [uid],
  );

  const deductionsBySource = {};
  for (const row of deductionRows) {
    const sid = Number(row.income_source_id);
    if (!deductionsBySource[sid]) deductionsBySource[sid] = [];
    deductionsBySource[sid].push(mapDeductionRow(row));
  }

  return sourceRows.map((row) => ({
    ...mapSourceRow(row),
    deductions: deductionsBySource[Number(row.id)] ?? [],
  }));
};

export const updateIncomeSourceForUser = async (userId, sourceId, payload) => {
  const uid = normalizeUserId(userId);
  const sid = normalizeSourceId(sourceId);

  const setClauses = [];
  const params = [];

  if (payload.name !== undefined) {
    params.push(normalizeSourceName(payload.name));
    setClauses.push(`name = $${params.length}`);
  }
  if (payload.categoryId !== undefined) {
    params.push(normalizeOptionalCategoryId(payload.categoryId));
    setClauses.push(`category_id = $${params.length}`);
  }
  if (payload.defaultDay !== undefined) {
    params.push(normalizeOptionalDefaultDay(payload.defaultDay));
    setClauses.push(`default_day = $${params.length}`);
  }
  if (payload.notes !== undefined) {
    params.push(normalizeOptionalNotes(payload.notes));
    setClauses.push(`notes = $${params.length}`);
  }

  if (setClauses.length === 0) {
    const { rows } = await dbQuery(
      `SELECT * FROM income_sources WHERE id = $1 AND user_id = $2`,
      [sid, uid],
    );
    if (!rows[0]) throw createError(404, "Fonte de renda nao encontrada.");
    return mapSourceRow(rows[0]);
  }

  setClauses.push(`updated_at = NOW()`);
  params.push(sid, uid);

  const { rows } = await dbQuery(
    `UPDATE income_sources SET ${setClauses.join(", ")}
     WHERE id = $${params.length - 1} AND user_id = $${params.length}
     RETURNING *`,
    params,
  );

  if (!rows[0]) throw createError(404, "Fonte de renda nao encontrada.");
  return mapSourceRow(rows[0]);
};

export const deleteIncomeSourceForUser = async (userId, sourceId) => {
  const uid = normalizeUserId(userId);
  const sid = normalizeSourceId(sourceId);

  const { rows } = await dbQuery(
    `DELETE FROM income_sources WHERE id = $1 AND user_id = $2 RETURNING id`,
    [sid, uid],
  );
  if (!rows[0]) throw createError(404, "Fonte de renda nao encontrada.");
  return { id: Number(rows[0].id) };
};

// ─── Deductions ────────────────────────────────────────────────────────────────

const requireSourceOwnership = async (uid, sourceId) => {
  const { rows } = await dbQuery(
    `SELECT id FROM income_sources WHERE id = $1 AND user_id = $2`,
    [sourceId, uid],
  );
  if (!rows[0]) throw createError(404, "Fonte de renda nao encontrada.");
};

const requireDeductionOwnership = async (uid, deductionId) => {
  const { rows } = await dbQuery(
    `SELECT d.id FROM income_deductions d
     JOIN income_sources s ON s.id = d.income_source_id
     WHERE d.id = $1 AND s.user_id = $2`,
    [deductionId, uid],
  );
  if (!rows[0]) throw createError(404, "Desconto nao encontrado.");
};

export const createDeductionForSource = async (userId, sourceId, payload) => {
  const uid = normalizeUserId(userId);
  const sid = normalizeSourceId(sourceId);

  await requireSourceOwnership(uid, sid);

  const label = normalizeDeductionLabel(payload.label);
  const amount = normalizeDeductionAmount(payload.amount);
  const isVariable = Boolean(payload.isVariable);

  const { rows } = await dbQuery(
    `INSERT INTO income_deductions
       (income_source_id, label, amount, is_variable)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [sid, label, amount, isVariable],
  );
  return mapDeductionRow(rows[0]);
};

export const updateDeductionForSource = async (userId, deductionId, payload) => {
  const uid = normalizeUserId(userId);
  const did = normalizeDeductionId(deductionId);

  await requireDeductionOwnership(uid, did);

  const setClauses = [];
  const params = [];

  if (payload.label !== undefined) {
    params.push(normalizeDeductionLabel(payload.label));
    setClauses.push(`label = $${params.length}`);
  }
  if (payload.amount !== undefined) {
    params.push(normalizeDeductionAmount(payload.amount));
    setClauses.push(`amount = $${params.length}`);
  }
  if (payload.isVariable !== undefined) {
    params.push(Boolean(payload.isVariable));
    setClauses.push(`is_variable = $${params.length}`);
  }
  if (payload.isActive !== undefined) {
    params.push(Boolean(payload.isActive));
    setClauses.push(`is_active = $${params.length}`);
  }
  if (setClauses.length === 0) {
    const { rows } = await dbQuery(`SELECT * FROM income_deductions WHERE id = $1`, [did]);
    return mapDeductionRow(rows[0]);
  }

  setClauses.push(`updated_at = NOW()`);
  params.push(did);

  const { rows } = await dbQuery(
    `UPDATE income_deductions SET ${setClauses.join(", ")}
     WHERE id = $${params.length}
     RETURNING *`,
    params,
  );
  return mapDeductionRow(rows[0]);
};

export const deleteDeductionForSource = async (userId, deductionId) => {
  const uid = normalizeUserId(userId);
  const did = normalizeDeductionId(deductionId);

  await requireDeductionOwnership(uid, did);

  await dbQuery(`DELETE FROM income_deductions WHERE id = $1`, [did]);
  return { id: did };
};

// ─── Statements ────────────────────────────────────────────────────────────────

const requireStatementOwnership = async (uid, statementId) => {
  const { rows } = await dbQuery(
    `SELECT st.id, st.status FROM income_statements st
     JOIN income_sources s ON s.id = st.income_source_id
     WHERE st.id = $1 AND s.user_id = $2`,
    [statementId, uid],
  );
  if (!rows[0]) throw createError(404, "Extrato nao encontrado.");
  return rows[0];
};

export const createStatementDraftForSource = async (userId, sourceId, payload) => {
  const uid = normalizeUserId(userId);
  const sid = normalizeSourceId(sourceId);

  await requireSourceOwnership(uid, sid);

  const referenceMonth = normalizeReferenceMonth(payload.referenceMonth);
  const netAmount = normalizeNetAmount(payload.netAmount);
  const paymentDate = normalizePaymentDate(payload.paymentDate ?? null);

  return withDbTransaction(async (client) => {
    // Fetch active deductions to clone
    const { rows: deductionRows } = await client.query(
      `SELECT * FROM income_deductions
       WHERE income_source_id = $1 AND is_active = TRUE
       ORDER BY sort_order ASC, id ASC`,
      [sid],
    );

    const totalDeductions = deductionRows.reduce(
      (sum, row) => sum + toMoney(row.amount),
      0,
    );

    // Create statement (409 if unique constraint fires)
    let stmtRow;
    try {
      const { rows } = await client.query(
        `INSERT INTO income_statements
           (income_source_id, reference_month, net_amount, total_deductions, payment_date)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [sid, referenceMonth, netAmount, toMoney(totalDeductions), paymentDate],
      );
      stmtRow = rows[0];
    } catch (err) {
      if (err.code === "23505") {
        throw createError(409, `Ja existe um extrato para ${referenceMonth}.`);
      }
      throw err;
    }

    // Clone active deductions as snapshot
    const snapshotDeductions = [];
    for (const d of deductionRows) {
      const { rows } = await client.query(
        `INSERT INTO income_statement_deductions
           (statement_id, label, amount, is_variable)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [stmtRow.id, d.label, d.amount, d.is_variable],
      );
      snapshotDeductions.push(mapStatementDeductionRow(rows[0]));
    }

    return {
      statement: mapStatementRow(stmtRow),
      deductions: snapshotDeductions,
    };
  });
};

export const getStatementWithDeductions = async (userId, statementId) => {
  const uid = normalizeUserId(userId);
  const stid = normalizeStatementId(statementId);

  await requireStatementOwnership(uid, stid);

  const [{ rows: stmtRows }, { rows: dedRows }] = await Promise.all([
    dbQuery(`SELECT * FROM income_statements WHERE id = $1`, [stid]),
    dbQuery(
      `SELECT * FROM income_statement_deductions WHERE statement_id = $1 ORDER BY id ASC`,
      [stid],
    ),
  ]);

  return {
    statement: mapStatementRow(stmtRows[0]),
    deductions: dedRows.map(mapStatementDeductionRow),
  };
};

export const updateStatementForSource = async (userId, statementId, payload) => {
  const uid = normalizeUserId(userId);
  const stid = normalizeStatementId(statementId);

  const existing = await requireStatementOwnership(uid, stid);
  if (existing.status === "posted") {
    throw createError(400, "Extrato ja lancado. Nao e possivel editar.");
  }

  const setClauses = [];
  const params = [];

  if (payload.netAmount !== undefined) {
    params.push(normalizeNetAmount(payload.netAmount));
    setClauses.push(`net_amount = $${params.length}`);
  }
  if (payload.paymentDate !== undefined) {
    params.push(normalizePaymentDate(payload.paymentDate));
    setClauses.push(`payment_date = $${params.length}`);
  }

  // Update individual snapshot deduction amounts
  if (Array.isArray(payload.deductions)) {
    for (const { id, amount } of payload.deductions) {
      const did = normalizeDeductionId(id);
      const amt = normalizeDeductionAmount(amount);
      await dbQuery(
        `UPDATE income_statement_deductions SET amount = $1 WHERE id = $2 AND statement_id = $3`,
        [amt, did, stid],
      );
    }

    // Recompute total_deductions from snapshot
    const { rows: dedRows } = await dbQuery(
      `SELECT amount FROM income_statement_deductions WHERE statement_id = $1`,
      [stid],
    );
    const newTotal = dedRows.reduce((sum, r) => sum + toMoney(r.amount), 0);
    params.push(toMoney(newTotal));
    setClauses.push(`total_deductions = $${params.length}`);
  }

  if (setClauses.length === 0) {
    return getStatementWithDeductions(uid, stid);
  }

  setClauses.push(`updated_at = NOW()`);
  params.push(stid);

  await dbQuery(
    `UPDATE income_statements SET ${setClauses.join(", ")} WHERE id = $${params.length}`,
    params,
  );

  return getStatementWithDeductions(uid, stid);
};

export const postStatementForSource = async (userId, statementId) => {
  const uid = normalizeUserId(userId);
  const stid = normalizeStatementId(statementId);

  return withDbTransaction(async (client) => {
    // Fetch statement + source (for category_id and name)
    const { rows: stmtRows } = await client.query(
      `SELECT st.*, s.name AS source_name, s.category_id AS source_category_id
       FROM income_statements st
       JOIN income_sources s ON s.id = st.income_source_id
       WHERE st.id = $1 AND s.user_id = $2`,
      [stid, uid],
    );

    if (!stmtRows[0]) throw createError(404, "Extrato nao encontrado.");
    const stmt = stmtRows[0];

    if (stmt.status === "posted") {
      throw createError(409, "Extrato ja foi lancado.");
    }

    const paymentDate = stmt.payment_date != null
      ? toISODate(stmt.payment_date)
      : toISODate();

    const description = `${stmt.source_name} – ${stmt.reference_month}`;

    // Create income transaction
    const { rows: txRows } = await client.query(
      `INSERT INTO transactions (user_id, type, value, date, description, category_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        uid,
        TRANSACTION_TYPE_ENTRY,
        toMoney(stmt.net_amount),
        paymentDate,
        description,
        stmt.source_category_id ?? null,
      ],
    );

    // Mark statement as posted
    const { rows: updatedStmt } = await client.query(
      `UPDATE income_statements
       SET status = 'posted', posted_transaction_id = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [txRows[0].id, stid],
    );

    return {
      statement: mapStatementRow(updatedStmt[0]),
      transaction: mapTransactionRow(txRows[0]),
    };
  });
};

export const listStatementsForSource = async (userId, sourceId) => {
  const uid = normalizeUserId(userId);
  const sid = normalizeSourceId(sourceId);

  await requireSourceOwnership(uid, sid);

  const { rows } = await dbQuery(
    `SELECT * FROM income_statements
     WHERE income_source_id = $1
     ORDER BY reference_month DESC`,
    [sid],
  );

  return rows.map(mapStatementRow);
};
