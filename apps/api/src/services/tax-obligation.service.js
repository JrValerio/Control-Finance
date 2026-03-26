import { dbQuery } from "../db/index.js";
import { calculateTaxObligation, summarizeReviewedTaxFacts } from "../domain/tax/tax-obligation.calculator.js";
import { normalizeTaxUserId, normalizeTaxYear } from "../domain/tax/tax.validation.js";
import { requireActiveTaxRuleConfigByYear } from "./tax-rules.service.js";

const REVIEWED_FACT_STATUSES_SQL = "'approved', 'corrected'";

export const listReviewedTaxFactsByUserAndYear = async (userId, taxYearValue) => {
  const normalizedUserId = normalizeTaxUserId(userId);
  const taxYear = normalizeTaxYear(taxYearValue);
  const result = await dbQuery(
    `SELECT
       id,
       tax_year,
       fact_type,
       amount,
       review_status,
       conflict_code,
       conflict_message,
       source_document_id,
       reference_period,
       metadata_json,
       updated_at
     FROM tax_facts
     WHERE user_id = $1
       AND tax_year = $2
       AND review_status IN (${REVIEWED_FACT_STATUSES_SQL})
     ORDER BY updated_at DESC, id DESC`,
    [normalizedUserId, taxYear],
  );

  return result.rows;
};

export const getTaxObligationByYear = async (userId, taxYearValue) => {
  const normalizedUserId = normalizeTaxUserId(userId);
  const taxYear = normalizeTaxYear(taxYearValue);
  const activeRuleConfig = await requireActiveTaxRuleConfigByYear(taxYear);
  const reviewedFacts = await listReviewedTaxFactsByUserAndYear(normalizedUserId, taxYear);
  const totals = summarizeReviewedTaxFacts(reviewedFacts);
  const obligation = calculateTaxObligation({
    totals,
    obligationRules: activeRuleConfig.ruleSets.obligation?.rules,
  });

  return {
    taxYear,
    exerciseYear: activeRuleConfig.exerciseYear,
    calendarYear: activeRuleConfig.calendarYear,
    mustDeclare: obligation.mustDeclare,
    reasons: obligation.reasons,
    thresholds: obligation.thresholds,
    totals: obligation.totals,
    approvedFactsCount: totals.approvedFactsCount,
  };
};
