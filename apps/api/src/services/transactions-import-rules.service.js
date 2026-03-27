import { dbQuery } from "../db/index.js";
import { normalizeCategoryNameKey } from "./categories-normalization.js";
import { normalizeTransactionImportRuleMatchText } from "../domain/imports/transaction-import-rules.js";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeUserId = (value) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw createError(400, "Usuario invalido.");
  }

  return parsedValue;
};

const normalizeRuleId = (value) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw createError(400, "Regra invalida.");
  }

  return parsedValue;
};

const normalizeCategoryId = (value) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw createError(400, "Categoria invalida.");
  }

  return parsedValue;
};

const normalizeTransactionType = (value) => {
  if (typeof value === "undefined" || value === null || value === "") {
    return "";
  }

  const normalizedValue = String(value).trim();

  if (normalizedValue !== "Entrada" && normalizedValue !== "Saida") {
    throw createError(400, "Tipo invalido para a regra.");
  }

  return normalizedValue;
};

const mapRuleRow = (row) => ({
  id: Number(row.id),
  matchText: row.match_text,
  normalizedMatchText: row.normalized_match_text,
  transactionType: row.transaction_type || "",
  categoryId: Number(row.category_id),
  categoryName: row.category_name,
  createdAt:
    typeof row.created_at === "string"
      ? row.created_at
      : new Date(row.created_at).toISOString(),
  updatedAt:
    typeof row.updated_at === "string"
      ? row.updated_at
      : new Date(row.updated_at).toISOString(),
});

const assertCategoryBelongsToUser = async (userId, categoryId) => {
  const result = await dbQuery(
    `SELECT id
       FROM categories
      WHERE id = $1
        AND user_id = $2
        AND deleted_at IS NULL
      LIMIT 1`,
    [categoryId, userId],
  );

  if (!result.rows[0]) {
    throw createError(404, "Categoria nao encontrada.");
  }
};

export const listTransactionImportCategoryRulesByUser = async (userId) => {
  const normalizedUserId = normalizeUserId(userId);
  const result = await dbQuery(
    `SELECT r.id,
            r.match_text,
            r.normalized_match_text,
            r.transaction_type,
            r.category_id,
            r.created_at,
            r.updated_at,
            c.name AS category_name
       FROM transaction_import_category_rules r
       JOIN categories c
         ON c.id = r.category_id
        AND c.user_id = r.user_id
        AND c.deleted_at IS NULL
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC, r.id DESC`,
    [normalizedUserId],
  );

  return result.rows.map(mapRuleRow);
};

export const loadActiveTransactionImportCategoryRulesByUser = async (userId) => {
  const normalizedUserId = normalizeUserId(userId);
  const result = await dbQuery(
    `SELECT r.id,
            r.match_text,
            r.normalized_match_text,
            r.transaction_type,
            r.category_id,
            c.name AS category_name
       FROM transaction_import_category_rules r
       JOIN categories c
         ON c.id = r.category_id
        AND c.user_id = r.user_id
        AND c.deleted_at IS NULL
      WHERE r.user_id = $1
      ORDER BY r.id DESC`,
    [normalizedUserId],
  );

  return result.rows
    .map((row) => ({
      id: Number(row.id),
      matchText: row.match_text,
      normalizedMatchText: row.normalized_match_text,
      transactionType: row.transaction_type || "",
      categoryId: Number(row.category_id),
      categoryName: row.category_name,
    }))
    .sort((leftRule, rightRule) => {
      const patternLengthDelta =
        String(rightRule.normalizedMatchText || "").length -
        String(leftRule.normalizedMatchText || "").length;

      if (patternLengthDelta !== 0) {
        return patternLengthDelta;
      }

      return Number(rightRule.id || 0) - Number(leftRule.id || 0);
    });
};

export const upsertTransactionImportCategoryRuleForUser = async (userId, payload = {}) => {
  const normalizedUserId = normalizeUserId(userId);
  const categoryId = normalizeCategoryId(payload.categoryId);
  const matchText = normalizeTransactionImportRuleMatchText(payload.matchText);
  const transactionType = normalizeTransactionType(payload.transactionType);
  const normalizedMatchText = normalizeCategoryNameKey(matchText);

  await assertCategoryBelongsToUser(normalizedUserId, categoryId);

  const result = await dbQuery(
    `INSERT INTO transaction_import_category_rules (
       user_id,
       category_id,
       match_text,
       normalized_match_text,
       transaction_type,
       created_at,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (user_id, normalized_match_text, transaction_type)
     DO UPDATE
       SET category_id = EXCLUDED.category_id,
           match_text = EXCLUDED.match_text,
           updated_at = NOW()
     RETURNING id,
               match_text,
               normalized_match_text,
               transaction_type,
               category_id,
               created_at,
               updated_at`,
    [normalizedUserId, categoryId, matchText, normalizedMatchText, transactionType],
  );

  const savedRule = result.rows[0];
  const categoryResult = await dbQuery(
    `SELECT name
       FROM categories
      WHERE id = $1
        AND user_id = $2
      LIMIT 1`,
    [categoryId, normalizedUserId],
  );

  return mapRuleRow({
    ...savedRule,
    category_name: categoryResult.rows[0]?.name || null,
  });
};

export const deleteTransactionImportCategoryRuleForUser = async (userId, ruleId) => {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedRuleId = normalizeRuleId(ruleId);
  const result = await dbQuery(
    `DELETE FROM transaction_import_category_rules
      WHERE id = $1
        AND user_id = $2
      RETURNING id`,
    [normalizedRuleId, normalizedUserId],
  );

  if (!result.rows[0]) {
    throw createError(404, "Regra nao encontrada.");
  }

  return {
    id: normalizedRuleId,
    success: true,
  };
};
