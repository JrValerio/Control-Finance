import { dbQuery, withDbTransaction } from "../db/index.js";
import { calculateTaxObligation, summarizeReviewedTaxFacts } from "../domain/tax/tax-obligation.calculator.js";
import { mapStoredTaxFactToSnapshotPayload } from "../domain/tax/tax-fact-snapshot.js";
import {
  calculateAnnualProgressiveTax,
  calculateSimplifiedDiscount,
} from "../domain/tax/tax-rules.engine.js";
import { normalizeTaxUserId, normalizeTaxYear, toISOStringOrNull } from "../domain/tax/tax.validation.js";
import { getReviewedTaxFactsSelectionByUserAndYear } from "./tax-obligation.service.js";
import { requireActiveTaxRuleConfigByYear } from "./tax-rules.service.js";

const DUPLICATE_FACT_CONFLICT_CODE = "TAX_FACT_DUPLICATE";
const TAXPAYER_CPF_MISMATCH_WARNING_CODE = "TAXPAYER_CPF_MISMATCH_EXCLUDED";

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

const normalizeMoney = (value) => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return 0;
  }

  return Number(parsedValue.toFixed(2));
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

const buildSummaryWarnings = ({ reviewedFacts, sourceCounts, excludedFactsCount }) => {
  const warnings = [];

  if (sourceCounts.factsPending > 0) {
    warnings.push({
      code: "PENDING_FACTS_EXCLUDED",
      message: "Ha fatos fiscais pendentes de revisao e eles nao entram no resumo anual.",
    });
  }

  if (reviewedFacts.some((fact) => fact.conflict_code === DUPLICATE_FACT_CONFLICT_CODE)) {
    warnings.push({
      code: "DUPLICATE_FACTS_INCLUDED",
      message:
        "Ha fatos aprovados ou corrigidos marcados como potencialmente duplicados. Revise antes de declarar.",
    });
  }

  if (Number(excludedFactsCount || 0) > 0) {
    warnings.push({
      code: TAXPAYER_CPF_MISMATCH_WARNING_CODE,
      message:
        Number(excludedFactsCount) === 1
          ? "Ha 1 fato revisado com CPF divergente do titular cadastrado e ele ficou fora do resumo anual."
          : `Ha ${Number(excludedFactsCount)} fatos revisados com CPF divergente do titular cadastrado e eles ficaram fora do resumo anual.`,
    });
  }

  return warnings;
};

const buildCalculatedSummaryPayload = ({
  reviewedFacts,
  excludedFactsCount,
  sourceCounts,
  activeRuleConfig,
}) => {
  const totals = summarizeReviewedTaxFacts(reviewedFacts);
  const obligation = calculateTaxObligation({
    totals,
    obligationRules: activeRuleConfig.ruleSets.obligation?.rules,
  });
  const annualTableRules = activeRuleConfig.ruleSets.annual_table?.rules || {};
  const deductionLimitRules = activeRuleConfig.ruleSets.deduction_limits?.rules || {};
  const comparisonRules = activeRuleConfig.ruleSets.comparison_logic?.rules || {};
  const legalBaseAmount = Math.max(
    normalizeMoney(totals.annualTaxableIncome - totals.totalLegalDeductions),
    0,
  );
  const simplifiedDiscountUsed = calculateSimplifiedDiscount({
    annualTaxableIncome: totals.annualTaxableIncome,
    comparisonRules,
    deductionLimitRules,
  });
  const simplifiedBaseAmount = Math.max(
    normalizeMoney(totals.annualTaxableIncome - simplifiedDiscountUsed),
    0,
  );
  const annualTaxUsingLegalDeductions = calculateAnnualProgressiveTax({
    baseAmount: legalBaseAmount,
    annualTableRules,
  });
  const annualTaxUsingSimplifiedDiscount = calculateAnnualProgressiveTax({
    baseAmount: simplifiedBaseAmount,
    annualTableRules,
  });
  const bestMethod =
    annualTaxUsingLegalDeductions < annualTaxUsingSimplifiedDiscount
      ? "legal_deductions"
      : "simplified_discount";

  return {
    mustDeclare: obligation.mustDeclare,
    obligationReasons: obligation.reasons.map((reason) => reason.code),
    annualTaxableIncome: totals.annualTaxableIncome,
    annualExemptIncome: totals.annualExemptIncome,
    annualExclusiveIncome: totals.annualExclusiveIncome,
    annualWithheldTax: totals.annualWithheldTax,
    totalLegalDeductions: totals.totalLegalDeductions,
    simplifiedDiscountUsed,
    bestMethod,
    estimatedAnnualTax:
      bestMethod === "legal_deductions"
        ? annualTaxUsingLegalDeductions
        : annualTaxUsingSimplifiedDiscount,
    warnings: buildSummaryWarnings({
      reviewedFacts,
      sourceCounts,
      excludedFactsCount,
    }),
  };
};

const buildCalculatedSummaryStateByYear = async (normalizedUserId, taxYear) => {
  const activeRuleConfig = await requireActiveTaxRuleConfigByYear(taxYear);
  const sourceCounts = await getSourceCountsByUserAndYear(normalizedUserId, taxYear);
  const factSelection = await getReviewedTaxFactsSelectionByUserAndYear(normalizedUserId, taxYear);
  const summaryPayload = buildCalculatedSummaryPayload({
    reviewedFacts: factSelection.includedFacts,
    excludedFactsCount: factSelection.excludedFacts.length,
    sourceCounts,
    activeRuleConfig,
  });

  return {
    activeRuleConfig,
    sourceCounts,
    factSelection,
    summaryPayload,
  };
};

const getLatestStoredSummaryRow = async (userId, taxYear) => {
  const result = await dbQuery(
    `SELECT snapshot_version, summary_json, source_counts_json, facts_json, generated_at
     FROM tax_summaries
     WHERE user_id = $1
       AND tax_year = $2
     ORDER BY snapshot_version DESC
     LIMIT 1`,
    [userId, taxYear],
  );

  return result.rows[0] || null;
};

export const getTaxSummaryByYear = async (userId, taxYearValue) => {
  const normalizedUserId = normalizeTaxUserId(userId);
  const taxYear = normalizeTaxYear(taxYearValue);
  const activeRuleConfig = await requireActiveTaxRuleConfigByYear(taxYear);
  const sourceCounts = await getSourceCountsByUserAndYear(normalizedUserId, taxYear);
  const latestSummary = await getLatestStoredSummaryRow(normalizedUserId, taxYear);
  const summaryPayload = {
    ...buildDefaultSummaryPayload(),
    ...normalizeStoredSummary(latestSummary?.summary_json),
  };

  return {
    taxYear,
    exerciseYear: activeRuleConfig.exerciseYear,
    calendarYear: activeRuleConfig.calendarYear,
    status: latestSummary ? "generated" : "not_generated",
    snapshotVersion: latestSummary ? Number(latestSummary.snapshot_version) : null,
    ...summaryPayload,
    sourceCounts,
    generatedAt: toISOStringOrNull(latestSummary?.generated_at),
  };
};

export const previewTaxSummaryByYear = async (userId, taxYearValue) => {
  const normalizedUserId = normalizeTaxUserId(userId);
  const taxYear = normalizeTaxYear(taxYearValue);
  const { activeRuleConfig, sourceCounts, summaryPayload } = await buildCalculatedSummaryStateByYear(
    normalizedUserId,
    taxYear,
  );

  return {
    taxYear,
    exerciseYear: activeRuleConfig.exerciseYear,
    calendarYear: activeRuleConfig.calendarYear,
    status: "preview",
    snapshotVersion: null,
    ...buildDefaultSummaryPayload(),
    ...summaryPayload,
    sourceCounts,
    generatedAt: null,
  };
};

export const rebuildTaxSummaryByYear = async (userId, taxYearValue) => {
  const normalizedUserId = normalizeTaxUserId(userId);
  const taxYear = normalizeTaxYear(taxYearValue);
  const { activeRuleConfig, sourceCounts, factSelection, summaryPayload } =
    await buildCalculatedSummaryStateByYear(normalizedUserId, taxYear);
  const persistedFactsSnapshot = [...factSelection.includedFacts]
    .sort((leftFact, rightFact) => Number(leftFact.id) - Number(rightFact.id))
    .map(mapStoredTaxFactToSnapshotPayload);

  const persistedSummary = await withDbTransaction(async (client) => {
    const currentVersionResult = await client.query(
      `SELECT COALESCE(MAX(snapshot_version), 0) AS latest_version
       FROM tax_summaries
       WHERE user_id = $1
         AND tax_year = $2`,
      [normalizedUserId, taxYear],
    );
    const nextSnapshotVersion = Number(currentVersionResult.rows[0]?.latest_version || 0) + 1;
    const insertResult = await client.query(
      `INSERT INTO tax_summaries (
         user_id,
         tax_year,
         snapshot_version,
         summary_json,
         source_counts_json,
         facts_json
       )
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
       RETURNING snapshot_version, summary_json, source_counts_json, facts_json, generated_at`,
      [
        normalizedUserId,
        taxYear,
        nextSnapshotVersion,
        JSON.stringify(summaryPayload),
        JSON.stringify(sourceCounts),
        JSON.stringify(persistedFactsSnapshot),
      ],
    );

    return insertResult.rows[0];
  });

  return {
    taxYear,
    exerciseYear: activeRuleConfig.exerciseYear,
    calendarYear: activeRuleConfig.calendarYear,
    status: "generated",
    snapshotVersion: Number(persistedSummary.snapshot_version),
    ...buildDefaultSummaryPayload(),
    ...normalizeStoredSummary(persistedSummary.summary_json),
    sourceCounts,
    generatedAt: toISOStringOrNull(persistedSummary.generated_at),
  };
};
