import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { parse as parseCsv } from "csv-parse/sync";
import { dbQuery, withDbTransaction } from "../db/index.js";
import {
  TRANSACTION_TYPE_ENTRY,
  TRANSACTION_TYPE_EXIT,
} from "../constants/transaction-types.js";
import {
  parseOfxRows,
} from "../domain/imports/ofx-import.js";
import {
  extractTextFromPdfBuffer,
  getPdfImportGuidanceError,
  parseInssCreditHistoryPdfText,
  parseGenericBankStatementPdfText,
  parseStatementCsvRows,
  extractInssSuggestion,
  extractEnergyBillSuggestion,
  extractWaterBillSuggestion,
} from "../domain/imports/statement-import.js";
import { detectDocumentType } from "../domain/imports/document-classifier.js";
import { applySmartClassification } from "../domain/imports/transaction-classifier.js";
import { normalizeCategoryNameKey } from "./categories-normalization.js";

const CATEGORY_ENTRY = TRANSACTION_TYPE_ENTRY;
const CATEGORY_EXIT = TRANSACTION_TYPE_EXIT;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMPORT_TTL_MINUTES = 30;
const DEFAULT_IMPORT_CSV_MAX_ROWS = 2000;
const DEFAULT_IMPORT_HISTORY_LIMIT = 20;
const MAX_IMPORT_HISTORY_LIMIT = 100;
const REQUIRED_HEADERS = ["date", "type", "value", "description"];
const OPTIONAL_HEADERS = ["notes", "category"];
const ALLOWED_HEADERS = new Set([...REQUIRED_HEADERS, ...OPTIONAL_HEADERS]);
const HEADER_ERROR_MESSAGE =
  "CSV invalido. Cabecalho esperado: date,type,value,description,notes,category";
const IMPORT_FORMAT_ERROR_MESSAGE =
  "Arquivo nao reconhecido. Envie um CSV manual com cabecalho date,type,value,description,notes,category ou um CSV, OFX ou PDF de extrato.";

const extractFitId = (notes) => {
  const match = String(notes || "").match(/^FITID\s+(\S+)/);
  return match ? match[1] : null;
};

const generateImportFingerprint = (normalizedRow) => {
  const fitId = extractFitId(normalizedRow.notes);
  const key = fitId
    ? `fitid|${fitId}`
    : [
        normalizedRow.date,
        normalizedRow.type,
        String(normalizedRow.value),
        String(normalizedRow.description || "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim(),
      ].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
};

const loadExistingFingerprints = async (userId, fingerprints) => {
  if (fingerprints.length === 0) return new Set();
  const result = await dbQuery(
    `SELECT import_fingerprint FROM transactions
     WHERE user_id = $1 AND deleted_at IS NULL AND import_fingerprint = ANY($2)`,
    [userId, fingerprints],
  );
  return new Set(result.rows.map((row) => row.import_fingerprint));
};

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeHeader = (value) => String(value || "").trim().toLowerCase();

const normalizeRawCell = (value) =>
  typeof value === "undefined" || value === null ? "" : String(value);

const parsePositiveInteger = (value, fallbackValue) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return fallbackValue;
  }

  return parsedValue;
};

const getImportCsvMaxRows = () =>
  parsePositiveInteger(process.env.IMPORT_CSV_MAX_ROWS, DEFAULT_IMPORT_CSV_MAX_ROWS);

const parsePaginationInteger = (value, { fallbackValue, min, max }) => {
  if (typeof value === "undefined" || value === null) {
    return fallbackValue;
  }

  const normalizedValue = String(value).trim();

  if (!normalizedValue) {
    throw createError(400, "Paginacao invalida.");
  }

  const parsedValue = Number(normalizedValue);

  if (!Number.isInteger(parsedValue) || parsedValue < min || parsedValue > max) {
    throw createError(400, "Paginacao invalida.");
  }

  return parsedValue;
};

const normalizeImportHistoryPagination = (filters = {}) => {
  const limit = parsePaginationInteger(filters.limit, {
    fallbackValue: DEFAULT_IMPORT_HISTORY_LIMIT,
    min: 1,
    max: MAX_IMPORT_HISTORY_LIMIT,
  });
  const offset = parsePaginationInteger(filters.offset, {
    fallbackValue: 0,
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
  });

  return {
    limit,
    offset,
  };
};

const normalizeSummaryNumber = (value, fallbackValue = 0) => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return fallbackValue;
  }

  return Number(parsedValue.toFixed(2));
};

const normalizeSummaryInteger = (value, fallbackValue = 0) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    return fallbackValue;
  }

  return parsedValue;
};

const toIsoDateString = (value) => {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString();
};

const parsePayloadJson = (payloadJson) => {
  if (!payloadJson) {
    return {};
  }

  if (typeof payloadJson === "string") {
    try {
      return JSON.parse(payloadJson);
    } catch {
      return {};
    }
  }

  if (typeof payloadJson === "object") {
    return payloadJson;
  }

  return {};
};

const ensureValidCsvHeaders = (headerRow) => {
  const normalizedHeaders = headerRow.map(normalizeHeader);
  const uniqueHeaders = new Set(normalizedHeaders);

  if (
    normalizedHeaders.length === 0 ||
    uniqueHeaders.size !== normalizedHeaders.length ||
    normalizedHeaders.some((header) => !header || !ALLOWED_HEADERS.has(header))
  ) {
    throw createError(400, HEADER_ERROR_MESSAGE);
  }

  const missingRequiredHeader = REQUIRED_HEADERS.some(
    (requiredHeader) => !uniqueHeaders.has(requiredHeader),
  );

  if (missingRequiredHeader) {
    throw createError(400, HEADER_ERROR_MESSAGE);
  }

  return normalizedHeaders;
};

const buildRawRow = (sourceRow = {}) => ({
  date: normalizeRawCell(sourceRow.date),
  type: normalizeRawCell(sourceRow.type),
  value: normalizeRawCell(sourceRow.value),
  description: normalizeRawCell(sourceRow.description),
  notes: normalizeRawCell(sourceRow.notes),
  category: normalizeRawCell(sourceRow.category),
});

const parseCsvFileRows = (fileBuffer) => {
  const csvContent = fileBuffer.toString("utf8");

  let parsedRows;

  try {
    parsedRows = parseCsv(csvContent, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
    });
  } catch {
    throw createError(400, "CSV invalido. Nao foi possivel processar o arquivo.");
  }

  if (!Array.isArray(parsedRows) || parsedRows.length === 0) {
    throw createError(400, HEADER_ERROR_MESSAGE);
  }

  const [headerRow, ...dataRows] = parsedRows;

  if (!Array.isArray(headerRow) || headerRow.length === 0) {
    throw createError(400, HEADER_ERROR_MESSAGE);
  }

  const normalizedHeaders = ensureValidCsvHeaders(headerRow);
  const maxRows = getImportCsvMaxRows();

  if (dataRows.length > maxRows) {
    throw createError(400, `CSV excede o limite de ${maxRows} linhas.`);
  }

  return dataRows.map((rowValues, rowIndex) => {
    const sourceValues = Array.isArray(rowValues) ? rowValues : [rowValues];
    const rowObject = {};

    normalizedHeaders.forEach((header, headerIndex) => {
      rowObject[header] = normalizeRawCell(sourceValues[headerIndex]);
    });

    return {
      line: rowIndex + 2,
      raw: buildRawRow(rowObject),
    };
  });
};

const parseImportFileRows = async (importFile) => {
  const fileBuffer = importFile?.buffer;
  const extension = path.extname(String(importFile?.originalname || "")).toLowerCase();

  if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
    throw createError(400, "Arquivo do extrato (file) e obrigatorio.");
  }

  if (extension === ".pdf") {
    let text;
    try {
      text = await extractTextFromPdfBuffer(fileBuffer);
    } catch (error) {
      throw createError(400, error.message || "Nao foi possivel reconhecer transacoes no PDF.");
    }

    const guidanceError = getPdfImportGuidanceError(text);
    if (guidanceError) {
      throw createError(400, guidanceError);
    }

    const documentType = detectDocumentType({ text, extension });

    if (documentType === "income_statement_inss") {
      try {
        const rows = parseInssCreditHistoryPdfText(text);
        const suggestion = extractInssSuggestion(text);
        return { rows, documentType, suggestion };
      } catch (error) {
        throw createError(400, error.message || "Nao foi possivel reconhecer transacoes no PDF.");
      }
    }

    if (documentType === "utility_bill_energy") {
      const suggestion = extractEnergyBillSuggestion(text);
      return { rows: [], documentType, suggestion };
    }

    if (documentType === "utility_bill_water") {
      const suggestion = extractWaterBillSuggestion(text);
      return { rows: [], documentType, suggestion };
    }

    try {
      const rows = parseGenericBankStatementPdfText(text);
      return { rows, documentType, suggestion: null };
    } catch (error) {
      throw createError(400, error.message || "Nao foi possivel reconhecer transacoes no PDF.");
    }
  }

  if (extension === ".ofx") {
    const documentType = detectDocumentType({ text: "", extension });
    try {
      const rows = parseOfxRows(fileBuffer);
      return { rows, documentType, suggestion: null };
    } catch (error) {
      throw createError(400, error.message || "Nao foi possivel reconhecer transacoes no OFX.");
    }
  }

  try {
    const rows = parseCsvFileRows(fileBuffer);
    const documentType = detectDocumentType({ text: "", extension: ".csv" });
    return { rows, documentType, suggestion: null };
  } catch (error) {
    if (error?.message !== HEADER_ERROR_MESSAGE) {
      throw error;
    }
  }

  try {
    const rows = parseStatementCsvRows(fileBuffer);
    const documentType = detectDocumentType({ text: "", extension: ".csv" });
    return { rows, documentType, suggestion: null };
  } catch (error) {
    if (
      error?.message === `Arquivo excede o limite de ${getImportCsvMaxRows()} linhas.`
    ) {
      throw createError(400, error.message);
    }

    throw createError(400, IMPORT_FORMAT_ERROR_MESSAGE);
  }
};

const normalizeDate = (value) => {
  const normalizedValue = String(value || "").trim();

  if (!ISO_DATE_REGEX.test(normalizedValue)) {
    throw new Error("Data invalida. Use YYYY-MM-DD.");
  }

  const parsedDate = new Date(`${normalizedValue}T00:00:00`);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== normalizedValue
  ) {
    throw new Error("Data invalida. Use YYYY-MM-DD.");
  }

  return normalizedValue;
};

const normalizeType = (value) => {
  const normalizedValue = String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalizedValue === "entrada") {
    return CATEGORY_ENTRY;
  }

  if (normalizedValue === "saida") {
    return CATEGORY_EXIT;
  }

  throw new Error("Tipo invalido. Use Entrada ou Saida.");
};

const normalizeValue = (value) => {
  const compactValue = String(value || "").trim().replace(/\s+/g, "");

  if (!compactValue) {
    throw new Error("Valor invalido. Informe um numero maior que zero.");
  }

  const hasComma = compactValue.includes(",");
  const hasDot = compactValue.includes(".");
  let normalizedNumericValue = compactValue;

  if (hasComma && hasDot) {
    const decimalSeparator =
      compactValue.lastIndexOf(",") > compactValue.lastIndexOf(".") ? "," : ".";

    normalizedNumericValue =
      decimalSeparator === ","
        ? compactValue.replace(/\./g, "").replace(",", ".")
        : compactValue.replace(/,/g, "");
  } else if (hasComma) {
    normalizedNumericValue = compactValue.replace(",", ".");
  }

  const parsedValue = Number(normalizedNumericValue);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new Error("Valor invalido. Informe um numero maior que zero.");
  }

  return Number(parsedValue.toFixed(2));
};

const normalizeDescription = (value) => {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    throw new Error("Descricao e obrigatoria.");
  }

  return normalizedValue;
};

const normalizeNotes = (value) => String(value || "").trim();

const resolveCategoryId = (value, categoryMap) => {
  const normalizedCategoryName = String(value || "").trim();

  if (!normalizedCategoryName) {
    return null;
  }

  const normalizedCategoryKey = normalizeCategoryNameKey(normalizedCategoryName);
  const categoryId = categoryMap.get(normalizedCategoryKey);

  if (!categoryId) {
    throw new Error("Categoria nao encontrada.");
  }

  return categoryId;
};

const loadCategoryMapForUser = async (userId) => {
  const result = await dbQuery(
    `
      SELECT id, name, normalized_name
      FROM categories
      WHERE user_id = $1
        AND deleted_at IS NULL
    `,
    [userId],
  );

  return result.rows.reduce((categoryMap, row) => {
    categoryMap.set(normalizeCategoryNameKey(row.normalized_name), Number(row.id));
    return categoryMap;
  }, new Map());
};

const loadCategoriesForUser = async (userId) => {
  const result = await dbQuery(
    `
      SELECT id, name, normalized_name
      FROM categories
      WHERE user_id = $1
        AND deleted_at IS NULL
    `,
    [userId],
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    normalizedName: row.normalized_name,
  }));
};

const normalizeCsvRow = (rawRow, categoryMap) => {
  const errors = [];
  let normalizedDate;
  let normalizedType;
  let normalizedValue;
  let normalizedDescription;
  let normalizedCategoryId;

  try {
    normalizedDate = normalizeDate(rawRow.date);
  } catch (error) {
    errors.push({ field: "date", message: error.message });
  }

  try {
    normalizedType = normalizeType(rawRow.type);
  } catch (error) {
    errors.push({ field: "type", message: error.message });
  }

  try {
    normalizedValue = normalizeValue(rawRow.value);
  } catch (error) {
    errors.push({ field: "value", message: error.message });
  }

  try {
    normalizedDescription = normalizeDescription(rawRow.description);
  } catch (error) {
    errors.push({ field: "description", message: error.message });
  }

  try {
    normalizedCategoryId = resolveCategoryId(rawRow.category, categoryMap);
  } catch (error) {
    errors.push({ field: "category", message: error.message });
  }

  if (errors.length > 0) {
    return {
      status: "invalid",
      normalized: null,
      errors,
    };
  }

  return {
    status: "valid",
    normalized: {
      date: normalizedDate,
      type: normalizedType,
      value: normalizedValue,
      description: normalizedDescription,
      notes: normalizeNotes(rawRow.notes),
      categoryId: normalizedCategoryId,
    },
    errors: [],
  };
};

const createSummary = (rows = []) => {
  return rows.reduce(
    (summary, row) => {
      if (row.status === "valid") {
        summary.validRows += 1;

        if (row.normalized.type === CATEGORY_ENTRY) {
          summary.income += row.normalized.value;
        } else if (row.normalized.type === CATEGORY_EXIT) {
          summary.expense += row.normalized.value;
        }
      } else if (row.status === "duplicate") {
        summary.duplicateRows += 1;
      } else {
        summary.invalidRows += 1;
      }

      return summary;
    },
    {
      totalRows: rows.length,
      validRows: 0,
      invalidRows: 0,
      duplicateRows: 0,
      income: 0,
      expense: 0,
    },
  );
};

const persistImportSession = async (userId, payload) => {
  const importId = randomUUID();
  const expiresAtDate = new Date(Date.now() + IMPORT_TTL_MINUTES * 60 * 1000);
  const result = await dbQuery(
    `
      INSERT INTO transaction_import_sessions (id, user_id, payload_json, expires_at)
      VALUES ($1, $2, $3::jsonb, $4)
      RETURNING expires_at
    `,
    [importId, userId, JSON.stringify(payload), expiresAtDate.toISOString()],
  );

  return {
    importId,
    expiresAt:
      typeof result.rows[0]?.expires_at === "string"
        ? result.rows[0].expires_at
        : new Date(result.rows[0]?.expires_at || expiresAtDate).toISOString(),
  };
};

const normalizeImportId = (value) => {
  if (typeof value === "undefined" || value === null || value === "") {
    throw createError(400, "importId e obrigatorio.");
  }

  if (typeof value !== "string") {
    throw createError(400, "importId invalido.");
  }

  const normalizedValue = value.trim();

  if (!UUID_REGEX.test(normalizedValue)) {
    throw createError(400, "importId invalido.");
  }

  return normalizedValue;
};

const loadImportSessionById = async (importId) => {
  const result = await dbQuery(
    `
      SELECT id, user_id, payload_json, expires_at, committed_at
      FROM transaction_import_sessions
      WHERE id = $1
      LIMIT 1
    `,
    [importId],
  );

  return result.rows[0] || null;
};

const assertSessionOwnership = (session, userId) => {
  if (!session || Number(session.user_id) !== Number(userId)) {
    throw createError(404, "Sessao de importacao nao encontrada.");
  }
};

const isSessionExpired = (session) => {
  const expiresAt = new Date(session.expires_at);

  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= Date.now();
};

const assertSessionReadyForCommit = (session, userId) => {
  assertSessionOwnership(session, userId);

  if (session.committed_at) {
    throw createError(409, "Importacao ja confirmada.");
  }

  if (isSessionExpired(session)) {
    throw createError(410, "Sessao de importacao expirada.");
  }
};

export const dryRunTransactionsImportForUser = async (userId, importFile) => {
  const { rows: parsedRows, documentType, suggestion } = await parseImportFileRows(importFile);
  const [categoryMap, categories] = await Promise.all([
    loadCategoryMapForUser(userId),
    loadCategoriesForUser(userId),
  ]);
  const classifiedRows = applySmartClassification(parsedRows, categories);
  const validatedRows = classifiedRows.map((row) => {
    const normalizedRow = normalizeCsvRow(row.raw, categoryMap);
    return {
      line: row.line,
      status: normalizedRow.status,
      raw: row.raw,
      normalized: normalizedRow.normalized,
      errors: normalizedRow.errors,
    };
  });

  // Deduplicate: compute fingerprints for valid rows, check against existing transactions
  const validOnly = validatedRows.filter((r) => r.status === "valid" && r.normalized);
  const fingerprintMap = new Map(
    validOnly.map((r) => [r.line, generateImportFingerprint(r.normalized)]),
  );
  const existingSet = await loadExistingFingerprints(userId, [...fingerprintMap.values()]);

  const rows = validatedRows.map((row) => {
    if (row.status !== "valid" || !row.normalized) return row;
    const fp = fingerprintMap.get(row.line);
    if (existingSet.has(fp)) {
      return { ...row, status: "duplicate", fingerprint: fp, normalized: null };
    }
    return { ...row, fingerprint: fp };
  });

  const summary = createSummary(rows);

  const normalizedRows = rows
    .filter((row) => row.status === "valid" && row.normalized)
    .map((row) => ({ ...row.normalized, fingerprint: row.fingerprint }));

  const persistedSession = await persistImportSession(userId, {
    normalizedRows,
    summary,
  });

  return {
    importId: persistedSession.importId,
    expiresAt: persistedSession.expiresAt,
    documentType,
    suggestion: suggestion || null,
    summary,
    rows,
  };
};

export const listTransactionsImportSessionsByUser = async (userId, filters = {}) => {
  const pagination = normalizeImportHistoryPagination(filters);
  const result = await dbQuery(
    `
      SELECT id, created_at, expires_at, committed_at, payload_json
      FROM transaction_import_sessions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `,
    [userId, pagination.limit, pagination.offset],
  );

  const items = result.rows.map((row) => {
    const payload = parsePayloadJson(row.payload_json);
    const summary = payload.summary || {};
    const validRows = normalizeSummaryInteger(summary.validRows, 0);
    const imported = row.committed_at ? validRows : 0;

    return {
      id: String(row.id),
      createdAt: toIsoDateString(row.created_at),
      expiresAt: toIsoDateString(row.expires_at),
      committedAt: toIsoDateString(row.committed_at),
      summary: {
        totalRows: normalizeSummaryInteger(summary.totalRows, 0),
        validRows,
        invalidRows: normalizeSummaryInteger(summary.invalidRows, 0),
        income: normalizeSummaryNumber(summary.income, 0),
        expense: normalizeSummaryNumber(summary.expense, 0),
        imported,
      },
    };
  });

  return {
    items,
    pagination,
  };
};

export const getTransactionsImportMetricsByUser = async (userId) => {
  const result = await dbQuery(
    `
      SELECT
        COUNT(*)::int AS total,
        COALESCE(
          SUM(
            CASE
              WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1
              ELSE 0
            END
          ),
          0
        )::int AS last30_days,
        MAX(created_at) AS last_import_at
      FROM transaction_import_sessions
      WHERE user_id = $1
    `,
    [userId],
  );

  const row = result.rows[0] || {};

  return {
    total: normalizeSummaryInteger(row.total, 0),
    last30Days: normalizeSummaryInteger(row.last30_days, 0),
    lastImportAt: toIsoDateString(row.last_import_at),
  };
};

export const commitTransactionsImportForUser = async (userId, importId) => {
  const normalizedImportId = normalizeImportId(importId);
  const importSession = await loadImportSessionById(normalizedImportId);

  assertSessionReadyForCommit(importSession, userId);

  const payload =
    typeof importSession.payload_json === "string"
      ? JSON.parse(importSession.payload_json)
      : importSession.payload_json || {};
  const normalizedRows = Array.isArray(payload.normalizedRows)
    ? payload.normalizedRows
    : [];
  const payloadSummary = payload.summary || {};
  const observabilitySummary = {
    totalRows: normalizeSummaryInteger(payloadSummary.totalRows, normalizedRows.length),
    validRows: normalizeSummaryInteger(payloadSummary.validRows, normalizedRows.length),
    invalidRows: normalizeSummaryInteger(payloadSummary.invalidRows, 0),
  };

  const commitOutcome = await withDbTransaction(async (transactionClient) => {
    const sessionUpdateResult = await transactionClient.query(
      `
        UPDATE transaction_import_sessions
        SET committed_at = NOW()
        WHERE id = $1
          AND user_id = $2
          AND committed_at IS NULL
          AND expires_at > NOW()
        RETURNING id
      `,
      [normalizedImportId, userId],
    );

    const updatedSessions = Number(sessionUpdateResult.rowCount || 0);

    if (updatedSessions === 0) {
      const refreshedSession = await loadImportSessionById(normalizedImportId);
      assertSessionReadyForCommit(refreshedSession, userId);
      throw createError(409, "Importacao ja confirmada.");
    }

    if (normalizedRows.length === 0) {
      return {
        imported: 0,
        income: 0,
        expense: 0,
      };
    }

    const insertValuesPlaceholders = normalizedRows
      .map((_, rowIndex) => {
        const startParameter = rowIndex * 7 + 2;
        return `($1, $${startParameter}, $${startParameter + 1}, $${startParameter + 2}::date, $${startParameter + 3}, $${startParameter + 4}, $${startParameter + 5}, $${startParameter + 6})`;
      })
      .join(", ");

    const insertParams = [userId];

    normalizedRows.forEach((row) => {
      insertParams.push(
        row.type,
        row.value,
        row.date,
        row.description,
        row.notes || "",
        row.categoryId,
        row.fingerprint || null,
      );
    });

    const insertResult = await transactionClient.query(
      `
        INSERT INTO transactions (user_id, type, value, date, description, notes, category_id, import_fingerprint)
        VALUES ${insertValuesPlaceholders}
        RETURNING type, value
      `,
      insertParams,
    );

    const imported = Number(insertResult.rowCount || 0);
    const income = insertResult.rows.reduce((total, insertedRow) => {
      if (insertedRow.type !== CATEGORY_ENTRY) {
        return total;
      }

      return total + Number(insertedRow.value || 0);
    }, 0);
    const expense = insertResult.rows.reduce((total, insertedRow) => {
      if (insertedRow.type !== CATEGORY_EXIT) {
        return total;
      }

      return total + Number(insertedRow.value || 0);
    }, 0);

    return {
      imported,
      income,
      expense,
    };
  });

  return {
    imported: commitOutcome.imported,
    summary: {
      income: commitOutcome.income,
      expense: commitOutcome.expense,
      balance: commitOutcome.income - commitOutcome.expense,
    },
    observability: {
      importId: normalizedImportId,
      totalRows: observabilitySummary.totalRows,
      validRows: observabilitySummary.validRows,
      invalidRows: observabilitySummary.invalidRows,
    },
  };
};
