import { withDbTransaction } from "../db/index.js";
import { generateTaxFactDedupeKey } from "../domain/tax/tax-fact-normalizer.js";
import {
  createTaxError,
  normalizeBulkTaxReviewAction,
  normalizeTaxFactId,
  normalizeTaxFactType,
  normalizeTaxReviewAction,
  normalizeTaxUserId,
} from "../domain/tax/tax.validation.js";
import { mapStoredTaxFactRow } from "./tax-facts.service.js";

const TAX_FACT_DUPLICATE_CONFLICT_CODE = "TAX_FACT_DUPLICATE";
const TAX_FACT_DUPLICATE_CONFLICT_MESSAGE =
  "Fato potencialmente duplicado com outro documento fiscal do usuario.";
const MAX_REVIEW_NOTE_LENGTH = 500;

const normalizeOptionalReviewNote = (value) => {
  if (typeof value === "undefined" || value === null) {
    return "";
  }

  const normalizedValue = String(value).trim();

  if (!normalizedValue) {
    return "";
  }

  if (normalizedValue.length > MAX_REVIEW_NOTE_LENGTH) {
    throw createTaxError(
      400,
      `note excede o limite de ${MAX_REVIEW_NOTE_LENGTH} caracteres.`,
    );
  }

  return normalizedValue;
};

const normalizeCorrectedPayload = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createTaxError(400, "corrected invalido.");
  }

  return value;
};

const normalizeOptionalStringField = (value, fieldName, maxLength) => {
  if (typeof value === "undefined") {
    return undefined;
  }

  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    throw createTaxError(400, `${fieldName} invalido.`);
  }

  if (normalizedValue.length > maxLength) {
    throw createTaxError(400, `${fieldName} excede o limite de ${maxLength} caracteres.`);
  }

  return normalizedValue;
};

const normalizeOptionalAmount = (value) => {
  if (typeof value === "undefined") {
    return undefined;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw createTaxError(400, "amount invalido.");
  }

  return Number(parsedValue.toFixed(2));
};

const normalizeOptionalMetadata = (value) => {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createTaxError(400, "metadata invalido.");
  }

  return value;
};

const normalizeTaxFactIds = (values) => {
  if (!Array.isArray(values) || values.length === 0) {
    throw createTaxError(400, "factIds invalido.");
  }

  return [...new Set(values.map((value) => normalizeTaxFactId(value, "factId")))];
};

const buildFactIdsQuery = (factIds, firstParamIndex = 2) =>
  factIds.map((_, index) => `$${firstParamIndex + index}`).join(", ");

const normalizeReviewCorrection = (currentFact, corrected) => {
  const normalizedFact = {
    factType:
      typeof corrected.factType === "undefined"
        ? currentFact.fact_type
        : normalizeTaxFactType(corrected.factType),
    category:
      typeof corrected.category === "undefined"
        ? currentFact.category
        : normalizeOptionalStringField(corrected.category, "category", 120),
    subcategory:
      typeof corrected.subcategory === "undefined"
        ? currentFact.subcategory
        : normalizeOptionalStringField(corrected.subcategory, "subcategory", 120),
    payerName:
      typeof corrected.payerName === "undefined"
        ? currentFact.payer_name
        : normalizeOptionalStringField(corrected.payerName, "payerName", 160),
    payerDocument:
      typeof corrected.payerDocument === "undefined"
        ? currentFact.payer_document
        : normalizeOptionalStringField(corrected.payerDocument, "payerDocument", 40).replace(
            /\D/g,
            "",
          ),
    referencePeriod:
      typeof corrected.referencePeriod === "undefined"
        ? currentFact.reference_period
        : normalizeOptionalStringField(corrected.referencePeriod, "referencePeriod", 32),
    amount:
      typeof corrected.amount === "undefined"
        ? Number(currentFact.amount)
        : normalizeOptionalAmount(corrected.amount),
    metadata:
      typeof corrected.metadata === "undefined"
        ? (currentFact.metadata_json && typeof currentFact.metadata_json === "object"
            ? currentFact.metadata_json
            : {})
        : normalizeOptionalMetadata(corrected.metadata),
  };

  return normalizedFact;
};

const mapTaxFactSnapshot = (row) => ({
  id: Number(row.id),
  userId: Number(row.user_id),
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
  dedupeKey: row.dedupe_key,
  dedupeStrength: row.dedupe_strength,
  reviewStatus: row.review_status,
  conflictCode: row.conflict_code,
  conflictMessage: row.conflict_message,
  metadata: row.metadata_json && typeof row.metadata_json === "object" ? row.metadata_json : {},
});

const getFactByIdForUser = async (client, userId, factId) => {
  const result = await client.query(
    `SELECT
       id,
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
       conflict_message,
       created_at,
       updated_at
     FROM tax_facts
     WHERE id = $1
       AND user_id = $2
     LIMIT 1`,
    [factId, userId],
  );

  return result.rows[0] || null;
};

const getFactsByIdsForUser = async (client, userId, factIds) => {
  const factIdsSql = buildFactIdsQuery(factIds);
  const result = await client.query(
    `SELECT
       id,
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
       conflict_message,
       created_at,
       updated_at
     FROM tax_facts
     WHERE user_id = $1
       AND id IN (${factIdsSql})
     ORDER BY id ASC`,
    [userId, ...factIds],
  );

  return result.rows;
};

const insertTaxReview = async ({
  client,
  factId,
  userId,
  reviewAction,
  previousPayload,
  correctedPayload,
  note,
}) => {
  await client.query(
    `INSERT INTO tax_reviews (
       tax_fact_id,
       user_id,
       review_action,
       previous_payload_json,
       corrected_payload_json,
       note
     )
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)`,
    [
      factId,
      userId,
      reviewAction,
      JSON.stringify(previousPayload),
      JSON.stringify(correctedPayload),
      note,
    ],
  );
};

const resolveCorrectionConflictState = async ({
  client,
  currentFactId,
  currentFact,
  correctedFact,
}) => {
  const dedupeKey = generateTaxFactDedupeKey({
    userId: currentFact.user_id,
    taxYear: currentFact.tax_year,
    factType: correctedFact.factType,
    payerDocument: correctedFact.payerDocument,
    referencePeriod: correctedFact.referencePeriod,
    amount: correctedFact.amount,
  });
  const conflictingFactResult = await client.query(
    `SELECT id, source_document_id
     FROM tax_facts
     WHERE user_id = $1
       AND dedupe_strength = 'strong'
       AND dedupe_key = $2
       AND id <> $3
     LIMIT 1`,
    [currentFact.user_id, dedupeKey, currentFactId],
  );
  const conflictingFact = conflictingFactResult.rows[0] || null;

  return {
    dedupeKey,
    dedupeStrength: conflictingFact ? "weak" : "strong",
    conflictCode: conflictingFact ? TAX_FACT_DUPLICATE_CONFLICT_CODE : null,
    conflictMessage: conflictingFact ? TAX_FACT_DUPLICATE_CONFLICT_MESSAGE : null,
    duplicateOfFactId: conflictingFact ? Number(conflictingFact.id) : null,
    duplicateOfDocumentId:
      conflictingFact &&
      conflictingFact.source_document_id !== null &&
      typeof conflictingFact.source_document_id !== "undefined"
        ? Number(conflictingFact.source_document_id)
        : null,
  };
};

const updateReviewedFact = async ({
  client,
  factId,
  userId,
  reviewStatus,
  currentFact,
  correctedPayload,
}) => {
  if (!correctedPayload) {
    const result = await client.query(
      `UPDATE tax_facts
       SET review_status = $3,
           updated_at = NOW()
       WHERE id = $1
         AND user_id = $2
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
      [factId, userId, reviewStatus],
    );

    return result.rows[0];
  }

  const conflictState = await resolveCorrectionConflictState({
    client,
    currentFactId: factId,
    currentFact,
    correctedFact: correctedPayload,
  });
  const metadata = {
    ...(correctedPayload.metadata || {}),
  };

  if (conflictState.duplicateOfFactId) {
    metadata.duplicateOfFactId = conflictState.duplicateOfFactId;
  } else {
    delete metadata.duplicateOfFactId;
  }

  if (conflictState.duplicateOfDocumentId) {
    metadata.duplicateOfDocumentId = conflictState.duplicateOfDocumentId;
  } else {
    delete metadata.duplicateOfDocumentId;
  }

  const result = await client.query(
    `UPDATE tax_facts
     SET fact_type = $3,
         category = $4,
         subcategory = $5,
         payer_name = $6,
         payer_document = $7,
         reference_period = $8,
         amount = $9,
         metadata_json = $10::jsonb,
         dedupe_key = $11,
         dedupe_strength = $12,
         review_status = $13,
         conflict_code = $14,
         conflict_message = $15,
         updated_at = NOW()
     WHERE id = $1
       AND user_id = $2
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
      factId,
      userId,
      correctedPayload.factType,
      correctedPayload.category,
      correctedPayload.subcategory,
      correctedPayload.payerName,
      correctedPayload.payerDocument,
      correctedPayload.referencePeriod,
      correctedPayload.amount,
      JSON.stringify(metadata),
      conflictState.dedupeKey,
      conflictState.dedupeStrength,
      reviewStatus,
      conflictState.conflictCode,
      conflictState.conflictMessage,
    ],
  );

  return result.rows[0];
};

export const reviewTaxFactByUser = async (userId, factId, payload = {}) => {
  const normalizedUserId = normalizeTaxUserId(userId);
  const normalizedFactId = normalizeTaxFactId(factId);
  const action = normalizeTaxReviewAction(payload.action);
  const note = normalizeOptionalReviewNote(payload.note);

  return withDbTransaction(async (client) => {
    const currentFact = await getFactByIdForUser(client, normalizedUserId, normalizedFactId);

    if (!currentFact) {
      throw createTaxError(404, "Fato fiscal nao encontrado.");
    }

    const previousPayload = mapTaxFactSnapshot(currentFact);
    const correctedPayload =
      action === "correct"
        ? normalizeReviewCorrection(currentFact, normalizeCorrectedPayload(payload.corrected))
        : null;
    const updatedFact = await updateReviewedFact({
      client,
      factId: normalizedFactId,
      userId: normalizedUserId,
      reviewStatus:
        action === "approve" ? "approved" : action === "reject" ? "rejected" : "corrected",
      currentFact,
      correctedPayload,
    });
    const correctedSnapshot = correctedPayload
      ? mapTaxFactSnapshot(updatedFact)
      : {};

    await insertTaxReview({
      client,
      factId: normalizedFactId,
      userId: normalizedUserId,
      reviewAction: action,
      previousPayload,
      correctedPayload: correctedSnapshot,
      note,
    });

    return {
      fact: mapStoredTaxFactRow(updatedFact),
    };
  });
};

export const bulkApproveTaxFactsByUser = async (userId, payload = {}) => {
  const normalizedUserId = normalizeTaxUserId(userId);
  normalizeBulkTaxReviewAction(payload.action);
  const note = normalizeOptionalReviewNote(payload.note);
  const factIds = normalizeTaxFactIds(payload.factIds);

  return withDbTransaction(async (client) => {
    const facts = await getFactsByIdsForUser(client, normalizedUserId, factIds);

    if (facts.length !== factIds.length) {
      throw createTaxError(404, "Um ou mais fatos fiscais nao foram encontrados.");
    }

    const taxYears = [...new Set(facts.map((fact) => Number(fact.tax_year)))];

    if (taxYears.length !== 1) {
      throw createTaxError(
        400,
        "Aprovacao em lote exige fatos do mesmo exercicio fiscal (taxYear).",
      );
    }

    const factIdsSql = buildFactIdsQuery(factIds);
    const updateResult = await client.query(
      `UPDATE tax_facts
       SET review_status = 'approved',
           updated_at = NOW()
       WHERE user_id = $1
         AND id IN (${factIdsSql})`,
      [normalizedUserId, ...factIds],
    );

    for (const fact of facts) {
      await insertTaxReview({
        client,
        factId: Number(fact.id),
        userId: normalizedUserId,
        reviewAction: "bulk_approve",
        previousPayload: mapTaxFactSnapshot(fact),
        correctedPayload: {},
        note,
      });
    }

    return {
      updatedCount: Number(updateResult.rowCount || 0),
      taxYear: taxYears[0],
    };
  });
};
