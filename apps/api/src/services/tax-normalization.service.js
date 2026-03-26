import { withDbTransaction } from "../db/index.js";
import { normalizeTaxExtractionToFacts } from "../domain/tax/tax-fact-normalizer.js";
import { createTaxError, normalizeTaxUserId } from "../domain/tax/tax.validation.js";

const DUPLICATE_FACT_CONFLICT_CODE = "TAX_FACT_DUPLICATE";

const buildDuplicateConflictMessage = () =>
  "Fato potencialmente duplicado com outro documento fiscal do usuario.";

const buildFactIdentityKey = (fact) =>
  [
    String(fact.dedupeKey || fact.dedupe_key || ""),
    String(fact.dedupeStrength || fact.dedupe_strength || ""),
    String(fact.factType || fact.fact_type || ""),
    String(fact.subcategory || ""),
    Number(fact.amount || 0).toFixed(2),
    String(fact.referencePeriod || fact.reference_period || ""),
    String(fact.conflictCode || fact.conflict_code || ""),
  ].join("|");

const buildExistingStrongFactsQuery = (dedupeKeys) => {
  const placeholders = dedupeKeys.map((_, index) => `$${index + 2}`).join(", ");

  return {
    text: `SELECT
             id,
             source_document_id,
             dedupe_key
           FROM tax_facts
           WHERE user_id = $1
             AND dedupe_strength = 'strong'
             AND dedupe_key IN (${placeholders})`,
    params: dedupeKeys,
  };
};

const insertTaxFact = async (client, fact) => {
  await client.query(
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
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11, $12, $13, $14, $15::jsonb, $16, $17, $18
     )`,
    [
      fact.userId,
      fact.taxYear,
      fact.sourceDocumentId,
      fact.factType,
      fact.category,
      fact.subcategory,
      fact.payerName,
      fact.payerDocument,
      fact.referencePeriod,
      fact.currency,
      fact.amount,
      fact.confidenceScore,
      fact.dedupeKey,
      fact.dedupeStrength,
      JSON.stringify(fact.metadataJson || {}),
      fact.reviewStatus,
      fact.conflictCode,
      fact.conflictMessage,
    ],
  );
};

const buildConflictFact = (fact, existingStrongFact) => ({
  ...fact,
  dedupeStrength: "weak",
  conflictCode: DUPLICATE_FACT_CONFLICT_CODE,
  conflictMessage: buildDuplicateConflictMessage(),
  metadataJson: {
    ...(fact.metadataJson || {}),
    duplicateOfFactId: Number(existingStrongFact.id),
    duplicateOfDocumentId:
      existingStrongFact.source_document_id === null ||
      typeof existingStrongFact.source_document_id === "undefined"
        ? null
        : Number(existingStrongFact.source_document_id),
  },
});

const applyPreviousReviewState = (fact, previousFactsByIdentity) => {
  const previousFact = previousFactsByIdentity.get(buildFactIdentityKey(fact));

  if (!previousFact) {
    return fact;
  }

  return {
    ...fact,
    reviewStatus: previousFact.review_status,
  };
};

export const buildNormalizedFactsFromExtraction = ({
  userId,
  document,
  extraction,
}) =>
  normalizeTaxExtractionToFacts({
    userId,
    document,
    extraction,
  });

export const normalizeProcessedTaxDocument = async ({
  userId,
  document,
  extraction,
  precomputedFacts = null,
}) => {
  const normalizedUserId = normalizeTaxUserId(userId);

  if (!document?.id || !document?.taxYear || !document?.documentType) {
    throw createTaxError(400, "Documento fiscal invalido para normalizacao.");
  }

  const normalizedFacts = Array.isArray(precomputedFacts)
    ? precomputedFacts
    : buildNormalizedFactsFromExtraction({
        userId: normalizedUserId,
        document,
        extraction,
      });
  const dedupeKeys = [...new Set(normalizedFacts.map((fact) => fact.dedupeKey).filter(Boolean))];

  await withDbTransaction(async (client) => {
    const existingDocumentFactsResult = await client.query(
      `SELECT
         fact_type,
         subcategory,
         amount,
         reference_period,
         dedupe_key,
         dedupe_strength,
         review_status,
         conflict_code
       FROM tax_facts
       WHERE user_id = $1
         AND source_document_id = $2`,
      [normalizedUserId, document.id],
    );
    const previousFactsByIdentity = existingDocumentFactsResult.rows.reduce((accumulator, row) => {
      accumulator.set(buildFactIdentityKey(row), row);
      return accumulator;
    }, new Map());

    // Reprocessar um documento recria integralmente os fatos do mesmo
    // source_document_id, preservando o review_status quando a identidade
    // logica do fato continua a mesma no pipeline novo.
    await client.query(
      `DELETE FROM tax_facts
       WHERE user_id = $1
         AND source_document_id = $2`,
      [normalizedUserId, document.id],
    );

    let existingStrongFactsByKey = new Map();

    if (dedupeKeys.length > 0) {
      const existingFactsQuery = buildExistingStrongFactsQuery(dedupeKeys);
      const existingFactsResult = await client.query(existingFactsQuery.text, [
        normalizedUserId,
        ...existingFactsQuery.params,
      ]);

      existingStrongFactsByKey = existingFactsResult.rows.reduce((accumulator, row) => {
        accumulator.set(row.dedupe_key, row);
        return accumulator;
      }, new Map());
    }

    for (const fact of normalizedFacts) {
      const existingStrongFact = existingStrongFactsByKey.get(fact.dedupeKey);

      if (existingStrongFact) {
        await insertTaxFact(
          client,
          applyPreviousReviewState(
            buildConflictFact(fact, existingStrongFact),
            previousFactsByIdentity,
          ),
        );
        continue;
      }

      await insertTaxFact(client, applyPreviousReviewState(fact, previousFactsByIdentity));
    }

    await client.query(
      `UPDATE tax_documents
       SET processing_status = 'normalized',
           normalized_at = NOW(),
           error_code = NULL,
           error_message = NULL
       WHERE id = $1
         AND user_id = $2`,
      [document.id, normalizedUserId],
    );
  });

  return {
    totalFactsDetected: normalizedFacts.length,
  };
};
