import { dbQuery } from "../db/index.js";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeUserId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(401, "Usuario nao autenticado.");
  }
  return parsed;
};

const normalizeAccountId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(400, "ID de conta invalido.");
  }
  return parsed;
};

const normalizeName = (value) => {
  if (!value || !String(value).trim()) {
    throw createError(400, "Nome da conta e obrigatorio.");
  }
  const trimmed = String(value).trim();
  if (trimmed.length > 120) {
    throw createError(400, "Nome da conta muito longo.");
  }
  return trimmed;
};

const normalizeBankName = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed.length > 120) {
    throw createError(400, "Nome do banco muito longo.");
  }
  return trimmed;
};

const normalizeBalance = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw createError(400, "Saldo invalido.");
  }
  return Number(parsed.toFixed(2));
};

const normalizeLimitTotal = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createError(400, "Limite total invalido. Informe um valor maior ou igual a zero.");
  }
  return Number(parsed.toFixed(2));
};

const deriveLimitFields = (balance, limitTotal) => {
  const limitUsed = balance >= 0 ? 0 : Math.min(-balance, limitTotal);
  const limitAvailable = limitTotal - limitUsed;
  return {
    limitUsed: Number(limitUsed.toFixed(2)),
    limitAvailable: Number(limitAvailable.toFixed(2)),
  };
};

const formatAccount = (row) => {
  const balance = Number(row.balance);
  const limitTotal = Number(row.limit_total);
  const { limitUsed, limitAvailable } = deriveLimitFields(balance, limitTotal);

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    bankName: row.bank_name,
    balance,
    limitTotal,
    limitUsed,
    limitAvailable,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const listBankAccountsByUser = async (rawUserId) => {
  const userId = normalizeUserId(rawUserId);

  const { rows } = await dbQuery(
    `SELECT * FROM bank_accounts WHERE user_id = $1 AND is_active = true ORDER BY created_at ASC`,
    [userId]
  );

  const accounts = rows.map(formatAccount);

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
  const totalLimitTotal = accounts.reduce((sum, a) => sum + a.limitTotal, 0);
  const totalLimitUsed = accounts.reduce((sum, a) => sum + a.limitUsed, 0);
  const totalLimitAvailable = totalLimitTotal - totalLimitUsed;

  return {
    accounts,
    summary: {
      totalBalance: Number(totalBalance.toFixed(2)),
      totalLimitTotal: Number(totalLimitTotal.toFixed(2)),
      totalLimitUsed: Number(totalLimitUsed.toFixed(2)),
      totalLimitAvailable: Number(totalLimitAvailable.toFixed(2)),
      accountsCount: accounts.length,
    },
  };
};

export const createBankAccountForUser = async (rawUserId, input) => {
  const userId = normalizeUserId(rawUserId);
  const name = normalizeName(input.name);
  const bankName = normalizeBankName(input.bankName);
  const balance = normalizeBalance(input.balance ?? 0);
  const limitTotal = normalizeLimitTotal(input.limitTotal);

  const { rows } = await dbQuery(
    `INSERT INTO bank_accounts (user_id, name, bank_name, balance, limit_total)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, name, bankName, balance, limitTotal]
  );

  return formatAccount(rows[0]);
};

export const updateBankAccountForUser = async (rawUserId, rawAccountId, input) => {
  const userId = normalizeUserId(rawUserId);
  const accountId = normalizeAccountId(rawAccountId);

  const { rows: existing } = await dbQuery(
    `SELECT * FROM bank_accounts WHERE id = $1 AND user_id = $2 AND is_active = true`,
    [accountId, userId]
  );

  if (!existing.length) {
    throw createError(404, "Conta bancaria nao encontrada.");
  }

  const current = existing[0];

  const name = input.name !== undefined ? normalizeName(input.name) : current.name;
  const bankName = input.bankName !== undefined ? normalizeBankName(input.bankName) : current.bank_name;
  const balance = input.balance !== undefined ? normalizeBalance(input.balance) : Number(current.balance);
  const limitTotal = input.limitTotal !== undefined ? normalizeLimitTotal(input.limitTotal) : Number(current.limit_total);

  const { rows } = await dbQuery(
    `UPDATE bank_accounts
     SET name = $1, bank_name = $2, balance = $3, limit_total = $4, updated_at = NOW()
     WHERE id = $5 AND user_id = $6
     RETURNING *`,
    [name, bankName, balance, limitTotal, accountId, userId]
  );

  return formatAccount(rows[0]);
};

export const deleteBankAccountForUser = async (rawUserId, rawAccountId) => {
  const userId = normalizeUserId(rawUserId);
  const accountId = normalizeAccountId(rawAccountId);

  const { rows } = await dbQuery(
    `UPDATE bank_accounts SET is_active = false, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND is_active = true
     RETURNING id`,
    [accountId, userId]
  );

  if (!rows.length) {
    throw createError(404, "Conta bancaria nao encontrada.");
  }

  return { deleted: true };
};
