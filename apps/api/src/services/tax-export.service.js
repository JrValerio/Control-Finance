import { createHash } from "node:crypto";
import { dbQuery } from "../db/index.js";
import { createTaxError, normalizeTaxUserId, normalizeTaxYear, toISOStringOrNull } from "../domain/tax/tax.validation.js";
import { getReviewedTaxFactsSelectionByUserAndYear } from "./tax-obligation.service.js";

const TAX_EXPORT_ENGINE_VERSION = "irpf-mvp-v1";

const normalizeJsonObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
};

const normalizeTaxExportFormat = (value) => {
  const normalizedValue = String(value || "").trim().toLowerCase();

  if (normalizedValue !== "json" && normalizedValue !== "csv") {
    throw createTaxError(400, "format invalido.");
  }

  return normalizedValue;
};

const getLatestStoredSummaryRow = async (userId, taxYear) => {
  const result = await dbQuery(
    `SELECT snapshot_version, summary_json, source_counts_json, generated_at
     FROM tax_summaries
     WHERE user_id = $1
       AND tax_year = $2
     ORDER BY snapshot_version DESC
     LIMIT 1`,
    [userId, taxYear],
  );

  return result.rows[0] || null;
};

const mapFactRowToExportPayload = (row) => ({
    factId: Number(row.id),
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
    amount: Number(row.amount),
    currency: row.currency,
    reviewStatus: row.review_status,
  });

const escapeCsvValue = (value) => {
  const normalizedValue = value == null ? "" : String(value);

  if (/[",\n]/.test(normalizedValue)) {
    return `"${normalizedValue.replace(/"/g, '""')}"`;
  }

  return normalizedValue;
};

const buildCsvContent = (facts) => {
  const header = [
    "factId",
    "factType",
    "category",
    "subcategory",
    "payerName",
    "payerDocument",
    "referencePeriod",
    "amount",
    "currency",
    "reviewStatus",
    "sourceDocumentId",
  ];

  const lines = facts.map((fact) =>
    [
      fact.factId,
      fact.factType,
      fact.category,
      fact.subcategory,
      fact.payerName,
      fact.payerDocument,
      fact.referencePeriod,
      fact.amount.toFixed(2),
      fact.currency,
      fact.reviewStatus,
      fact.sourceDocumentId,
    ]
      .map(escapeCsvValue)
      .join(","),
  );

  return [header.join(","), ...lines].join("\n");
};

const buildCanonicalExportPayload = ({ taxYear, latestSummary, summary, facts }) => ({
  taxYear,
  exerciseYear: taxYear,
  calendarYear: taxYear - 1,
  summarySnapshotVersion: Number(latestSummary.snapshot_version),
  generatedAt: toISOStringOrNull(latestSummary.generated_at),
  summary,
  facts,
});

export const exportTaxDossierByYear = async (userId, taxYearValue, formatValue) => {
  const normalizedUserId = normalizeTaxUserId(userId);
  const taxYear = normalizeTaxYear(taxYearValue);
  const format = normalizeTaxExportFormat(formatValue);
  const latestSummary = await getLatestStoredSummaryRow(normalizedUserId, taxYear);

  if (!latestSummary) {
    throw createTaxError(
      409,
      "Resumo fiscal ainda nao foi gerado para este exercicio.",
      "TAX_SUMMARY_NOT_GENERATED",
    );
  }

  const factSelection = await getReviewedTaxFactsSelectionByUserAndYear(normalizedUserId, taxYear);
  const facts = [...factSelection.includedFacts]
    .sort((leftFact, rightFact) => Number(leftFact.id) - Number(rightFact.id))
    .map(mapFactRowToExportPayload);
  const summary = {
    taxYear,
    exerciseYear: taxYear,
    calendarYear: taxYear - 1,
    snapshotVersion: Number(latestSummary.snapshot_version),
    generatedAt: toISOStringOrNull(latestSummary.generated_at),
    ...normalizeJsonObject(latestSummary.summary_json),
    sourceCounts: normalizeJsonObject(latestSummary.source_counts_json),
  };
  const canonicalExportPayload = buildCanonicalExportPayload({
    taxYear,
    latestSummary,
    summary,
    facts,
  });
  const dataHash = createHash("sha256")
    .update(JSON.stringify(canonicalExportPayload))
    .digest("hex");
  const manifest = {
    taxYear,
    exerciseYear: taxYear,
    calendarYear: taxYear - 1,
    generatedAt: toISOStringOrNull(latestSummary.generated_at),
    summarySnapshotVersion: Number(latestSummary.snapshot_version),
    factsIncluded: facts.length,
    engineVersion: TAX_EXPORT_ENGINE_VERSION,
    dataHash,
  };

  if (format === "json") {
    return {
      format,
      fileName: `dossie-fiscal-${taxYear}.json`,
      contentType: "application/json; charset=utf-8",
      manifest,
      content: JSON.stringify(
        {
          manifest,
          summary,
          facts,
        },
        null,
        2,
      ),
    };
  }

  return {
    format,
    fileName: `dossie-fiscal-${taxYear}.csv`,
    contentType: "text/csv; charset=utf-8",
    manifest,
    content: buildCsvContent(facts),
  };
};
