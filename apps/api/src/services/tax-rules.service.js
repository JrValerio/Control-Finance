import { dbQuery } from "../db/index.js";
import { normalizeTaxUserId, normalizeTaxYear, toISOStringOrNull } from "../domain/tax/tax.validation.js";

const mapActiveRuleSet = (row) => ({
  version: Number(row.version),
  sourceLabel: row.source_label,
  sourceUrl: row.source_url,
  effectiveFrom: row.effective_from,
  effectiveTo: row.effective_to,
  active: Boolean(row.is_active),
  createdAt: toISOStringOrNull(row.created_at),
});

export const getTaxRuleSetsByYear = async (userId, taxYearValue) => {
  normalizeTaxUserId(userId);
  const taxYear = normalizeTaxYear(taxYearValue);
  const result = await dbQuery(
    `SELECT
       rule_family,
       version,
       source_label,
       source_url,
       effective_from,
       effective_to,
       is_active,
       created_at
     FROM tax_rule_sets
     WHERE tax_year = $1
       AND is_active = TRUE
     ORDER BY rule_family ASC, version DESC`,
    [taxYear],
  );

  const ruleSets = result.rows.reduce((accumulator, row) => {
    accumulator[row.rule_family] = mapActiveRuleSet(row);
    return accumulator;
  }, {});

  return {
    taxYear,
    exerciseYear: taxYear + 1,
    ruleSets,
    totalActiveRuleSets: result.rows.length,
  };
};
