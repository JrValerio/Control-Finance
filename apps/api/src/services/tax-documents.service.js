import { createHash } from "node:crypto";
import { dbQuery, withDbTransaction } from "../db/index.js";
import { runTaxExtractorForDocument } from "../domain/tax/tax-document-extractors.js";
import {
  createTaxError,
  normalizeOptionalDocumentProcessingStatus,
  normalizePagination,
  normalizeTaxUserId,
  normalizeTaxYear,
  toISOStringOrNull,
} from "../domain/tax/tax.validation.js";
import { logWarn } from "../observability/logger.js";
import { classifyTaxDocumentBuffer } from "./tax-classification.service.js";
import {
  deleteStoredTaxDocument,
  saveTaxDocumentBuffer,
} from "./tax-document-storage.service.js";

const DUPLICATE_TAX_DOCUMENT_ERROR_CODE = "23505";
const TAX_DOCUMENT_TAXPAYER_CPF_MISMATCH_CODE = "TAX_DOCUMENT_TAXPAYER_CPF_MISMATCH";

const mapTaxDocument = (row) => ({
  id: Number(row.id),
  taxYear: Number(row.tax_year),
  originalFileName: row.original_file_name,
  documentType: row.document_type,
  processingStatus: row.processing_status,
  sourceLabel: row.source_label,
  sourceHint: row.source_hint,
  uploadedAt: toISOStringOrNull(row.uploaded_at),
});

const mapTaxDocumentDetail = (row) => ({
  ...mapTaxDocument(row),
  mimeType: row.mime_type,
  byteSize: Number(row.byte_size),
  sha256: row.sha256,
});

const mapLatestExtraction = (row) => {
  if (!row) {
    return null;
  }

  return {
    extractorName: row.extractor_name,
    extractorVersion: row.extractor_version,
    classification: row.classification,
    confidenceScore:
      row.confidence_score === null || typeof row.confidence_score === "undefined"
        ? null
        : Number(row.confidence_score),
    warnings: Array.isArray(row.warnings_json) ? row.warnings_json : [],
    createdAt: toISOStringOrNull(row.created_at),
  };
};

const normalizeDocumentId = (value) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw createTaxError(400, "documentId invalido.");
  }

  return parsedValue;
};

const normalizeOptionalText = (value, { maxLength, fieldName }) => {
  if (typeof value === "undefined" || value === null) {
    return "";
  }

  const normalizedValue = String(value).trim();

  if (!normalizedValue) {
    return "";
  }

  if (normalizedValue.length > maxLength) {
    throw createTaxError(400, `${fieldName} excede o limite de ${maxLength} caracteres.`);
  }

  return normalizedValue;
};

const normalizeDocumentNumber = (value) => String(value || "").replace(/\D/g, "");

const formatCpf = (value) => {
  const digits = normalizeDocumentNumber(value);

  if (digits.length !== 11) {
    return digits;
  }

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

const TAX_DOCUMENT_SELECT_COLUMNS = `
  id,
  tax_year,
  original_file_name,
  mime_type,
  byte_size,
  sha256,
  document_type,
  processing_status,
  source_label,
  source_hint,
  storage_key,
  uploaded_at`;

const findTaxDocumentRowByIdForUser = async (client, userId, documentId) => {
  const result = await client.query(
    `SELECT ${TAX_DOCUMENT_SELECT_COLUMNS}
     FROM tax_documents
     WHERE id = $1
       AND user_id = $2
     LIMIT 1`,
    [documentId, userId],
  );

  return result.rows[0] || null;
};

const getUserTaxpayerCpf = async (userId) => {
  const result = await dbQuery(
    `SELECT taxpayer_cpf
     FROM user_profiles
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );

  return normalizeDocumentNumber(result.rows[0]?.taxpayer_cpf);
};

const resolveExtractorOwnerDocument = (extractorResult) => {
  const payload =
    extractorResult?.payload && typeof extractorResult.payload === "object"
      ? extractorResult.payload
      : null;

  if (!payload) {
    return "";
  }

  return normalizeDocumentNumber(
    payload.beneficiaryDocument ||
      payload.customerDocument ||
      payload.studentDocument ||
      payload.ownerDocument ||
      "",
  );
};

const buildTaxpayerMismatchMessage = ({ taxpayerCpf, ownerDocument }) =>
  `Conflito de CPF divergente. Documento no CPF ${formatCpf(ownerDocument)} e perfil fiscal no CPF ${formatCpf(taxpayerCpf)}.`;

const ensureTaxDocumentMatchesUserTaxpayerCpf = async ({ userId, file }) => {
  const taxpayerCpf = await getUserTaxpayerCpf(userId);

  if (!taxpayerCpf) {
    return;
  }

  const classification = await classifyTaxDocumentBuffer({
    buffer: file.buffer,
    originalFileName: file.originalname,
  });
  const extractorResult = runTaxExtractorForDocument({
    documentType: classification.documentType,
    text: classification.text,
    classification,
  });
  const ownerDocument = resolveExtractorOwnerDocument(extractorResult);

  if (!ownerDocument || ownerDocument === taxpayerCpf) {
    return;
  }

  throw createTaxError(
    409,
    buildTaxpayerMismatchMessage({
      taxpayerCpf,
      ownerDocument,
    }),
    TAX_DOCUMENT_TAXPAYER_CPF_MISMATCH_CODE,
  );
};

export const listTaxDocumentsByUser = async (userId, query = {}) => {
  const normalizedUserId = normalizeTaxUserId(userId);
  const taxYear = normalizeTaxYear(query.taxYear);
  const status = normalizeOptionalDocumentProcessingStatus(query.status);
  const pagination = normalizePagination(query);
  const whereClauses = ["user_id = $1", "tax_year = $2"];
  const params = [normalizedUserId, taxYear];

  if (status) {
    params.push(status);
    whereClauses.push(`processing_status = $${params.length}`);
  }

  const whereSql = whereClauses.join(" AND ");
  const countResult = await dbQuery(
    `SELECT COUNT(*) AS total
     FROM tax_documents
     WHERE ${whereSql}`,
    params,
  );

  params.push(pagination.pageSize, pagination.offset);
  const documentsResult = await dbQuery(
    `SELECT
       id,
       tax_year,
       original_file_name,
       document_type,
       processing_status,
       source_label,
       source_hint,
       uploaded_at
     FROM tax_documents
     WHERE ${whereSql}
     ORDER BY uploaded_at DESC, id DESC
     LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );

  return {
    items: documentsResult.rows.map(mapTaxDocument),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total: Number(countResult.rows[0]?.total || 0),
  };
};

export const createTaxDocumentForUser = async (userId, payload = {}, file) => {
  const normalizedUserId = normalizeTaxUserId(userId);
  const taxYear = normalizeTaxYear(payload.taxYear);
  const sourceLabel = normalizeOptionalText(payload.sourceLabel, {
    maxLength: 120,
    fieldName: "sourceLabel",
  });
  const sourceHint = normalizeOptionalText(payload.sourceHint, {
    maxLength: 200,
    fieldName: "sourceHint",
  });

  if (!file?.buffer || file.buffer.length === 0) {
    throw createTaxError(400, "Arquivo fiscal (file) e obrigatorio.");
  }

  const sha256 = createHash("sha256").update(file.buffer).digest("hex");
  const existingDocumentResult = await dbQuery(
    `SELECT
       id,
       tax_year,
       original_file_name,
       mime_type,
       byte_size,
       sha256,
       document_type,
       processing_status,
       source_label,
       source_hint,
       uploaded_at
     FROM tax_documents
     WHERE user_id = $1
       AND sha256 = $2
     LIMIT 1`,
    [normalizedUserId, sha256],
  );

  if (existingDocumentResult.rows[0]) {
    throw createTaxError(409, "Documento ja enviado anteriormente.", "TAX_DOCUMENT_DUPLICATE");
  }

  await ensureTaxDocumentMatchesUserTaxpayerCpf({
    userId: normalizedUserId,
    file,
  });

  let storedDocument = null;

  try {
    storedDocument = await saveTaxDocumentBuffer({
      userId: normalizedUserId,
      sha256,
      originalFileName: file.originalname,
      buffer: file.buffer,
    });

    const result = await dbQuery(
      `INSERT INTO tax_documents (
         user_id,
         tax_year,
         original_file_name,
         stored_file_name,
         storage_key,
         mime_type,
         byte_size,
         sha256,
         document_type,
         source_label,
         source_hint,
         processing_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'unknown', $9, $10, 'uploaded')
       RETURNING
         id,
         tax_year,
         original_file_name,
         mime_type,
         byte_size,
         sha256,
         document_type,
         processing_status,
         source_label,
         source_hint,
         uploaded_at`,
      [
        normalizedUserId,
        taxYear,
        String(file.originalname || ""),
        storedDocument.storedFileName,
        storedDocument.storageKey,
        String(file.mimetype || ""),
        Number(file.size || file.buffer.length),
        sha256,
        sourceLabel,
        sourceHint,
      ],
    );

    return mapTaxDocumentDetail(result.rows[0]);
  } catch (error) {
    if (storedDocument?.storageKey) {
      await deleteStoredTaxDocument(storedDocument.storageKey);
    }

    if (error?.code === DUPLICATE_TAX_DOCUMENT_ERROR_CODE) {
      throw createTaxError(409, "Documento ja enviado anteriormente.", "TAX_DOCUMENT_DUPLICATE");
    }

    throw error;
  }
};

export const getTaxDocumentByIdForUser = async (userId, documentId) => {
  const normalizedUserId = normalizeTaxUserId(userId);
  const normalizedDocumentId = normalizeDocumentId(documentId);
  const document = await findTaxDocumentRowByIdForUser(
    { query: dbQuery },
    normalizedUserId,
    normalizedDocumentId,
  );

  if (!document) {
    throw createTaxError(404, "Documento fiscal nao encontrado.");
  }

  const extractionResult = await dbQuery(
    `SELECT
       extractor_name,
       extractor_version,
       classification,
       confidence_score,
       warnings_json,
       created_at
     FROM tax_document_extractions
     WHERE document_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [normalizedDocumentId],
  );

  return {
    document: {
      ...mapTaxDocumentDetail(document),
      latestExtraction: mapLatestExtraction(extractionResult.rows[0] || null),
    },
  };
};

export const deleteTaxDocumentByIdForUser = async (userId, documentId) => {
  const normalizedUserId = normalizeTaxUserId(userId);
  const normalizedDocumentId = normalizeDocumentId(documentId);

  const deletedDocument = await withDbTransaction(async (client) => {
    const existingDocument = await findTaxDocumentRowByIdForUser(
      client,
      normalizedUserId,
      normalizedDocumentId,
    );

    if (!existingDocument) {
      throw createTaxError(404, "Documento fiscal nao encontrado.");
    }

    const deletedFactsResult = await client.query(
      `DELETE FROM tax_facts
       WHERE user_id = $1
         AND source_document_id = $2
       RETURNING id`,
      [normalizedUserId, normalizedDocumentId],
    );

    const deletedDocumentResult = await client.query(
      `DELETE FROM tax_documents
       WHERE id = $1
         AND user_id = $2
       RETURNING id, storage_key`,
      [normalizedDocumentId, normalizedUserId],
    );

    if (!deletedDocumentResult.rows[0]) {
      throw createTaxError(404, "Documento fiscal nao encontrado.");
    }

    return {
      deletedDocumentId: Number(deletedDocumentResult.rows[0].id),
      deletedFactsCount: deletedFactsResult.rows.length,
      storageKey: deletedDocumentResult.rows[0].storage_key,
    };
  });

  try {
    await deleteStoredTaxDocument(deletedDocument.storageKey);
  } catch (error) {
    logWarn({
      event: "tax_documents.storage_cleanup_failed",
      message: "Failed to remove stored tax document after metadata deletion.",
      userId: normalizedUserId,
      documentId: normalizedDocumentId,
      storageKey: deletedDocument.storageKey,
      error: error?.message || "unknown_storage_cleanup_error",
    });
  }

  return {
    deletedDocumentId: deletedDocument.deletedDocumentId,
    deletedFactsCount: deletedDocument.deletedFactsCount,
  };
};
