import { dbQuery, withDbTransaction } from "../db/index.js";
import {
  getTaxRuleSeedDefinitionsForYear,
  resolveCalendarYearFromExerciseYear,
} from "../domain/tax/tax-rules.engine.js";
import {
  createTaxError,
  normalizeTaxUserId,
  normalizeTaxYear,
  toISOStringOrNull,
} from "../domain/tax/tax.validation.js";

const normalizeRulePayload = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
};

const mapActiveRuleSetMetadata = (row) => ({
  version: Number(row.version),
  sourceLabel: row.source_label,
  sourceUrl: row.source_url,
  effectiveFrom: row.effective_from,
  effectiveTo: row.effective_to,
  active: Boolean(row.is_active),
  createdAt: toISOStringOrNull(row.created_at),
});

const mapActiveRuleSetConfig = (row) => ({
  ...mapActiveRuleSetMetadata(row),
  rules: normalizeRulePayload(row.rules_json),
});

const listActiveRuleRowsByYear = async (taxYear) => {
  const result = await dbQuery(
    `SELECT
       rule_family,
       version,
       source_label,
       source_url,
       effective_from,
       effective_to,
       is_active,
       rules_json,
       created_at
     FROM tax_rule_sets
     WHERE tax_year = $1
       AND is_active = TRUE
     ORDER BY rule_family ASC, version DESC`,
    [taxYear],
  );

  return result.rows;
};

const ensureTaxRuleSetsSeededByYear = async (taxYear) => {
  const existingRows = await listActiveRuleRowsByYear(taxYear);

  if (existingRows.length > 0) {
    return existingRows;
  }

  const seedDefinitions = getTaxRuleSeedDefinitionsForYear(taxYear);

  if (seedDefinitions.length === 0) {
    return [];
  }

  await withDbTransaction(async (client) => {
    const alreadySeededResult = await client.query(
      `SELECT 1
       FROM tax_rule_sets
       WHERE tax_year = $1
         AND is_active = TRUE
       LIMIT 1`,
      [taxYear],
    );

    if (alreadySeededResult.rowCount > 0) {
      return;
    }

    for (const definition of seedDefinitions) {
      await client.query(
        `INSERT INTO tax_rule_sets (
           tax_year,
           exercise_year,
           rule_family,
           version,
           source_url,
           source_label,
           effective_from,
           effective_to,
           is_active,
           rules_json
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9::jsonb)`,
        [
          definition.taxYear,
          definition.exerciseYear,
          definition.ruleFamily,
          definition.version,
          definition.sourceUrl,
          definition.sourceLabel,
          definition.effectiveFrom,
          definition.effectiveTo,
          JSON.stringify(definition.rules),
        ],
      );
    }
  });

  return listActiveRuleRowsByYear(taxYear);
};

const mapPublicRuleSets = (rows) =>
  rows.reduce((accumulator, row) => {
    accumulator[row.rule_family] = mapActiveRuleSetMetadata(row);
    return accumulator;
  }, {});

const mapConfigRuleSets = (rows) =>
  rows.reduce((accumulator, row) => {
    accumulator[row.rule_family] = mapActiveRuleSetConfig(row);
    return accumulator;
  }, {});

const ensureRequiredRuleFamilies = (ruleSets) => {
  const requiredRuleFamilies = [
    "obligation",
    "annual_table",
    "deduction_limits",
    "comparison_logic",
  ];
  const missingRuleFamilies = requiredRuleFamilies.filter((ruleFamily) => !ruleSets[ruleFamily]);

  if (missingRuleFamilies.length > 0) {
    throw createTaxError(
      500,
      `Conjunto de regras fiscais incompleto: ${missingRuleFamilies.join(", ")}.`,
      "TAX_RULES_INCOMPLETE",
    );
  }
};

export const getTaxRuleSetsByYear = async (userId, taxYearValue) => {
  normalizeTaxUserId(userId);
  const taxYear = normalizeTaxYear(taxYearValue);
  const rows = await ensureTaxRuleSetsSeededByYear(taxYear);

  return {
    taxYear,
    exerciseYear: taxYear,
    calendarYear: resolveCalendarYearFromExerciseYear(taxYear),
    ruleSets: mapPublicRuleSets(rows),
    totalActiveRuleSets: rows.length,
  };
};

export const requireActiveTaxRuleConfigByYear = async (taxYearValue) => {
  const taxYear = normalizeTaxYear(taxYearValue);
  const rows = await ensureTaxRuleSetsSeededByYear(taxYear);

  if (rows.length === 0) {
    throw createTaxError(
      404,
      "Regras fiscais ativas indisponiveis para o exercicio informado.",
      "TAX_RULES_UNAVAILABLE",
    );
  }

  const ruleSets = mapConfigRuleSets(rows);
  ensureRequiredRuleFamilies(ruleSets);

  return {
    taxYear,
    exerciseYear: taxYear,
    calendarYear: resolveCalendarYearFromExerciseYear(taxYear),
    ruleSets,
    totalActiveRuleSets: rows.length,
  };
};
