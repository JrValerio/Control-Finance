import { dbQuery } from "../db/index.js";
import {
  TRANSACTION_TYPE_ENTRY,
  TRANSACTION_TYPE_EXIT,
} from "../constants/transaction-types.js";

const CATEGORY_ENTRY = TRANSACTION_TYPE_ENTRY;
const CATEGORY_EXIT = TRANSACTION_TYPE_EXIT;
const VALID_TYPES = new Set([CATEGORY_ENTRY, CATEGORY_EXIT]);
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH_REGEX = /^\d{4}-\d{2}$/;
const DEFAULT_PAGE = 1;
const DEFAULT_OFFSET = 0;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const UNCATEGORIZED_CATEGORY_NAME = "Sem categoria";
const MISSING_CATEGORY_NAME = "Categoria nao encontrada";
const PAGINATION_ERROR_MESSAGE = "Paginacao invalida.";
const SUMMARY_COMPARE_PREVIOUS = "prev";
const DEFAULT_TRANSACTIONS_ORDER_BY = "date ASC, id ASC";
const TRANSACTIONS_SORT_FIELD_TO_COLUMN = {
  date: "date",
  amount: "value",
  value: "value",
  description: "description",
  createdat: "created_at",
  created_at: "created_at",
};

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

const isValidISODate = (value) => {
  if (typeof value !== "string" || !ISO_DATE_REGEX.test(value)) {
    return false;
  }

  const parsedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  return toISODate(parsedDate) === value;
};

const normalizeValue = (value) => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw createError(400, "Valor invalido. Informe um numero maior que zero.");
  }

  return Number(parsedValue.toFixed(2));
};

const normalizeType = (type) => {
  if (!VALID_TYPES.has(type)) {
    throw createError(400, "Tipo invalido. Use Entrada ou Saida.");
  }

  return type;
};

const normalizeOptionalType = (type) => {
  if (typeof type === "undefined") {
    return undefined;
  }

  return normalizeType(type);
};

const normalizeDate = (date) => {
  if (typeof date === "undefined" || date === null || date === "") {
    return toISODate();
  }

  if (!isValidISODate(date)) {
    throw createError(400, "Data invalida. Use o formato YYYY-MM-DD.");
  }

  return date;
};

const normalizeOptionalDate = (date) => {
  if (typeof date === "undefined") {
    return undefined;
  }

  if (date === null || date === "") {
    throw createError(400, "Data invalida. Use o formato YYYY-MM-DD.");
  }

  return normalizeDate(date);
};

const normalizeOptionalFilterType = (type) => {
  if (typeof type === "undefined" || type === null || type === "") {
    return undefined;
  }

  return normalizeType(type);
};

const normalizeOptionalFilterDate = (date) => {
  if (typeof date === "undefined" || date === null || date === "") {
    return undefined;
  }

  if (!isValidISODate(date)) {
    throw createError(400, "Data invalida. Use o formato YYYY-MM-DD.");
  }

  return date;
};

const normalizeOptionalSearchQuery = (value) => {
  if (typeof value === "undefined" || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw createError(400, "Busca invalida.");
  }

  const normalizedValue = value.trim();
  return normalizedValue ? normalizedValue : undefined;
};

const normalizeSummaryMonth = (month) => {
  if (typeof month === "undefined" || month === null || month === "") {
    throw createError(400, "Mes e obrigatorio. Use YYYY-MM.");
  }

  if (typeof month !== "string") {
    throw createError(400, "Mes invalido. Use YYYY-MM.");
  }

  const normalizedMonth = month.trim();

  if (!ISO_MONTH_REGEX.test(normalizedMonth)) {
    throw createError(400, "Mes invalido. Use YYYY-MM.");
  }

  const [yearPart, monthPart] = normalizedMonth.split("-");
  const year = Number(yearPart);
  const monthNumber = Number(monthPart);

  if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    throw createError(400, "Mes invalido. Use YYYY-MM.");
  }

  const from = `${yearPart}-${monthPart}-01`;
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const to = `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;

  return {
    month: normalizedMonth,
    from,
    to,
  };
};

const normalizeSummaryCompare = (compare) => {
  if (typeof compare === "undefined" || compare === null) {
    return null;
  }

  const normalizedCompare = String(compare).trim().toLowerCase();

  if (!normalizedCompare) {
    return null;
  }

  if (normalizedCompare !== SUMMARY_COMPARE_PREVIOUS) {
    throw createError(400, "Compare invalido. Use compare=prev.");
  }

  return normalizedCompare;
};

const resolvePreviousSummaryMonth = (month) => {
  const [yearPart, monthPart] = month.split("-");
  const year = Number(yearPart);
  const monthNumber = Number(monthPart);
  const previousYear = monthNumber === 1 ? year - 1 : year;
  const previousMonth = monthNumber === 1 ? 12 : monthNumber - 1;

  return `${String(previousYear).padStart(4, "0")}-${String(previousMonth).padStart(2, "0")}`;
};

const calculateDeltaPercentage = (current, previous) => {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return Number((((current - previous) / previous) * 100).toFixed(2));
};

const toCategoryKey = (item) =>
  item.categoryId === null || item.categoryName === UNCATEGORIZED_CATEGORY_NAME
    ? "uncategorized"
    : String(item.categoryId);

const buildByCategoryDelta = (currentByCategory = [], previousByCategory = []) => {
  const categoryDeltaMap = new Map();

  previousByCategory.forEach((item) => {
    const key = toCategoryKey(item);
    const existing = categoryDeltaMap.get(key);
    if (existing) {
      existing.previous = Number((existing.previous + Number(item.expense || 0)).toFixed(2));
      return;
    }
    categoryDeltaMap.set(key, {
      categoryId: key === "uncategorized" ? null : item.categoryId,
      category: key === "uncategorized" ? UNCATEGORIZED_CATEGORY_NAME : item.categoryName || UNCATEGORIZED_CATEGORY_NAME,
      current: 0,
      previous: Number(item.expense || 0),
    });
  });

  currentByCategory.forEach((item) => {
    const key = toCategoryKey(item);
    const existingItem = categoryDeltaMap.get(key);
    const currentValue = Number(item.expense || 0);

    if (existingItem) {
      existingItem.current = Number((existingItem.current + currentValue).toFixed(2));
      if (key !== "uncategorized") {
        existingItem.category = item.categoryName || existingItem.category;
      }
      return;
    }

    categoryDeltaMap.set(key, {
      categoryId: key === "uncategorized" ? null : item.categoryId,
      category: key === "uncategorized" ? UNCATEGORIZED_CATEGORY_NAME : item.categoryName || UNCATEGORIZED_CATEGORY_NAME,
      current: currentValue,
      previous: 0,
    });
  });

  return Array.from(categoryDeltaMap.values())
    .map((item) => {
      const delta = Number((item.current - item.previous).toFixed(2));

      return {
        categoryId: item.categoryId,
        category: item.category,
        current: item.current,
        previous: item.previous,
        delta,
        deltaPct: calculateDeltaPercentage(item.current, item.previous),
      };
    })
    .sort((left, right) => {
      const deltaDistance = Math.abs(right.delta) - Math.abs(left.delta);

      if (deltaDistance !== 0) {
        return deltaDistance;
      }

      const deltaOrder = right.delta - left.delta;

      if (deltaOrder !== 0) {
        return deltaOrder;
      }

      return left.category.localeCompare(right.category, "pt-BR");
    });
};

const parsePaginationInteger = (value, { fallbackValue, minValue, maxValue }) => {
  if (typeof value === "undefined" || value === null) {
    return fallbackValue;
  }

  const normalizedValue = String(value).trim();

  if (!normalizedValue) {
    throw createError(400, PAGINATION_ERROR_MESSAGE);
  }

  const parsedValue = Number(normalizedValue);

  if (!Number.isInteger(parsedValue) || parsedValue < minValue || parsedValue > maxValue) {
    throw createError(400, PAGINATION_ERROR_MESSAGE);
  }

  return parsedValue;
};

const resolveListPagination = (options = {}) => {
  const limit = parsePaginationInteger(options.limit, {
    fallbackValue: DEFAULT_LIMIT,
    minValue: 1,
    maxValue: MAX_LIMIT,
  });
  const hasOffset =
    !(typeof options.offset === "undefined" || options.offset === null) &&
    String(options.offset).trim() !== "";

  const page = parsePaginationInteger(options.page, {
    fallbackValue: DEFAULT_PAGE,
    minValue: 1,
    maxValue: Number.MAX_SAFE_INTEGER,
  });
  const explicitOffset = parsePaginationInteger(options.offset, {
    fallbackValue: DEFAULT_OFFSET,
    minValue: 0,
    maxValue: Number.MAX_SAFE_INTEGER,
  });
  const offset = hasOffset ? explicitOffset : (page - 1) * limit;

  return {
    limit,
    offset,
    page: hasOffset ? Math.floor(offset / limit) + 1 : page,
  };
};

const normalizeOptionalSort = (value) => {
  if (typeof value === "undefined" || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return null;
  }

  const [rawField, rawDirection, ...remainingParts] = normalizedValue.split(":");

  if (remainingParts.length > 0) {
    return null;
  }

  const normalizedField = String(rawField || "").trim().toLowerCase();
  const normalizedDirection = String(rawDirection || "").trim().toLowerCase();

  if (!normalizedField || !normalizedDirection) {
    return null;
  }

  const column = TRANSACTIONS_SORT_FIELD_TO_COLUMN[normalizedField];
  if (!column) {
    return null;
  }

  if (!["asc", "desc"].includes(normalizedDirection)) {
    return null;
  }

  return {
    column,
    direction: normalizedDirection,
  };
};

const resolveTransactionsOrderByClause = (sortOption) => {
  if (!sortOption) {
    return DEFAULT_TRANSACTIONS_ORDER_BY;
  }

  const direction = sortOption.direction === "desc" ? "DESC" : "ASC";
  return `${sortOption.column} ${direction}, id ${direction}`;
};

const normalizeCategoryId = (value) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw createError(400, "Categoria invalida. Informe um inteiro maior que zero.");
  }

  return parsedValue;
};

const normalizeOptionalFilterCategoryId = (value) => {
  if (typeof value === "undefined" || value === null || value === "") {
    return undefined;
  }

  return normalizeCategoryId(value);
};

const normalizeOptionalPayloadCategoryId = (value) => {
  if (typeof value === "undefined" || value === null) {
    return null;
  }

  return normalizeCategoryId(value);
};

const resolveCategoryIdFromPayload = (payload = {}) => {
  if (Object.prototype.hasOwnProperty.call(payload, "category_id")) {
    return payload.category_id;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "categoryId")) {
    return payload.categoryId;
  }

  return undefined;
};

const ensureCategoryBelongsToUser = async (userId, categoryId) => {
  if (categoryId === null) {
    return null;
  }

  const result = await dbQuery(
    `
      SELECT id
      FROM categories
      WHERE id = $1
        AND user_id = $2
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [categoryId, userId],
  );

  if (result.rows.length === 0) {
    throw createError(404, "Categoria nao encontrada.");
  }

  return categoryId;
};

const normalizeText = (value, fieldName) => {
  if (typeof value !== "string") {
    throw createError(400, `${fieldName} invalido.`);
  }

  return value.trim();
};

const normalizeOptionalText = (value, fieldName) => {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (value === null) {
    return "";
  }

  return normalizeText(value, fieldName);
};

const mapTransaction = (row) => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  categoryId: row.category_id === null ? null : Number(row.category_id),
  value: Number(row.value),
  type: row.type,
  description: row.description || "",
  notes: row.notes || "",
  date:
    typeof row.date === "string"
      ? row.date
      : new Date(row.date).toISOString().slice(0, 10),
  deletedAt: row.deleted_at
    ? typeof row.deleted_at === "string"
      ? row.deleted_at
      : new Date(row.deleted_at).toISOString()
    : null,
  createdAt:
    typeof row.created_at === "string"
      ? row.created_at
      : new Date(row.created_at).toISOString(),
});

const normalizeListFilters = (options = {}) => {
  const includeDeleted =
    options.includeDeleted === true ||
    String(options.includeDeleted || "").toLowerCase() === "true";
  const type = normalizeOptionalFilterType(options.type);
  let from = normalizeOptionalFilterDate(options.from);
  let to = normalizeOptionalFilterDate(options.to);
  const query = normalizeOptionalSearchQuery(options.q);
  const categoryId = normalizeOptionalFilterCategoryId(options.categoryId);
  const sort = normalizeOptionalSort(options.sort);
  const pagination = resolveListPagination(options);

  if (from && to && from > to) {
    [from, to] = [to, from];
  }

  return {
    includeDeleted,
    type,
    from,
    to,
    query,
    categoryId,
    sort,
    page: pagination.page,
    limit: pagination.limit,
    offset: pagination.offset,
  };
};

const buildListTransactionsFilters = (userId, filters) => {
  const conditions = ["user_id = $1"];
  const values = [userId];
  let parameterIndex = 2;

  if (!filters.includeDeleted) {
    conditions.push("deleted_at IS NULL");
  }

  if (filters.type) {
    conditions.push(`type = $${parameterIndex}`);
    values.push(filters.type);
    parameterIndex += 1;
  }

  if (filters.from) {
    conditions.push(`date >= $${parameterIndex}`);
    values.push(filters.from);
    parameterIndex += 1;
  }

  if (filters.to) {
    conditions.push(`date <= $${parameterIndex}`);
    values.push(filters.to);
    parameterIndex += 1;
  }

  if (filters.query) {
    conditions.push(`(description ILIKE $${parameterIndex} OR notes ILIKE $${parameterIndex})`);
    values.push(`%${filters.query}%`);
    parameterIndex += 1;
  }

  if (typeof filters.categoryId !== "undefined") {
    conditions.push(`category_id = $${parameterIndex}`);
    values.push(filters.categoryId);
    parameterIndex += 1;
  }

  return {
    whereClause: conditions.join("\n        AND "),
    values,
    parameterIndex,
  };
};

const runListTransactions = async (
  userId,
  options = {},
  config = { paginate: true },
) => {
  const filters = normalizeListFilters(options);
  const statement = buildListTransactionsFilters(userId, filters);
  const orderByClause = resolveTransactionsOrderByClause(filters.sort);
  const { paginate } = config;
  const listQuerySuffix = paginate
    ? `
      LIMIT $${statement.parameterIndex}
      OFFSET $${statement.parameterIndex + 1}
    `
    : "";
  const queryParams = paginate
    ? [...statement.values, filters.limit, filters.offset]
    : statement.values;

  const result = await dbQuery(
    `
      SELECT id, user_id, category_id, value, type, date, description, notes, deleted_at, created_at
      FROM transactions
      WHERE ${statement.whereClause}
      ORDER BY ${orderByClause}
      ${listQuerySuffix}
    `,
    queryParams,
  );
  const transactions = result.rows.map(mapTransaction);

  let total = transactions.length;

  if (paginate) {
    const countResult = await dbQuery(
      `
        SELECT COUNT(*)::int AS total
        FROM transactions
        WHERE ${statement.whereClause}
      `,
      statement.values,
    );
    total = Number(countResult.rows[0]?.total || 0);
  }

  const totalPages = Math.max(1, Math.ceil(total / filters.limit));

  return {
    filters,
    transactions,
    meta: {
      page: filters.page,
      limit: filters.limit,
      offset: filters.offset,
      total,
      totalPages,
    },
  };
};

const formatCsvCell = (value) => {
  const text = value === null || typeof value === "undefined" ? "" : String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

const formatCurrency = (value) => Number(value).toFixed(2);

const getTotalsByType = (transactions) => {
  return transactions.reduce(
    (totals, transaction) => {
      if (transaction.type === CATEGORY_ENTRY) {
        totals.entry += transaction.value;
      }

      if (transaction.type === CATEGORY_EXIT) {
        totals.exit += transaction.value;
      }

      return totals;
    },
    { entry: 0, exit: 0 },
  );
};

const buildExportFileName = (filters) => {
  const nameParts = ["transacoes"];

  if (filters.type) {
    nameParts.push(filters.type.toLowerCase());
  }

  if (filters.from || filters.to) {
    nameParts.push(filters.from || "inicio");
    nameParts.push("a");
    nameParts.push(filters.to || "hoje");
  } else {
    nameParts.push(toISODate());
  }

  return `${nameParts.join("-")}.csv`;
};

const resolveTransactionsCategoryNames = async (userId, transactions = []) => {
  const categoryIds = [
    ...new Set(
      transactions
        .map((transaction) => transaction.categoryId)
        .filter((categoryId) => Number.isInteger(categoryId) && categoryId > 0),
    ),
  ];

  if (categoryIds.length === 0) {
    return new Map();
  }

  const categoryIdPlaceholders = categoryIds
    .map((_categoryId, index) => `$${index + 2}`)
    .join(", ");
  const categoriesResult = await dbQuery(
    `
      SELECT id, name
      FROM categories
      WHERE user_id = $1
        AND id IN (${categoryIdPlaceholders})
    `,
    [userId, ...categoryIds],
  );

  return new Map(categoriesResult.rows.map((row) => [Number(row.id), row.name || ""]));
};

const resolveCategoryNameForExport = (transaction, categoryNamesById) => {
  if (transaction.categoryId === null) {
    return UNCATEGORIZED_CATEGORY_NAME;
  }

  return categoryNamesById.get(transaction.categoryId) || MISSING_CATEGORY_NAME;
};

export const listTransactionsByUser = async (userId, options = {}) => {
  const { transactions, meta } = await runListTransactions(userId, options);
  return {
    data: transactions,
    meta,
  };
};

export const exportTransactionsCsvByUser = async (userId, options = {}) => {
  const { filters, transactions } = await runListTransactions(userId, options, {
    paginate: false,
  });
  const categoryNamesById = await resolveTransactionsCategoryNames(userId, transactions);
  const totalsByType = getTotalsByType(transactions);
  const balance = totalsByType.entry - totalsByType.exit;
  const csvLines = [
    "id,type,value,date,description,notes,category_name,created_at",
    ...transactions.map((transaction) =>
      [
        transaction.id,
        transaction.type,
        formatCurrency(transaction.value),
        transaction.date,
        transaction.description,
        transaction.notes,
        resolveCategoryNameForExport(transaction, categoryNamesById),
        transaction.createdAt,
      ]
        .map(formatCsvCell)
        .join(","),
    ),
    "",
    "summary,total_entradas,total_saidas,saldo",
    ["totals", formatCurrency(totalsByType.entry), formatCurrency(totalsByType.exit), formatCurrency(balance)]
      .map(formatCsvCell)
      .join(","),
  ];

  return {
    fileName: buildExportFileName(filters),
    content: `\uFEFF${csvLines.join("\n")}`,
  };
};

const getMonthlySummaryForRange = async (userId, monthRange) => {
  const totalsResult = await dbQuery(
    `
      SELECT
        COALESCE(SUM(CASE WHEN type = '${CATEGORY_ENTRY}' THEN value ELSE 0 END), 0)::numeric AS income,
        COALESCE(SUM(CASE WHEN type = '${CATEGORY_EXIT}' THEN value ELSE 0 END), 0)::numeric AS expense
      FROM transactions
      WHERE user_id = $1
        AND deleted_at IS NULL
        AND date >= $2
        AND date < $3
    `,
    [userId, monthRange.from, monthRange.to],
  );
  const income = Number(totalsResult.rows[0]?.income || 0);
  const expense = Number(totalsResult.rows[0]?.expense || 0);

  const byCategoryResult = await dbQuery(
    `
      SELECT
        t.category_id,
        MIN(c.name) AS category_name,
        COALESCE(SUM(t.value), 0)::numeric AS expense
      FROM transactions t
      LEFT JOIN categories c
        ON c.id = t.category_id
       AND c.user_id = $1
      WHERE t.user_id = $1
        AND t.deleted_at IS NULL
        AND t.type = $4
        AND t.date >= $2
        AND t.date < $3
      GROUP BY t.category_id
      ORDER BY
        (t.category_id IS NULL) ASC,
        expense DESC,
        LOWER(COALESCE(MIN(c.name), '')) ASC,
        t.category_id ASC
    `,
    [userId, monthRange.from, monthRange.to, CATEGORY_EXIT],
  );

  // Consolidate orphaned category_ids (deleted categories whose name resolved to NULL)
  // into the single "Sem categoria" bucket so the UI never shows duplicates.
  const byCategoryMap = new Map();
  for (const row of byCategoryResult.rows) {
    const name = row.category_name || UNCATEGORIZED_CATEGORY_NAME;
    const key =
      row.category_id === null || name === UNCATEGORIZED_CATEGORY_NAME
        ? "uncategorized"
        : String(row.category_id);
    const existing = byCategoryMap.get(key);
    if (existing) {
      existing.expense = Number((existing.expense + Number(row.expense)).toFixed(2));
    } else {
      byCategoryMap.set(key, {
        categoryId: key === "uncategorized" ? null : Number(row.category_id),
        categoryName: key === "uncategorized" ? UNCATEGORIZED_CATEGORY_NAME : name,
        expense: Number(row.expense),
      });
    }
  }

  return {
    month: monthRange.month,
    income,
    expense,
    balance: income - expense,
    byCategory: Array.from(byCategoryMap.values()),
  };
};

export const getMonthlySummaryForUser = async (userId, month, compare) => {
  const normalizedMonth = normalizeSummaryMonth(month);
  const normalizedCompare = normalizeSummaryCompare(compare);
  const currentSummary = await getMonthlySummaryForRange(userId, normalizedMonth);

  if (normalizedCompare !== SUMMARY_COMPARE_PREVIOUS) {
    return currentSummary;
  }

  const previousMonth = resolvePreviousSummaryMonth(normalizedMonth.month);
  const previousMonthRange = normalizeSummaryMonth(previousMonth);
  const previousSummary = await getMonthlySummaryForRange(userId, previousMonthRange);

  return {
    current: {
      income: currentSummary.income,
      expense: currentSummary.expense,
      balance: currentSummary.balance,
    },
    previous: {
      income: previousSummary.income,
      expense: previousSummary.expense,
      balance: previousSummary.balance,
    },
    delta: {
      income: Number((currentSummary.income - previousSummary.income).toFixed(2)),
      expense: Number((currentSummary.expense - previousSummary.expense).toFixed(2)),
      balance: Number((currentSummary.balance - previousSummary.balance).toFixed(2)),
      incomePct: calculateDeltaPercentage(currentSummary.income, previousSummary.income),
      expensePct: calculateDeltaPercentage(currentSummary.expense, previousSummary.expense),
      balancePct: calculateDeltaPercentage(currentSummary.balance, previousSummary.balance),
    },
    byCategoryDelta: buildByCategoryDelta(currentSummary.byCategory, previousSummary.byCategory),
  };
};

export const createTransactionForUser = async (userId, payload = {}) => {
  const normalizedDescription =
    normalizeOptionalText(payload.description, "Descricao") ?? "";
  const normalizedNotes = normalizeOptionalText(payload.notes, "Observacoes") ?? "";
  const normalizedCategoryId = await ensureCategoryBelongsToUser(
    userId,
    normalizeOptionalPayloadCategoryId(resolveCategoryIdFromPayload(payload)),
  );

  const result = await dbQuery(
    `
      INSERT INTO transactions (user_id, type, value, date, description, notes, category_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, user_id, category_id, value, type, date, description, notes, deleted_at, created_at
    `,
    [
      userId,
      normalizeType(payload.type),
      normalizeValue(payload.value),
      normalizeDate(payload.date),
      normalizedDescription,
      normalizedNotes,
      normalizedCategoryId,
    ],
  );

  return mapTransaction(result.rows[0]);
};

export const updateTransactionForUser = async (userId, transactionId, payload = {}) => {
  const id = Number(transactionId);

  if (!Number.isInteger(id) || id <= 0) {
    throw createError(400, "ID de transacao invalido.");
  }

  const nextType = normalizeOptionalType(payload.type);
  const nextValue =
    typeof payload.value === "undefined" ? undefined : normalizeValue(payload.value);
  const nextDate = normalizeOptionalDate(payload.date);
  const nextDescription = normalizeOptionalText(payload.description, "Descricao");
  const nextNotes = normalizeOptionalText(payload.notes, "Observacoes");
  const categoryIdFromPayload = resolveCategoryIdFromPayload(payload);
  const hasCategoryIdInPayload = typeof categoryIdFromPayload !== "undefined";
  const nextCategoryId = hasCategoryIdInPayload
    ? await ensureCategoryBelongsToUser(
        userId,
        normalizeOptionalPayloadCategoryId(categoryIdFromPayload),
      )
    : undefined;

  const fieldsToUpdate = [];
  const queryParams = [];
  let parameterIndex = 1;

  if (typeof nextType !== "undefined") {
    fieldsToUpdate.push(`type = $${parameterIndex}`);
    queryParams.push(nextType);
    parameterIndex += 1;
  }

  if (typeof nextValue !== "undefined") {
    fieldsToUpdate.push(`value = $${parameterIndex}`);
    queryParams.push(nextValue);
    parameterIndex += 1;
  }

  if (typeof nextDate !== "undefined") {
    fieldsToUpdate.push(`date = $${parameterIndex}`);
    queryParams.push(nextDate);
    parameterIndex += 1;
  }

  if (typeof nextDescription !== "undefined") {
    fieldsToUpdate.push(`description = $${parameterIndex}`);
    queryParams.push(nextDescription);
    parameterIndex += 1;
  }

  if (typeof nextNotes !== "undefined") {
    fieldsToUpdate.push(`notes = $${parameterIndex}`);
    queryParams.push(nextNotes);
    parameterIndex += 1;
  }

  if (typeof nextCategoryId !== "undefined") {
    fieldsToUpdate.push(`category_id = $${parameterIndex}`);
    queryParams.push(nextCategoryId);
    parameterIndex += 1;
  }

  if (fieldsToUpdate.length === 0) {
    throw createError(400, "Informe ao menos um campo para atualizar.");
  }

  queryParams.push(id, userId);

  const result = await dbQuery(
    `
      UPDATE transactions
      SET ${fieldsToUpdate.join(", ")}
      WHERE id = $${parameterIndex}
        AND user_id = $${parameterIndex + 1}
        AND deleted_at IS NULL
      RETURNING id, user_id, category_id, value, type, date, description, notes, deleted_at, created_at
    `,
    queryParams,
  );

  if (result.rows.length === 0) {
    throw createError(404, "Transacao nao encontrada.");
  }

  return mapTransaction(result.rows[0]);
};

export const deleteTransactionForUser = async (userId, transactionId) => {
  const id = Number(transactionId);

  if (!Number.isInteger(id) || id <= 0) {
    throw createError(400, "ID de transacao invalido.");
  }

  const result = await dbQuery(
    `
      UPDATE transactions
      SET deleted_at = NOW()
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      RETURNING id, user_id, category_id, value, type, date, description, notes, deleted_at, created_at
    `,
    [id, userId],
  );

  if (result.rows.length === 0) {
    throw createError(404, "Transacao nao encontrada.");
  }

  return mapTransaction(result.rows[0]);
};

export const restoreTransactionForUser = async (userId, transactionId) => {
  const id = Number(transactionId);

  if (!Number.isInteger(id) || id <= 0) {
    throw createError(400, "ID de transacao invalido.");
  }

  const result = await dbQuery(
    `
      UPDATE transactions
      SET deleted_at = NULL
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL
      RETURNING id, user_id, category_id, value, type, date, description, notes, deleted_at, created_at
    `,
    [id, userId],
  );

  if (result.rows.length === 0) {
    throw createError(404, "Transacao nao encontrada.");
  }

  return mapTransaction(result.rows[0]);
};
