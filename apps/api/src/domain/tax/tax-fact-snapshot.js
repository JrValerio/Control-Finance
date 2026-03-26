import { toISOStringOrNull } from "./tax.validation.js";

const normalizeJsonObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
};

export const mapStoredTaxFactToSnapshotPayload = (row) => ({
  factId: Number(row.id),
  taxYear: Number(row.tax_year),
  sourceDocumentId:
    row.source_document_id === null || typeof row.source_document_id === "undefined"
      ? null
      : Number(row.source_document_id),
  factType: String(row.fact_type || ""),
  category: String(row.category || ""),
  subcategory: String(row.subcategory || ""),
  payerName: String(row.payer_name || ""),
  payerDocument: String(row.payer_document || ""),
  referencePeriod: String(row.reference_period || ""),
  amount: Number(row.amount || 0),
  currency: String(row.currency || "BRL"),
  reviewStatus: String(row.review_status || ""),
  metadata: normalizeJsonObject(row.metadata_json),
  updatedAt: toISOStringOrNull(row.updated_at),
});

export const normalizeStoredFactsSnapshot = (value) =>
  Array.isArray(value)
    ? value
        .filter((item) => item && typeof item === "object" && !Array.isArray(item))
        .map((item) => ({
          factId: Number(item.factId || 0),
          taxYear: Number(item.taxYear || 0),
          sourceDocumentId:
            item.sourceDocumentId === null || typeof item.sourceDocumentId === "undefined"
              ? null
              : Number(item.sourceDocumentId),
          factType: String(item.factType || ""),
          category: String(item.category || ""),
          subcategory: String(item.subcategory || ""),
          payerName: String(item.payerName || ""),
          payerDocument: String(item.payerDocument || ""),
          referencePeriod: String(item.referencePeriod || ""),
          amount: Number(item.amount || 0),
          currency: String(item.currency || "BRL"),
          reviewStatus: String(item.reviewStatus || ""),
          metadata: normalizeJsonObject(item.metadata),
          updatedAt: toISOStringOrNull(item.updatedAt),
        }))
    : [];
