import { dbQuery } from "../db/index.js";
import {
  normalizeOptionalTaxFactReviewStatus,
  normalizePagination,
  normalizeTaxUserId,
  normalizeTaxYear,
  toISOStringOrNull,
} from "../domain/tax/tax.validation.js";

const normalizeJsonObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
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

export const mapStoredTaxFactRow = mapTaxFactRow;
