import { dbQuery } from "../db/index.js";
import {
  normalizeCategoryNameKey,
  normalizeCategoryNameValue,
} from "./categories-normalization.js";

const DUPLICATE_CATEGORY_ERROR_CODE = "23505";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeUserId = (value) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw createError(401, "Usuario nao autenticado.");
  }

  return parsedValue;
};

const normalizeCategoryId = (value) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw createError(400, "ID de categoria invalido.");
  }

  return parsedValue;
};

const normalizeCategoryName = (name, options = {}) => {
  const required = options.required !== false;

  if (!required && typeof name === "undefined") {
    return undefined;
  }

  if (typeof name !== "string") {
    throw createError(400, "Nome da categoria e obrigatorio.");
  }

  const normalizedName = normalizeCategoryNameValue(name);

  if (!normalizedName) {
    throw createError(400, "Nome da categoria e obrigatorio.");
  }

  return normalizedName;
};

const toISOStringOrNull = (value) => {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return new Date(value).toISOString();
};

const mapCategory = (row) => ({
  id: Number(row.id),
  userId: row.user_id != null ? Number(row.user_id) : null,
  name: row.name,
  normalizedName: row.normalized_name,
  type: row.type ?? null,
  system: Boolean(row.system),
  deletedAt: toISOStringOrNull(row.deleted_at),
  createdAt: toISOStringOrNull(row.created_at),
});

const isSystemCategory = (row) => Boolean(row.system);

const normalizeIncludeDeleted = (value) => String(value || "").toLowerCase() === "true";

const throwIfUniqueConstraintError = (error) => {
  if (error.code === DUPLICATE_CATEGORY_ERROR_CODE) {
    throw createError(409, "Categoria ja existe.");
  }
};

const normalizeType = (value) => {
  if (typeof value === "undefined") return undefined;
  if (value === "income" || value === "expense") return value;
  return null;
};

export const createCategoryForUser = async (userId, payload = {}) => {
  const normalizedUserId = normalizeUserId(userId);
  const name = normalizeCategoryName(payload.name);
  const normalizedName = normalizeCategoryNameKey(name);
  const type = normalizeType(payload.type);

  try {
    const result = await dbQuery(
      `
        INSERT INTO categories (user_id, name, normalized_name, type)
        VALUES ($1, $2, $3, $4)
        RETURNING id, user_id, name, normalized_name, type, system, deleted_at, created_at
      `,
      [normalizedUserId, name, normalizedName, type ?? null],
    );

    return mapCategory(result.rows[0]);
  } catch (error) {
    throwIfUniqueConstraintError(error);
    throw error;
  }
};

export const listCategoriesByUser = async (userId, options = {}) => {
  const normalizedUserId = normalizeUserId(userId);
  const includeDeleted = normalizeIncludeDeleted(options.includeDeleted);

  const result = await dbQuery(
    `
      SELECT id, user_id, name, normalized_name, type, system, deleted_at, created_at
      FROM categories
      WHERE (user_id = $1 OR user_id IS NULL)
      ${includeDeleted ? "" : "AND deleted_at IS NULL"}
      ORDER BY
        (deleted_at IS NOT NULL) ASC,
        system DESC,
        type ASC NULLS LAST,
        normalized_name ASC,
        id ASC
    `,
    [normalizedUserId],
  );

  return result.rows.map(mapCategory);
};

export const updateCategoryForUser = async (userId, categoryId, payload = {}) => {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedCategoryId = normalizeCategoryId(categoryId);
  const name = normalizeCategoryName(payload.name, { required: true });
  const normalizedName = normalizeCategoryNameKey(name);

  try {
    const result = await dbQuery(
      `
        UPDATE categories
        SET name = $3, normalized_name = $4
        WHERE id = $1
          AND user_id = $2
          AND system IS NOT TRUE
          AND deleted_at IS NULL
        RETURNING id, user_id, name, normalized_name, type, system, deleted_at, created_at
      `,
      [normalizedCategoryId, normalizedUserId, name, normalizedName],
    );

    if (result.rows.length === 0) {
      throw createError(404, "Categoria nao encontrada.");
    }

    return mapCategory(result.rows[0]);
  } catch (error) {
    throwIfUniqueConstraintError(error);
    throw error;
  }
};

export const deleteCategoryForUser = async (userId, categoryId) => {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedCategoryId = normalizeCategoryId(categoryId);

  const result = await dbQuery(
    `
      UPDATE categories
      SET deleted_at = NOW()
      WHERE id = $1
        AND user_id = $2
        AND system IS NOT TRUE
        AND deleted_at IS NULL
      RETURNING id, user_id, name, normalized_name, type, system, deleted_at, created_at
    `,
    [normalizedCategoryId, normalizedUserId],
  );

  if (result.rows.length === 0) {
    throw createError(404, "Categoria nao encontrada.");
  }

  return mapCategory(result.rows[0]);
};

export const restoreCategoryForUser = async (userId, categoryId) => {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedCategoryId = normalizeCategoryId(categoryId);

  try {
    const result = await dbQuery(
      `
        UPDATE categories
        SET deleted_at = NULL
        WHERE id = $1
          AND user_id = $2
          AND system IS NOT TRUE
          AND deleted_at IS NOT NULL
        RETURNING id, user_id, name, normalized_name, type, system, deleted_at, created_at
      `,
      [normalizedCategoryId, normalizedUserId],
    );

    if (result.rows.length === 0) {
      throw createError(404, "Categoria nao encontrada.");
    }

    return mapCategory(result.rows[0]);
  } catch (error) {
    throwIfUniqueConstraintError(error);
    throw error;
  }
};
