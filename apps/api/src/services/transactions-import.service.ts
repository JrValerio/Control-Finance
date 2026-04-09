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
import { parseItauInvoiceTransactions } from "../domain/imports/itau-invoice.parser.js";
import { parseNubankInvoiceTransactions } from "../domain/imports/nubank-invoice.parser.js";
import {
  extractTextFromPdfBuffer,
  getPdfImportGuidanceError,
  parseInssCreditHistoryPdfText,
  parseGenericBankStatementPdfText,
  parseStatementCsvRows,
  extractInssSuggestions,
  extractPayrollSuggestion,
  extractEnergyBillSuggestion,
  extractWaterBillSuggestion,
  extractGasBillSuggestion,
  extractTelecomBillSuggestion,
} from "../domain/imports/statement-import.js";
import { detectDocumentType } from "../domain/imports/document-classifier.js";
import { applyTransactionImportCategoryRules } from "../domain/imports/transaction-import-rules.js";
import { applySmartClassification } from "../domain/imports/transaction-classifier.js";
import { normalizeCategoryNameKey } from "./categories-normalization.js";
import { loadActiveTransactionImportCategoryRulesByUser } from "./transactions-import-rules.service.js";

type ErrorWithStatus = Error & { status: number; publicCode?: string };

type RawCsvRow = {
  date: string;
  type: string;
  value: string;
  description: string;
  notes: string;
  category: string;
};

type NormalizedImportRow = {
  date: string;
  type: string;
  value: number;
  description: string;
  notes: string;
  categoryId: number | null;
};

type StructuredIncomeStatement = {
  id: number;
  referenceMonth: string | null;
  netAmount: number;
  paymentDate: string | null;
  status: "posted" | "draft";
  postedTransactionId: number | null;
  sourceName: string | null;
};

type StructuredIncomeConflict = {
  type: "income_statement";
  statementId: number;
  sourceName: string | null;
  referenceMonth: string | null;
  paymentDate: string | null;
  netAmount: number;
  status: "posted" | "draft";
  postedTransactionId: number | null;
};

type CategoryOverride = {
  line: number;
  categoryId: number | null;
};

type ImportFile = {
  buffer?: Buffer;
  originalname?: string;
  mimetype?: string;
};

type UtilityBillImportDecision = {
  scope: "generic_boleto";
  decision: "blocked" | "supported";
  reasonCode: string;
};

const CATEGORY_ENTRY = TRANSACTION_TYPE_ENTRY;
const CATEGORY_EXIT = TRANSACTION_TYPE_EXIT;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMPORT_TTL_MINUTES = 30;
const DEFAULT_IMPORT_CSV_MAX_ROWS = 2000;
const DEFAULT_IMPORT_HISTORY_LIMIT = 20;
const MAX_IMPORT_HISTORY_LIMIT = 100;
const IMPORT_INCOME_STATEMENT_AMOUNT_TOLERANCE = 0.05;
const IMPORT_INCOME_STATEMENT_DATE_TOLERANCE_DAYS = 10;
const REQUIRED_HEADERS = ["date", "type", "value", "description"];
const OPTIONAL_HEADERS = ["notes", "category"];
const ALLOWED_HEADERS = new Set([...REQUIRED_HEADERS, ...OPTIONAL_HEADERS]);
const HEADER_ERROR_MESSAGE =
  "CSV invalido. Cabecalho esperado: date,type,value,description,notes,category";
const IMPORT_FORMAT_ERROR_MESSAGE =
  "Arquivo nao reconhecido. Envie um CSV manual com cabecalho date,type,value,description,notes,category ou um CSV, OFX ou PDF de extrato.";
const UTILITY_BILL_DOCUMENT_TYPES = new Set([
  "utility_bill_energy",
  "utility_bill_water",
  "utility_bill_gas",
  "utility_bill_telecom",
]);
const collapseWhitespace = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();

const resolveUtilityBillImportDecision = (documentType: unknown): UtilityBillImportDecision | null => {
  const normalizedDocumentType =
    typeof documentType === "string" ? documentType.trim().toLowerCase() : "";

  if (!normalizedDocumentType || !UTILITY_BILL_DOCUMENT_TYPES.has(normalizedDocumentType)) {
    return null;
  }

  return {
    scope: "generic_boleto",
    decision: "blocked",
    reasonCode: "unsupported_auto_transaction_import",
  };
};

const extractFitId = (notes: unknown): string | null => {
  const match = String(notes || "").match(/^FITID\s+(\S+)/);
  return match ? match[1] : null;
};

const generateImportFingerprint = (normalizedRow: {
  notes?: string;
  date: string;
  type: string;
  value: number;
  description?: string;
}): string => {
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

const loadExistingFingerprints = async (
  userId: number | string,
  fingerprints: string[],
): Promise<Set<string>> => {
  if (fingerprints.length === 0) return new Set();
  const result = await dbQuery(
    `SELECT import_fingerprint FROM transactions
     WHERE user_id = $1 AND deleted_at IS NULL AND import_fingerprint = ANY($2)`,
    [userId, fingerprints],
  );
  return new Set(result.rows.map((row) => row.import_fingerprint));
};

const loadExistingFingerprintsWithClient = async (
  transactionClient: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ import_fingerprint: string }> }> },
  userId: number | string,
  fingerprints: string[],
): Promise<Set<string>> => {
  if (fingerprints.length === 0) {
    return new Set();
  }

  const result = await transactionClient.query(
    `SELECT import_fingerprint FROM transactions
     WHERE user_id = $1 AND deleted_at IS NULL AND import_fingerprint = ANY($2)`,
    [userId, fingerprints],
  );

  return new Set(result.rows.map((row) => row.import_fingerprint));
};

const toMoneyNumber = (value: unknown): number => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? Number(parsedValue.toFixed(2)) : 0;
};

const loadStructuredIncomeStatementsForUser = async (
  userId: number | string,
): Promise<StructuredIncomeStatement[]> => {
  const result = await dbQuery(
    `SELECT st.id,
            st.reference_month,
            st.net_amount,
            st.payment_date,
            st.status,
            st.posted_transaction_id,
            s.name AS source_name
       FROM income_statements st
       JOIN income_sources s
         ON s.id = st.income_source_id
      WHERE s.user_id = $1`,
    [userId],
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    referenceMonth:
      typeof row.reference_month === "string" && row.reference_month.trim()
        ? row.reference_month.trim()
        : null,
    netAmount: toMoneyNumber(row.net_amount),
    paymentDate: toISODateOnly(row.payment_date),
    status: row.status === "posted" ? "posted" : "draft",
    postedTransactionId:
      Number.isInteger(Number(row.posted_transaction_id)) && Number(row.posted_transaction_id) > 0
        ? Number(row.posted_transaction_id)
        : null,
    sourceName:
      typeof row.source_name === "string" && row.source_name.trim()
        ? row.source_name.trim()
        : null,
  }));
};

const calculateDateDiffInDays = (
  leftDate: string | null | undefined,
  rightDate: string | null | undefined,
): number => {
  if (!leftDate || !rightDate) {
    return Number.POSITIVE_INFINITY;
  }

  const leftMs = new Date(`${leftDate}T00:00:00Z`).getTime();
  const rightMs = new Date(`${rightDate}T00:00:00Z`).getTime();

  if (!Number.isFinite(leftMs) || !Number.isFinite(rightMs)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.abs(leftMs - rightMs) / (1000 * 60 * 60 * 24);
};

const buildStructuredIncomeConflictDetail = (statement: StructuredIncomeConflict): string => {
  const sourceLabel = statement.sourceName || "Historico de renda";
  const referenceLabel = statement.referenceMonth || "sem competencia";
  const paymentLabel = statement.paymentDate || "sem data de pagamento";

  return `${sourceLabel} ja registrado no historico de renda (${referenceLabel}, ${paymentLabel}).`;
};

const findStructuredIncomeConflict = (
  normalizedRow: NormalizedImportRow | null,
  statements: StructuredIncomeStatement[] = [],
): StructuredIncomeConflict | null => {
  if (!normalizedRow || normalizedRow.type !== CATEGORY_ENTRY || statements.length === 0) {
    return null;
  }

  const rowAmount = toMoneyNumber(normalizedRow.value);

  if (rowAmount <= 0) {
    return null;
  }

  const matches = statements
    .map((statement) => {
      if (!statement.paymentDate || statement.netAmount <= 0) {
        return null;
      }

      const amountDiff = Math.abs(rowAmount - statement.netAmount);
      const amountDiffRatio = statement.netAmount > 0 ? amountDiff / statement.netAmount : 1;

      if (amountDiffRatio > IMPORT_INCOME_STATEMENT_AMOUNT_TOLERANCE) {
        return null;
      }

      const dateDiffDays = calculateDateDiffInDays(normalizedRow.date, statement.paymentDate);

      if (dateDiffDays > IMPORT_INCOME_STATEMENT_DATE_TOLERANCE_DAYS) {
        return null;
      }

      return {
        statement,
        amountDiff,
        dateDiffDays,
      };
    })
    .filter(Boolean)
    .sort((leftMatch, rightMatch) => {
      if (leftMatch.dateDiffDays !== rightMatch.dateDiffDays) {
        return leftMatch.dateDiffDays - rightMatch.dateDiffDays;
      }

      return leftMatch.amountDiff - rightMatch.amountDiff;
    });

  if (matches.length === 0) {
    return null;
  }

  const bestMatch = matches[0].statement;

  return {
    type: "income_statement",
    statementId: bestMatch.id,
    sourceName: bestMatch.sourceName,
    referenceMonth: bestMatch.referenceMonth,
    paymentDate: bestMatch.paymentDate,
    netAmount: bestMatch.netAmount,
    status: bestMatch.status,
    postedTransactionId: bestMatch.postedTransactionId,
  };
};

const createError = (status: number, message: string): ErrorWithStatus => {
  const error = new Error(message) as ErrorWithStatus;
  error.status = status;
  return error;
};

const createErrorWithPublicCode = (
  status: number,
  message: string,
  publicCode: string,
): ErrorWithStatus => {
  const error = createError(status, message);
  error.publicCode = publicCode;
  return error;
};

const computeImportFileSha256 = (importFile: ImportFile): string | null => {
  if (!Buffer.isBuffer(importFile?.buffer) || importFile.buffer.length === 0) {
    return null;
  }

  return createHash("sha256").update(importFile.buffer).digest("hex");
};

const normalizeImportSourceKind = (value: unknown): string => {
  if (typeof value !== "string") {
    return "bank_statement";
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue || "bank_statement";
};

const normalizeSha256 = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(normalizedValue)) {
    return null;
  }

  return normalizedValue;
};

const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue || null;
};

const normalizeOptionalPositiveInteger = (value: unknown): number | null => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
};

const reserveImportFileFingerprintOrThrow = async (
  transactionClient: {
    query: (
      sql: string,
      params?: unknown[],
    ) => Promise<{ rowCount?: number; rows: unknown[] }>;
  },
  {
    userId,
    sourceKind,
    fileSha256,
    originalFileName,
    mimeType,
    sizeBytes,
    hasCandidateRows,
  }: {
    userId: number | string;
    sourceKind: unknown;
    fileSha256: unknown;
    originalFileName: unknown;
    mimeType: unknown;
    sizeBytes: unknown;
    hasCandidateRows: boolean;
  },
) => {
  if (!hasCandidateRows) {
    return;
  }

  const normalizedFileSha256 = normalizeSha256(fileSha256);

  // Backward compatibility for old sessions created before file_sha256 existed.
  if (!normalizedFileSha256) {
    return;
  }

  const normalizedSourceKind = normalizeImportSourceKind(sourceKind);
  const duplicateLookupResult = await transactionClient.query(
    `
      SELECT id
      FROM import_files
      WHERE user_id = $1
        AND source_kind = $2
        AND file_sha256 = $3
      LIMIT 1
    `,
    [userId, normalizedSourceKind, normalizedFileSha256],
  );

  if (Array.isArray(duplicateLookupResult.rows) && duplicateLookupResult.rows.length > 0) {
    throw createErrorWithPublicCode(
      409,
      "Arquivo ja importado anteriormente.",
      "DUPLICATE_IMPORT_FILE",
    );
  }

  try {
    await transactionClient.query(
      `
        INSERT INTO import_files (
          user_id,
          source_kind,
          file_sha256,
          original_filename,
          mime_type,
          size_bytes
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        userId,
        normalizedSourceKind,
        normalizedFileSha256,
        normalizeOptionalText(originalFileName),
        normalizeOptionalText(mimeType),
        normalizeOptionalPositiveInteger(sizeBytes),
      ],
    );
  } catch (error) {
    const errorCode = typeof error?.code === "string" ? error.code : null;

    if (errorCode === "23505") {
      throw createErrorWithPublicCode(
        409,
        "Arquivo ja importado anteriormente.",
        "DUPLICATE_IMPORT_FILE",
      );
    }

    throw error;
  }
};

const normalizeHeader = (value: unknown): string => String(value || "").trim().toLowerCase();

const normalizeRawCell = (value: unknown): string =>
  typeof value === "undefined" || value === null ? "" : String(value);

const parsePositiveInteger = (value: unknown, fallbackValue: number): number => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return fallbackValue;
  }

  return parsedValue;
};

const getImportCsvMaxRows = () =>
  parsePositiveInteger(process.env.IMPORT_CSV_MAX_ROWS, DEFAULT_IMPORT_CSV_MAX_ROWS);

const parsePaginationInteger = (
  value: unknown,
  { fallbackValue, min, max }: { fallbackValue: number; min: number; max: number },
): number => {
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

const normalizeImportHistoryPagination = (
  filters: { limit?: unknown; offset?: unknown } = {},
) => {
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

const normalizeSummaryNumber = (value: unknown, fallbackValue = 0): number => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return fallbackValue;
  }

  return Number(parsedValue.toFixed(2));
};

const normalizeSummaryInteger = (value: unknown, fallbackValue = 0): number => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    return fallbackValue;
  }

  return parsedValue;
};

const resolveImportSessionState = ({
  committedAt,
  expiresAt,
  imported,
  summary,
}) => {
  if (committedAt) {
    if (imported <= 0) {
      return "reverted";
    }

    const validRows = normalizeSummaryInteger(summary?.validRows, 0);
    const conflictRows = normalizeSummaryInteger(summary?.conflictRows, 0);

    if (validRows > 0 && imported < validRows) {
      return "partial";
    }

    if (conflictRows > 0) {
      return "conflict";
    }

    return "imported";
  }

  const expiresAtTimestamp = Date.parse(String(expiresAt || ""));

  if (Number.isFinite(expiresAtTimestamp) && expiresAtTimestamp <= Date.now()) {
    return "expired";
  }

  return "pending_confirmation";
};

const toIsoDateString = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value as string | number | Date);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString();
};

const toISODateOnly = (value: unknown): string | null => {
  if (!value) return null;
  const d = new Date(value as string | number | Date);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const parsePayloadJson = (payloadJson: unknown): Record<string, any> => {
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

const buildUndoBlockedReason = ({
  blockingIncomeStatements = 0,
  blockingBills = 0,
} = {}) => {
  const blockers = [];

  if (blockingIncomeStatements > 0) {
    blockers.push(
      `${blockingIncomeStatements} ${
        blockingIncomeStatements === 1
          ? "lancamento no historico de renda"
          : "lancamentos no historico de renda"
      }`,
    );
  }

  if (blockingBills > 0) {
    blockers.push(
      `${blockingBills} ${blockingBills === 1 ? "conta derivada" : "contas derivadas"}`,
    );
  }

  if (blockers.length === 0) {
    return null;
  }

  return `Nao e possivel desfazer esta importacao porque existem derivados ativos vinculados a ela: ${blockers.join(" e ")}.`;
};

const buildDeleteByIdsQuery = (tableName: string, ids: number[] = []) => {
  if (!Array.isArray(ids) || ids.length === 0) {
    return null;
  }

  const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");

  return {
    sql: `DELETE FROM ${tableName} WHERE id IN (${placeholders})`,
    params: ids,
  };
};

const evaluateImportSessionUndoPlan = async (
  executeQuery,
  userId,
  sessionId,
  {
    activeDerivedIncomeStatements = undefined,
    activeDerivedBills = undefined,
  } = {},
) => {
  const plan = {
    deletableIncomeStatementIds: [],
    blockingIncomeStatements: 0,
    deletableBillIds: [],
    blockingBills: 0,
  };

  const shouldInspectIncomeStatements =
    typeof activeDerivedIncomeStatements === "undefined" || activeDerivedIncomeStatements > 0;
  const shouldInspectBills =
    typeof activeDerivedBills === "undefined" || activeDerivedBills > 0;

  if (shouldInspectIncomeStatements) {
    const incomeStatementsResult = await executeQuery(
      `SELECT st.id,
              st.status,
              st.posted_transaction_id,
              tx.import_session_id AS posted_transaction_import_session_id
         FROM income_statements st
         JOIN income_sources src
           ON src.id = st.income_source_id
         LEFT JOIN transactions tx
           ON tx.id = st.posted_transaction_id
        WHERE src.user_id = $1
          AND st.source_import_session_id = $2`,
      [userId, sessionId],
    );

    incomeStatementsResult.rows.forEach((row) => {
      const postedTransactionId =
        row.posted_transaction_id != null ? Number(row.posted_transaction_id) : null;
      const postedTransactionImportSessionId =
        row.posted_transaction_import_session_id != null
          ? String(row.posted_transaction_import_session_id)
          : null;

      if (postedTransactionId == null && row.status === "draft") {
        plan.deletableIncomeStatementIds.push(Number(row.id));
        return;
      }

      if (postedTransactionId != null && postedTransactionImportSessionId === sessionId) {
        plan.deletableIncomeStatementIds.push(Number(row.id));
        return;
      }

      plan.blockingIncomeStatements += 1;
    });
  }

  if (shouldInspectBills) {
    const billsResult = await executeQuery(
      `SELECT b.id,
              b.status,
              b.credit_card_id,
              COUNT(p.id)::int AS purchase_count
         FROM bills b
         LEFT JOIN credit_card_purchases p
           ON p.bill_id = b.id
        WHERE b.user_id = $1
          AND b.source_import_session_id = $2
        GROUP BY b.id, b.status, b.credit_card_id`,
      [userId, sessionId],
    );

    billsResult.rows.forEach((row) => {
      const purchaseCount = Number(row.purchase_count || 0);

      if (row.status === "pending" && row.credit_card_id == null && purchaseCount === 0) {
        plan.deletableBillIds.push(Number(row.id));
        return;
      }

      plan.blockingBills += 1;
    });
  }

  return {
    ...plan,
    undoBlockedReason: buildUndoBlockedReason({
      blockingIncomeStatements: plan.blockingIncomeStatements,
      blockingBills: plan.blockingBills,
    }),
  };
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

const buildRawRow = (
  sourceRow: {
    date?: unknown;
    type?: unknown;
    value?: unknown;
    description?: unknown;
    notes?: unknown;
    category?: unknown;
  } = {},
) => ({
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

const parseImportFileRows = async (importFile: ImportFile) => {
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

    const normalizedPdfText = collapseWhitespace(text)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    if (
      normalizedPdfText.includes("instituto nacional do seguro social") &&
      normalizedPdfText.includes("historico de emprestimo consignado")
    ) {
      throw createError(
        400,
        "Este PDF e um historico de emprestimo consignado do INSS. Para importar renda, envie o Historico de Creditos do beneficio.",
      );
    }

    const documentType = detectDocumentType({ text, extension });

    if (documentType === "income_statement_inss") {
      try {
        const rows = parseInssCreditHistoryPdfText(text);
        const suggestions = extractInssSuggestions(text);
        return {
          rows,
          documentType,
          suggestion: suggestions[0] ?? null,
          suggestions,
        };
      } catch (error) {
        throw createError(400, error.message || "Nao foi possivel reconhecer transacoes no PDF.");
      }
    }

    if (documentType === "income_statement_payroll") {
      const suggestion = extractPayrollSuggestion(text);
      if (!suggestion) {
        throw createError(
          400,
          "Nao foi possivel reconhecer os dados principais do holerite.",
        );
      }
      return { rows: [], documentType, suggestion, suggestions: suggestion ? [suggestion] : [] };
    }

    if (documentType === "utility_bill_energy") {
      const suggestion = extractEnergyBillSuggestion(text);
      return { rows: [], documentType, suggestion, suggestions: suggestion ? [suggestion] : [] };
    }

    if (documentType === "utility_bill_water") {
      const suggestion = extractWaterBillSuggestion(text);
      return { rows: [], documentType, suggestion, suggestions: suggestion ? [suggestion] : [] };
    }

    if (documentType === "utility_bill_gas") {
      const suggestion = extractGasBillSuggestion(text);
      return { rows: [], documentType, suggestion, suggestions: suggestion ? [suggestion] : [] };
    }

    if (documentType === "utility_bill_telecom") {
      const suggestion = extractTelecomBillSuggestion(text);
      return { rows: [], documentType, suggestion, suggestions: suggestion ? [suggestion] : [] };
    }

    if (documentType === "credit_card_invoice_itau") {
      try {
        const rows = parseItauInvoiceTransactions(text);
        return { rows, documentType, suggestion: null, suggestions: [] };
      } catch (error) {
        throw createError(400, error.message || "Nao foi possivel reconhecer transacoes na fatura.");
      }
    }

    if (documentType === "credit_card_invoice_nubank") {
      try {
        const rows = parseNubankInvoiceTransactions(text);
        return { rows, documentType, suggestion: null, suggestions: [] };
      } catch (error) {
        throw createError(400, error.message || "Nao foi possivel reconhecer transacoes na fatura.");
      }
    }

    try {
      const rows = parseGenericBankStatementPdfText(text);
      return { rows, documentType, suggestion: null, suggestions: [] };
    } catch (error) {
      throw createError(400, error.message || "Nao foi possivel reconhecer transacoes no PDF.");
    }
  }

  if (extension === ".ofx") {
    const documentType = detectDocumentType({ text: "", extension });
    try {
      const rows = parseOfxRows(fileBuffer);
      return { rows, documentType, suggestion: null, suggestions: [] };
    } catch (error) {
      throw createError(400, error.message || "Nao foi possivel reconhecer transacoes no OFX.");
    }
  }

  try {
    const rows = parseCsvFileRows(fileBuffer);
    const documentType = detectDocumentType({ text: "", extension: ".csv" });
    return { rows, documentType, suggestion: null, suggestions: [] };
  } catch (error) {
    if (error?.message !== HEADER_ERROR_MESSAGE) {
      throw error;
    }
  }

  try {
    const rows = parseStatementCsvRows(fileBuffer);
    const documentType = detectDocumentType({ text: "", extension: ".csv" });
    return { rows, documentType, suggestion: null, suggestions: [] };
  } catch (error) {
    if (
      error?.message === `Arquivo excede o limite de ${getImportCsvMaxRows()} linhas.`
    ) {
      throw createError(400, error.message);
    }

    throw createError(400, IMPORT_FORMAT_ERROR_MESSAGE);
  }
};

const normalizeDate = (value: unknown): string => {
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

const normalizeType = (value: unknown): string => {
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

const normalizeValue = (value: unknown): number => {
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

const normalizeDescription = (value: unknown): string => {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    throw new Error("Descricao e obrigatoria.");
  }

  return normalizedValue;
};

const normalizeNotes = (value: unknown): string => String(value || "").trim();

const resolveCategoryId = (value: unknown, categoryMap: Map<string, number>): number | null => {
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

const loadCategoryMapForUser = async (userId: number | string): Promise<Map<string, number>> => {
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

const loadCategoriesForUser = async (userId: number | string) => {
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

const normalizeCsvRow = (rawRow: RawCsvRow, categoryMap: Map<string, number>) => {
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
      } else if (row.status === "conflict") {
        summary.conflictRows += 1;
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
      conflictRows: 0,
      income: 0,
      expense: 0,
    },
  );
};

const persistImportSession = async (
  userId: number | string,
  payload: unknown,
  { fileSha256 = null }: { fileSha256?: string | null } = {},
) => {
  const importId = randomUUID();
  const expiresAtDate = new Date(Date.now() + IMPORT_TTL_MINUTES * 60 * 1000);
  const result = await dbQuery(
    `
      INSERT INTO transaction_import_sessions (id, user_id, payload_json, expires_at, file_sha256)
      VALUES ($1, $2, $3::jsonb, $4, $5)
      RETURNING expires_at
    `,
    [
      importId,
      userId,
      JSON.stringify(payload),
      expiresAtDate.toISOString(),
      normalizeSha256(fileSha256),
    ],
  );

  return {
    importId,
    expiresAt:
      typeof result.rows[0]?.expires_at === "string"
        ? result.rows[0].expires_at
        : new Date(result.rows[0]?.expires_at || expiresAtDate).toISOString(),
  };
};

const stripSensitiveImportPayloadFields = (payload: unknown) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const { normalizedRows, ...retainedPayload } = payload as Record<string, unknown>;
  return retainedPayload;
};

const normalizeImportId = (value: unknown): string => {
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

const loadImportSessionById = async (importId: string) => {
  const result = await dbQuery(
    `
      SELECT id, user_id, payload_json, expires_at, committed_at, file_sha256
      FROM transaction_import_sessions
      WHERE id = $1
      LIMIT 1
    `,
    [importId],
  );

  return result.rows[0] || null;
};

const assertSessionOwnership = (session: any, userId: number | string): void => {
  if (!session || Number(session.user_id) !== Number(userId)) {
    throw createError(404, "Sessao de importacao nao encontrada.");
  }
};

const isSessionExpired = (session: any): boolean => {
  const expiresAt = new Date(session.expires_at);

  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= Date.now();
};

const assertSessionReadyForCommit = (session: any, userId: number | string): void => {
  assertSessionOwnership(session, userId);

  if (session.committed_at) {
    throw createError(409, "Importacao ja confirmada.");
  }

  if (isSessionExpired(session)) {
    throw createError(410, "Sessao de importacao expirada.");
  }
};

export const dryRunTransactionsImportForUser = async (
  userId: number | string,
  importFile: ImportFile,
) => {
  const {
    rows: parsedRows,
    documentType,
    suggestion,
    suggestions = [],
  } = await parseImportFileRows(importFile);
  const utilityBillImportDecision = resolveUtilityBillImportDecision(documentType);
  const [categoryMap, categories, importRules] = await Promise.all([
    loadCategoryMapForUser(userId),
    loadCategoriesForUser(userId),
    loadActiveTransactionImportCategoryRulesByUser(userId),
  ]);
  const rowsWithRuleSuggestions = applyTransactionImportCategoryRules(parsedRows, importRules);
  const classifiedRows = applySmartClassification(rowsWithRuleSuggestions, categories);
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
  const [existingSet, structuredIncomeStatements] = await Promise.all([
    loadExistingFingerprints(userId, [...fingerprintMap.values()] as string[]),
    loadStructuredIncomeStatementsForUser(userId),
  ]);
  const seenFingerprintsInFile = new Set<string>();

  const rows = validatedRows.map((row) => {
    if (row.status !== "valid" || !row.normalized) return row;
    const fp = String(fingerprintMap.get(row.line) || "").trim();

    if (!fp) {
      return row;
    }

    if (seenFingerprintsInFile.has(fp)) {
      return {
        ...row,
        status: "duplicate",
        statusDetail: "Ja existe uma linha equivalente no arquivo de importacao.",
        fingerprint: fp,
        normalized: null,
      };
    }

    seenFingerprintsInFile.add(fp);

    if (existingSet.has(fp)) {
      return {
        ...row,
        status: "duplicate",
        statusDetail: "Ja existe uma transacao importada equivalente.",
        fingerprint: fp,
        normalized: null,
      };
    }

    const structuredIncomeConflict = findStructuredIncomeConflict(
      row.normalized,
      structuredIncomeStatements,
    );

    if (structuredIncomeConflict) {
      return {
        ...row,
        status: "conflict",
        statusDetail: buildStructuredIncomeConflictDetail(structuredIncomeConflict),
        conflict: structuredIncomeConflict,
        fingerprint: fp,
        normalized: null,
      };
    }

    return { ...row, fingerprint: fp };
  });

  const summary = createSummary(rows);
  const fileSha256 = computeImportFileSha256(importFile);

  const normalizedRows = rows
    .filter((row) => row.status === "valid" && row.normalized)
    .map((row) => ({ ...row.normalized, fingerprint: row.fingerprint, line: row.line }));

  const persistedSession = await persistImportSession(userId, {
    normalizedRows,
    summary,
    fileSha256,
    fileName: importFile?.originalname || null,
    fileMimeType: importFile?.mimetype || null,
    fileSizeBytes: Buffer.isBuffer(importFile?.buffer) ? importFile.buffer.length : null,
    documentType,
    utilityBillImportDecision,
  }, {
    fileSha256,
  });

  return {
    importId: persistedSession.importId,
    expiresAt: persistedSession.expiresAt,
    documentType,
    utilityBillImportDecision,
    suggestion: suggestion || null,
    suggestions,
    summary,
    rows,
  };
};

export const listTransactionsImportSessionsByUser = async (
  userId: number | string,
  filters: { limit?: unknown; offset?: unknown } = {},
) => {
  const pagination = normalizeImportHistoryPagination(filters);
  const result = await dbQuery(
    `
      SELECT s.id,
             s.created_at,
             s.expires_at,
             s.committed_at,
             s.payload_json,
             COALESCE(tx.active_imported_count, 0) AS active_imported_count,
             COALESCE(ist.active_income_statements_count, 0) AS active_income_statements_count,
             COALESCE(b.active_bills_count, 0) AS active_bills_count
      FROM transaction_import_sessions s
      LEFT JOIN (
        SELECT import_session_id,
               user_id,
               COUNT(*)::int AS active_imported_count
        FROM transactions
        WHERE deleted_at IS NULL
          AND import_session_id IS NOT NULL
        GROUP BY import_session_id, user_id
      ) tx
        ON tx.import_session_id = s.id
       AND tx.user_id = s.user_id
      LEFT JOIN (
        SELECT st.source_import_session_id AS import_session_id,
               src.user_id,
               COUNT(*)::int AS active_income_statements_count
        FROM income_statements st
        JOIN income_sources src
          ON src.id = st.income_source_id
        WHERE st.source_import_session_id IS NOT NULL
        GROUP BY st.source_import_session_id, src.user_id
      ) ist
        ON ist.import_session_id = s.id
       AND ist.user_id = s.user_id
      LEFT JOIN (
        SELECT source_import_session_id AS import_session_id,
               user_id,
               COUNT(*)::int AS active_bills_count
        FROM bills
        WHERE source_import_session_id IS NOT NULL
        GROUP BY source_import_session_id, user_id
      ) b
        ON b.import_session_id = s.id
       AND b.user_id = s.user_id
      WHERE s.user_id = $1
      ORDER BY s.created_at DESC
      LIMIT $2 OFFSET $3
    `,
    [userId, pagination.limit, pagination.offset],
  );

  const items = await Promise.all(result.rows.map(async (row) => {
    const payload = parsePayloadJson(row.payload_json);
    const summary = payload.summary || {};
    const imported = normalizeSummaryInteger(row.active_imported_count, 0);
    const committedAt = toIsoDateString(row.committed_at);
    const createdAt = toIsoDateString(row.created_at);
    const expiresAt = toIsoDateString(row.expires_at);
    const derivedIncomeStatements = normalizeSummaryInteger(
      row.active_income_statements_count,
      0,
    );
    const derivedBills = normalizeSummaryInteger(row.active_bills_count, 0);
    const undoPlan =
      derivedIncomeStatements > 0 || derivedBills > 0
        ? await evaluateImportSessionUndoPlan(
            dbQuery,
            userId,
            String(row.id),
            {
              activeDerivedIncomeStatements: derivedIncomeStatements,
              activeDerivedBills: derivedBills,
            },
          )
        : { undoBlockedReason: null };

    const normalizedSummary = {
      totalRows: normalizeSummaryInteger(summary.totalRows, 0),
      validRows: normalizeSummaryInteger(summary.validRows, 0),
      duplicateRows: normalizeSummaryInteger(summary.duplicateRows, 0),
      conflictRows: normalizeSummaryInteger(summary.conflictRows, 0),
      invalidRows: normalizeSummaryInteger(summary.invalidRows, 0),
      income: normalizeSummaryNumber(summary.income, 0),
      expense: normalizeSummaryNumber(summary.expense, 0),
      imported,
    };

    const state = resolveImportSessionState({
      committedAt,
      expiresAt,
      imported,
      summary: normalizedSummary,
    });

    return {
      id: String(row.id),
      createdAt,
      expiresAt,
      committedAt,
      fileName:
        typeof payload.fileName === "string" && payload.fileName.trim()
          ? payload.fileName.trim()
          : null,
      documentType:
        typeof payload.documentType === "string" && payload.documentType.trim()
          ? payload.documentType.trim()
          : null,
      state,
      canUndo: Boolean(committedAt) && imported > 0 && !undoPlan.undoBlockedReason,
      undoBlockedReason: undoPlan.undoBlockedReason,
      summary: normalizedSummary,
    };
  }));

  return {
    items,
    pagination,
  };
};

export const getTransactionsImportMetricsByUser = async (userId: number | string) => {
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

const buildCategoryOverrideMap = (overrides: CategoryOverride[]) => {
  if (!Array.isArray(overrides) || overrides.length === 0) return new Map();
  return new Map(
    overrides
      .filter(
        (o) =>
          o != null &&
          typeof o.line === "number" &&
          Number.isInteger(o.line) &&
          o.line > 0 &&
          (o.categoryId === null || (Number.isInteger(o.categoryId) && o.categoryId > 0)),
      )
      .map((o) => [o.line, o.categoryId ?? null]),
  );
};

export const commitTransactionsImportForUser = async (
  userId: number | string,
  importId: string,
  categoryOverrides: CategoryOverride[] = [],
) => {
  const normalizedImportId = normalizeImportId(importId);
  const importSession = await loadImportSessionById(normalizedImportId);

  assertSessionReadyForCommit(importSession, userId);

  const payload =
    typeof importSession.payload_json === "string"
      ? JSON.parse(importSession.payload_json)
      : importSession.payload_json || {};
  const sessionRows = Array.isArray(payload.normalizedRows) ? payload.normalizedRows : [];
  const overrideMap = buildCategoryOverrideMap(categoryOverrides);
  const normalizedRows = overrideMap.size === 0
    ? sessionRows
    : sessionRows.map((row) =>
        overrideMap.has(row.line)
          ? { ...row, categoryId: overrideMap.get(row.line) }
          : row,
      );
  const payloadSummary = payload.summary || {};
  const importFileName = payload.fileName || null;
  const importFileMimeType = payload.fileMimeType || null;
  const importFileSizeBytes = payload.fileSizeBytes || null;
  const importDocumentType = payload.documentType || null;
  const importFileSha256 = importSession.file_sha256 || payload.fileSha256 || null;
  const observabilitySummary = {
    totalRows: normalizeSummaryInteger(payloadSummary.totalRows, normalizedRows.length),
    validRows: normalizeSummaryInteger(payloadSummary.validRows, normalizedRows.length),
    invalidRows: normalizeSummaryInteger(payloadSummary.invalidRows, 0),
  };

  const commitOutcome = await withDbTransaction(async (transactionClient) => {
    await reserveImportFileFingerprintOrThrow(transactionClient, {
      userId,
      sourceKind: "bank_statement",
      fileSha256: importFileSha256,
      originalFileName: importFileName,
      mimeType: importFileMimeType,
      sizeBytes: importFileSizeBytes,
      hasCandidateRows: normalizedRows.length > 0,
    });

    const sessionUpdateResult = await transactionClient.query(
      `
        UPDATE transaction_import_sessions
        SET committed_at = NOW(),
            payload_json = $3::jsonb
        WHERE id = $1
          AND user_id = $2
          AND committed_at IS NULL
          AND expires_at > NOW()
        RETURNING id
      `,
      [
        normalizedImportId,
        userId,
        JSON.stringify(stripSensitiveImportPayloadFields(payload)),
      ],
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
        createdTransactions: [],
      };
    }

    const fingerprintCandidates = normalizedRows
      .map((row) => (typeof row.fingerprint === "string" ? row.fingerprint.trim() : ""))
      .filter(Boolean);
    const existingFingerprints = await loadExistingFingerprintsWithClient(
      transactionClient,
      userId,
      [...new Set(fingerprintCandidates)] as string[],
    );
    const seenFingerprints = new Set(existingFingerprints);

    const dedupedRows = normalizedRows.filter((row) => {
      const fingerprint = typeof row.fingerprint === "string" ? row.fingerprint.trim() : "";

      if (!fingerprint) {
        return true;
      }

      if (seenFingerprints.has(fingerprint)) {
        return false;
      }

      seenFingerprints.add(fingerprint);
      return true;
    });

    if (dedupedRows.length === 0) {
      return {
        imported: 0,
        income: 0,
        expense: 0,
        createdTransactions: [],
      };
    }

    const insertValuesPlaceholders = dedupedRows
      .map((_, rowIndex) => {
        const p = rowIndex * 10 + 2;
        return `($1, $${p}, $${p + 1}, $${p + 2}::date, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}, $${p + 7}, NOW(), $${p + 8}, $${p + 9})`;
      })
      .join(", ");

    const insertParams = [userId];

    dedupedRows.forEach((row) => {
      insertParams.push(
        row.type,
        row.value,
        row.date,
        row.description,
        row.notes || "",
        row.categoryId,
        row.fingerprint || null,
        normalizedImportId,
        importFileName,
        importDocumentType,
      );
    });

    const insertResult = await transactionClient.query(
      `
        INSERT INTO transactions (user_id, type, value, date, description, notes, category_id, import_fingerprint, import_session_id, imported_at, import_file_name, import_document_type)
        VALUES ${insertValuesPlaceholders}
        RETURNING id, type, value, date, description
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

    // Zip returned rows with normalizedRows to associate each created
    // transaction id with the original CSV line number.
    const createdTransactions = insertResult.rows.map((row, i) => ({
      id: Number(row.id),
      line: dedupedRows[i]?.line ?? null,
      type: String(row.type),
      value: Number(row.value),
      date: toISODateOnly(row.date),
      description: row.description != null ? String(row.description) : null,
    }));

    return {
      imported,
      income,
      expense,
      createdTransactions,
    };
  });

  return {
    imported: commitOutcome.imported,
    importSessionId: normalizedImportId,
    createdTransactions: commitOutcome.createdTransactions ?? [],
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

export const deleteImportSessionForUser = async (
  userId: number | string,
  sessionId: string,
) => {
  const normalizedSessionId = normalizeImportId(sessionId);

  const result = await withDbTransaction(async (transactionClient) => {
    const sessionResult = await transactionClient.query(
      `SELECT id, user_id FROM transaction_import_sessions WHERE id = $1 LIMIT 1`,
      [normalizedSessionId],
    );
    const session = sessionResult.rows[0] || null;
    assertSessionOwnership(session, userId);

    const [incomeStatementsResult, billsResult] = await Promise.all([
      transactionClient.query(
        `SELECT COUNT(*)::int AS count
         FROM income_statements st
         JOIN income_sources src
           ON src.id = st.income_source_id
         WHERE src.user_id = $1
           AND st.source_import_session_id = $2`,
        [userId, normalizedSessionId],
      ),
      transactionClient.query(
        `SELECT COUNT(*)::int AS count
         FROM bills
         WHERE user_id = $1
           AND source_import_session_id = $2`,
        [userId, normalizedSessionId],
      ),
    ]);

    const derivedIncomeStatements = normalizeSummaryInteger(
      incomeStatementsResult.rows[0]?.count,
      0,
    );
    const derivedBills = normalizeSummaryInteger(billsResult.rows[0]?.count, 0);
    const undoPlan = await evaluateImportSessionUndoPlan(
      (sql, params) => transactionClient.query(sql, params),
      userId,
      normalizedSessionId,
      {
        activeDerivedIncomeStatements: derivedIncomeStatements,
        activeDerivedBills: derivedBills,
      },
    );

    if (undoPlan.undoBlockedReason) {
      throw createError(409, undoPlan.undoBlockedReason);
    }

    const deleteIncomeStatementsQuery = buildDeleteByIdsQuery(
      "income_statements",
      undoPlan.deletableIncomeStatementIds,
    );
    if (deleteIncomeStatementsQuery) {
      await transactionClient.query(
        deleteIncomeStatementsQuery.sql,
        deleteIncomeStatementsQuery.params,
      );
    }

    const deleteBillsQuery = buildDeleteByIdsQuery("bills", undoPlan.deletableBillIds);
    if (deleteBillsQuery) {
      await transactionClient.query(deleteBillsQuery.sql, deleteBillsQuery.params);
    }

    const deleteResult = await transactionClient.query(
      `UPDATE transactions SET deleted_at = NOW()
       WHERE user_id = $1 AND import_session_id = $2 AND deleted_at IS NULL`,
      [userId, normalizedSessionId],
    );

    return {
      deletedCount: Number(deleteResult.rowCount || 0),
      deletedDerivedIncomeStatements: undoPlan.deletableIncomeStatementIds.length,
      deletedDerivedBills: undoPlan.deletableBillIds.length,
    };
  });

  return {
    importSessionId: normalizedSessionId,
    deletedCount: result.deletedCount,
    success: true,
    deletedDerived: {
      incomeStatements: result.deletedDerivedIncomeStatements,
      bills: result.deletedDerivedBills,
    },
  };
};

export const bulkDeleteTransactionsForUser = async (
  userId: number | string,
  transactionIds: number[],
) => {
  if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
    return { deletedCount: 0, success: true };
  }

  const validIds = transactionIds.filter((id) => Number.isInteger(id) && id > 0);

  if (validIds.length === 0) {
    return { deletedCount: 0, success: true };
  }

  const placeholders = validIds.map((_, index) => `$${index + 2}`).join(", ");
  const result = await dbQuery(
    `UPDATE transactions SET deleted_at = NOW()
     WHERE user_id = $1 AND id IN (${placeholders}) AND deleted_at IS NULL`,
    [userId, ...validIds],
  );

  return { deletedCount: Number(result.rowCount || 0), success: true };
};
