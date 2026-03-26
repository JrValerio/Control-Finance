import { dbQuery, withDbTransaction } from "../db/index.js";
import { runTaxExtractorForDocument } from "../domain/tax/tax-document-extractors.js";
import { createTaxError, normalizeTaxUserId } from "../domain/tax/tax.validation.js";
import { classifyStoredTaxDocument } from "./tax-classification.service.js";
import { getTaxDocumentByIdForUser } from "./tax-documents.service.js";

const CLASSIFIER_ONLY_EXTRACTOR_NAME = "classifier-only";
const CLASSIFIER_ONLY_EXTRACTOR_VERSION = "1.0.0";

const normalizeDocumentId = (value) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw createTaxError(400, "documentId invalido.");
  }

  return parsedValue;
};

const getProcessableTaxDocumentByIdForUser = async (userId, documentId) => {
  const result = await dbQuery(
    `SELECT
       id,
       user_id,
       tax_year,
       original_file_name,
       stored_file_name,
       storage_key,
       mime_type,
       byte_size,
       sha256,
       document_type,
       processing_status,
       source_label,
       source_hint,
       uploaded_at
     FROM tax_documents
     WHERE id = $1
       AND user_id = $2
     LIMIT 1`,
    [documentId, userId],
  );

  return result.rows[0] || null;
};

const persistSuccessfulProcessing = async ({
  userId,
  documentId,
  classification,
  extractorResult,
  warnings,
}) => {
  const processingStatus = extractorResult ? "extracted" : "classified";
  const extractorName = extractorResult?.extractorName || CLASSIFIER_ONLY_EXTRACTOR_NAME;
  const extractorVersion =
    extractorResult?.extractorVersion || CLASSIFIER_ONLY_EXTRACTOR_VERSION;
  const rawJson = extractorResult
    ? {
        classification: classification.classificationPayload,
        extraction: extractorResult.payload,
      }
    : {
        classification: classification.classificationPayload,
      };

  await withDbTransaction(async (client) => {
    await client.query(
      `INSERT INTO tax_document_extractions (
         document_id,
         extractor_name,
         extractor_version,
         classification,
         confidence_score,
         raw_json,
         warnings_json
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [
        documentId,
        extractorName,
        extractorVersion,
        classification.documentType,
        classification.confidenceScore,
        JSON.stringify(rawJson),
        JSON.stringify(warnings),
      ],
    );

    await client.query(
      `UPDATE tax_documents
       SET document_type = $3,
           processing_status = $4,
           error_code = NULL,
           error_message = NULL,
           classified_at = NOW(),
           extracted_at = $5
       WHERE id = $1
         AND user_id = $2`,
      [
        documentId,
        userId,
        classification.documentType,
        processingStatus,
        extractorResult ? new Date().toISOString() : null,
      ],
    );
  });
};

const persistFailedProcessing = async ({
  userId,
  documentId,
  error,
}) => {
  await dbQuery(
    `UPDATE tax_documents
     SET processing_status = 'failed',
         error_code = 'TAX_DOCUMENT_PROCESSING_FAILED',
         error_message = $3
     WHERE id = $1
       AND user_id = $2`,
    [
      documentId,
      userId,
      typeof error?.message === "string" && error.message.trim()
        ? error.message.trim().slice(0, 500)
        : "Falha ao processar documento fiscal.",
    ],
  );
};

export const processTaxDocumentByIdForUser = async (userId, documentId) => {
  const normalizedUserId = normalizeTaxUserId(userId);
  const normalizedDocumentId = normalizeDocumentId(documentId);
  const document = await getProcessableTaxDocumentByIdForUser(
    normalizedUserId,
    normalizedDocumentId,
  );

  if (!document) {
    throw createTaxError(404, "Documento fiscal nao encontrado.");
  }

  try {
    const classification = await classifyStoredTaxDocument(document);
    const extractorResult = runTaxExtractorForDocument({
      documentType: classification.documentType,
      text: classification.text,
      classification,
    });
    const warnings = [...classification.warnings, ...(extractorResult?.warnings || [])];

    await persistSuccessfulProcessing({
      userId: normalizedUserId,
      documentId: normalizedDocumentId,
      classification,
      extractorResult,
      warnings,
    });

    return getTaxDocumentByIdForUser(normalizedUserId, normalizedDocumentId);
  } catch (error) {
    await persistFailedProcessing({
      userId: normalizedUserId,
      documentId: normalizedDocumentId,
      error,
    });
    throw error;
  }
};
