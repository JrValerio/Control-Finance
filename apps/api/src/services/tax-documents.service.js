import { dbQuery } from "../db/index.js";
import {
  normalizeOptionalDocumentProcessingStatus,
  normalizePagination,
  normalizeTaxUserId,
  normalizeTaxYear,
  toISOStringOrNull,
} from "../domain/tax/tax.validation.js";

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
