import { dbQuery } from "../db/index.js";
import { normalizeTaxUserId, normalizeTaxYear, toISOStringOrNull } from "../domain/tax/tax.validation.js";

const buildDefaultSummaryPayload = () => ({
  mustDeclare: null,
  obligationReasons: [],
  annualTaxableIncome: 0,
  annualExemptIncome: 0,
  annualExclusiveIncome: 0,
  annualWithheldTax: 0,
  totalLegalDeductions: 0,
  simplifiedDiscountUsed: 0,
  bestMethod: null,
  estimatedAnnualTax: null,
  warnings: [],
});

const normalizeStoredSummary = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
};

const getSourceCountsByUserAndYear = async (userId, taxYear) => {
  const documentsResult = await dbQuery(
    `SELECT COUNT(*) AS total
     FROM tax_documents
     WHERE user_id = $1
       AND tax_year = $2`,
    [userId, taxYear],
  );
  const factsResult = await dbQuery(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN review_status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
       SUM(CASE WHEN review_status IN ('approved', 'corrected') THEN 1 ELSE 0 END) AS approved_count
     FROM tax_facts
     WHERE user_id = $1
       AND tax_year = $2`,
    [userId, taxYear],
  );

  return {
    documents: Number(documentsResult.rows[0]?.total || 0),
    factsPending: Number(factsResult.rows[0]?.pending_count || 0),
    factsApproved: Number(factsResult.rows[0]?.approved_count || 0),
  };
};

export const getTaxSummaryByYear = async (userId, taxYearValue) => {
  const normalizedUserId = normalizeTaxUserId(userId);
  const taxYear = normalizeTaxYear(taxYearValue);
  const sourceCounts = await getSourceCountsByUserAndYear(normalizedUserId, taxYear);
  const summaryResult = await dbQuery(
    `SELECT snapshot_version, summary_json, generated_at
     FROM tax_summaries
     WHERE user_id = $1
       AND tax_year = $2
     ORDER BY snapshot_version DESC
     LIMIT 1`,
    [normalizedUserId, taxYear],
  );
  const latestSummary = summaryResult.rows[0];
  const summaryPayload = {
    ...buildDefaultSummaryPayload(),
    ...normalizeStoredSummary(latestSummary?.summary_json),
  };

  return {
    taxYear,
    status: latestSummary ? "generated" : "not_generated",
    snapshotVersion: latestSummary ? Number(latestSummary.snapshot_version) : null,
    ...summaryPayload,
    sourceCounts,
    generatedAt: toISOStringOrNull(latestSummary?.generated_at),
  };
};
