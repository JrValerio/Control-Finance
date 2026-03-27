import { dbQuery, withDbTransaction } from "../db/index.js";
import { generateTaxFactDedupeKey } from "../domain/tax/tax-fact-normalizer.js";
import {
  createTaxError,
  normalizeOptionalTaxFactReviewStatus,
  normalizePagination,
  normalizeTaxFactType,
  normalizeTaxUserId,
  normalizeTaxYear,
  toISOStringOrNull,
} from "../domain/tax/tax.validation.js";

const TAX_FACT_DUPLICATE_CONFLICT_CODE = "TAX_FACT_DUPLICATE";
const TAX_FACT_DUPLICATE_CONFLICT_MESSAGE =
  "Fato potencialmente duplicado com outro documento fiscal do usuario.";
const MAX_MANUAL_SUBCATEGORY_LENGTH = 120;
const MAX_MANUAL_PAYER_NAME_LENGTH = 160;
const MAX_MANUAL_PAYER_DOCUMENT_LENGTH = 40;
const MAX_MANUAL_REFERENCE_PERIOD_LENGTH = 32;
const MAX_MANUAL_NOTE_LENGTH = 500;

const normalizeJsonObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
};

const normalizeDocumentNumber = (value) => String(value || "").replace(/\D/g, "");

const normalizeRequiredString = (value, fieldName, maxLength) => {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    throw createTaxError(400, `${fieldName} invalido.`);
  }

  if (normalizedValue.length > maxLength) {
    throw createTaxError(400, `${fieldName} excede o limite de ${maxLength} caracteres.`);
  }

  return normalizedValue;
};

const normalizeOptionalString = (value, fieldName, maxLength) => {
  if (typeof value === "undefined" || value === null || value === "") {
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

const normalizeManualAmount = (value) => {
  const parsedValue =
    typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw createTaxError(400, "amount invalido.");
  }

  return Number(parsedValue.toFixed(2));
};

const getUserTaxpayerDocument = async (client, userId) => {
  const result = await client.query(
    `SELECT taxpayer_cpf
     FROM user_profiles
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );

  return normalizeDocumentNumber(result.rows[0]?.taxpayer_cpf || "");
};

const findExistingStrongFactByDedupeKey = async (client, userId, dedupeKey) => {
  const result = await client.query(
    `SELECT id, source_document_id
     FROM tax_facts
     WHERE user_id = $1
       AND dedupe_strength = 'strong'
       AND dedupe_key = $2
     LIMIT 1`,
    [userId, dedupeKey],
  );

  return result.rows[0] || null;
};

const buildManualFactMetadata = ({
  note,
  ownerDocument,
  duplicateOfFactId = null,
  duplicateOfDocumentId = null,
}) => {
  const metadata = {
    sourceOrigin: "manual_entry",
    ownerDocument: ownerDocument || undefined,
    note: note || undefined,
  };

  if (duplicateOfFactId) {
    metadata.duplicateOfFactId = duplicateOfFactId;
  }

  if (duplicateOfDocumentId) {
    metadata.duplicateOfDocumentId = duplicateOfDocumentId;
  }

  return metadata;
};

const mapTaxFactRow = (row) => {
  const metadata = normalizeJsonObject(row.metadata_json);

  return {
    id: Number(row.id),
    taxYear: Number(row.tax_year),
    sourceDocumentId:
      row.source_document_id === null || typeof row.source_document_id === "undefined"
        ? null
        : Number(row.source_document_id),
    factType: row.fact_type,
    category: row.category,
    subcategory: row.subcategory,
    payerName: row.payer_name,
    payerDocument: row.payer_document,
    referencePeriod: row.reference_period,
    currency: row.currency,
    amount: Number(row.amount),
    confidenceScore:
      row.confidence_score === null || typeof row.confidence_score === "undefined"
        ? null
        : Number(row.confidence_score),
    dedupeStrength: row.dedupe_strength,
    reviewStatus: row.review_status,
    conflictCode: row.conflict_code,
    conflictMessage: row.conflict_message,
    metadata,
    createdAt: toISOStringOrNull(row.created_at),
    updatedAt: toISOStringOrNull(row.updated_at),
    sourceDocument:
      row.source_document_id &&
      typeof row.source_document_original_file_name !== "undefined"
      ? {
          id: Number(row.source_document_id),
          originalFileName: row.source_document_original_file_name,
          documentType: row.source_document_type,
          processingStatus: row.source_document_processing_status,
          sourceLabel: row.source_document_source_label,
          uploadedAt: toISOStringOrNull(row.source_document_uploaded_at),
        }
      : null,
  };
};

export const listTaxFactsByUser = async (userId, query = {}) => {
  const normalizedUserId = normalizeTaxUserId(userId);
  const taxYear = normalizeTaxYear(query.taxYear);
  const reviewStatus = normalizeOptionalTaxFactReviewStatus(query.reviewStatus);
  const pagination = normalizePagination(query);
  const whereClauses = ["tf.user_id = $1", "tf.tax_year = $2"];
  const params = [normalizedUserId, taxYear];

  if (reviewStatus) {
    params.push(reviewStatus);
    whereClauses.push(`tf.review_status = $${params.length}`);
  }

  const whereSql = whereClauses.join(" AND ");
  const countResult = await dbQuery(
    `SELECT COUNT(*) AS total
     FROM tax_facts tf
     WHERE ${whereSql}`,
    params,
  );

  params.push(pagination.pageSize, pagination.offset);
  const factsResult = await dbQuery(
    `SELECT
       tf.id,
       tf.tax_year,
       tf.source_document_id,
       tf.fact_type,
       tf.category,
       tf.subcategory,
       tf.payer_name,
       tf.payer_document,
       tf.reference_period,
       tf.currency,
       tf.amount,
       tf.confidence_score,
       tf.metadata_json,
       tf.dedupe_strength,
       tf.review_status,
       tf.conflict_code,
       tf.conflict_message,
       tf.created_at,
       tf.updated_at,
       td.original_file_name AS source_document_original_file_name,
       td.document_type AS source_document_type,
       td.processing_status AS source_document_processing_status,
       td.source_label AS source_document_source_label,
       td.uploaded_at AS source_document_uploaded_at
     FROM tax_facts tf
     LEFT JOIN tax_documents td
       ON td.id = tf.source_document_id
      AND td.user_id = tf.user_id
     WHERE ${whereSql}
     ORDER BY tf.updated_at DESC, tf.id DESC
     LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );

  return {
    items: factsResult.rows.map(mapTaxFactRow),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total: Number(countResult.rows[0]?.total || 0),
  };
};

export const createManualTaxFactByUser = async (userId, payload = {}) => {
  const normalizedUserId = normalizeTaxUserId(userId);
  const taxYear = normalizeTaxYear(payload.taxYear);
  const factType = normalizeTaxFactType(payload.factType);
  const subcategory = normalizeRequiredString(
    payload.subcategory,
    "subcategory",
    MAX_MANUAL_SUBCATEGORY_LENGTH,
  );
  const payerName =
    normalizeOptionalString(payload.payerName, "payerName", MAX_MANUAL_PAYER_NAME_LENGTH) ||
    "Lancamento manual";
  const payerDocument = normalizeDocumentNumber(
    normalizeOptionalString(
      payload.payerDocument,
      "payerDocument",
      MAX_MANUAL_PAYER_DOCUMENT_LENGTH,
    ),
  );
  const referencePeriod = normalizeRequiredString(
    payload.referencePeriod,
    "referencePeriod",
    MAX_MANUAL_REFERENCE_PERIOD_LENGTH,
  );
  const amount = normalizeManualAmount(payload.amount);
  const note = normalizeOptionalString(payload.note, "note", MAX_MANUAL_NOTE_LENGTH);
  const dedupeKey = generateTaxFactDedupeKey({
    userId: normalizedUserId,
    taxYear,
    factType,
    payerDocument,
    referencePeriod,
    amount,
    dedupeDiscriminator: subcategory,
  });

  return withDbTransaction(async (client) => {
    const ownerDocument = await getUserTaxpayerDocument(client, normalizedUserId);
    const duplicateFact = await findExistingStrongFactByDedupeKey(client, normalizedUserId, dedupeKey);
    const metadataJson = buildManualFactMetadata({
      note,
      ownerDocument,
      duplicateOfFactId: duplicateFact ? Number(duplicateFact.id) : null,
      duplicateOfDocumentId:
        duplicateFact &&
        duplicateFact.source_document_id !== null &&
        typeof duplicateFact.source_document_id !== "undefined"
          ? Number(duplicateFact.source_document_id)
          : null,
    });
    const result = await client.query(
      `INSERT INTO tax_facts (
         user_id,
         tax_year,
         source_document_id,
         fact_type,
         category,
         subcategory,
         payer_name,
         payer_document,
         reference_period,
         currency,
         amount,
         confidence_score,
         dedupe_key,
         dedupe_strength,
         metadata_json,
         review_status,
         conflict_code,
         conflict_message
       )
       VALUES (
         $1, $2, NULL, $3, $4, $5, $6, $7, $8, 'BRL',
         $9, $10, $11, $12, $13::jsonb, 'pending', $14, $15
       )
       RETURNING
         id,
         tax_year,
         source_document_id,
         fact_type,
         category,
         subcategory,
         payer_name,
         payer_document,
         reference_period,
         currency,
         amount,
         confidence_score,
         metadata_json,
         dedupe_strength,
         review_status,
         conflict_code,
         conflict_message,
         created_at,
         updated_at`,
      [
        normalizedUserId,
        taxYear,
        factType,
        "manual_entry",
        subcategory,
        payerName,
        payerDocument,
        referencePeriod,
        amount,
        1,
        dedupeKey,
        duplicateFact ? "weak" : "strong",
        JSON.stringify(metadataJson),
        duplicateFact ? TAX_FACT_DUPLICATE_CONFLICT_CODE : null,
        duplicateFact ? TAX_FACT_DUPLICATE_CONFLICT_MESSAGE : null,
      ],
    );

    return {
      fact: mapTaxFactRow(result.rows[0]),
    };
  });
};

export const mapStoredTaxFactRow = mapTaxFactRow;
