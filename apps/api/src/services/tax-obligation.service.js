import { dbQuery } from "../db/index.js";
import { calculateTaxObligation, summarizeReviewedTaxFacts } from "../domain/tax/tax-obligation.calculator.js";
import { normalizeTaxUserId, normalizeTaxYear } from "../domain/tax/tax.validation.js";
import { requireActiveTaxRuleConfigByYear } from "./tax-rules.service.js";

const REVIEWED_FACT_STATUSES_SQL = "'approved', 'corrected'";

const normalizeJsonObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
};

const normalizeDocumentNumber = (value) => String(value || "").replace(/\D/g, "");

const resolveFactOwnerDocument = (fact) => {
  const metadata = normalizeJsonObject(fact?.metadata_json);

  return normalizeDocumentNumber(
    metadata.beneficiaryDocument ||
      metadata.customerDocument ||
      metadata.studentDocument ||
      metadata.ownerDocument ||
      "",
  );
};

const getUserTaxpayerDocument = async (userId) => {
  const result = await dbQuery(
    `SELECT taxpayer_cpf
     FROM user_profiles
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );

  return normalizeDocumentNumber(result.rows[0]?.taxpayer_cpf || "");
};

export const listReviewedTaxFactsByUserAndYear = async (userId, taxYearValue) => {
  const normalizedUserId = normalizeTaxUserId(userId);
  const taxYear = normalizeTaxYear(taxYearValue);
  const result = await dbQuery(
    `SELECT
       id,
       tax_year,
       fact_type,
       category,
       subcategory,
       payer_name,
       payer_document,
       currency,
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

export const getReviewedTaxFactsSelectionByUserAndYear = async (userId, taxYearValue) => {
  const normalizedUserId = normalizeTaxUserId(userId);
  const taxYear = normalizeTaxYear(taxYearValue);
  const [reviewedFacts, taxpayerDocument] = await Promise.all([
    listReviewedTaxFactsByUserAndYear(normalizedUserId, taxYear),
    getUserTaxpayerDocument(normalizedUserId),
  ]);

  if (!taxpayerDocument) {
    return {
      taxpayerDocument: null,
      includedFacts: reviewedFacts,
      excludedFacts: [],
    };
  }

  const includedFacts = [];
  const excludedFacts = [];

  for (const fact of reviewedFacts) {
    const ownerDocument = resolveFactOwnerDocument(fact);

    if (!ownerDocument || ownerDocument === taxpayerDocument) {
      includedFacts.push(fact);
      continue;
    }

    excludedFacts.push({
      ...fact,
      owner_document: ownerDocument,
    });
  }

  return {
    taxpayerDocument,
    includedFacts,
    excludedFacts,
  };
};

export const getTaxObligationByYear = async (userId, taxYearValue) => {
  const normalizedUserId = normalizeTaxUserId(userId);
  const taxYear = normalizeTaxYear(taxYearValue);
  const activeRuleConfig = await requireActiveTaxRuleConfigByYear(taxYear);
  const factSelection = await getReviewedTaxFactsSelectionByUserAndYear(normalizedUserId, taxYear);
  const totals = summarizeReviewedTaxFacts(factSelection.includedFacts);
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
    taxpayerCpfConfigured: Boolean(factSelection.taxpayerDocument),
    excludedFactsCount: factSelection.excludedFacts.length,
  };
};
