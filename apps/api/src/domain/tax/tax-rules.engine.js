const RECEITA_DIRPF_2026_SOURCE_URL =
  "https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/perguntas-frequentes/imposto-de-renda/dirpf";
const RECEITA_TRIBUTACAO_2025_SOURCE_URL =
  "https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2025";

const TAX_RULE_SEED_BY_YEAR = Object.freeze({
  2026: Object.freeze({
    calendarYear: 2025,
    ruleSets: Object.freeze({
      obligation: Object.freeze({
        version: 1,
        sourceLabel: "Receita Federal - DIRPF 2026",
        sourceUrl: RECEITA_DIRPF_2026_SOURCE_URL,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        rules: Object.freeze({
          taxableIncomeThreshold: 35584.0,
          exemptAndExclusiveIncomeThreshold: 200000.0,
          assetBalanceThreshold: 800000.0,
          ruralRevenueThreshold: 177920.0,
          stockOperationsThreshold: 40000.0,
        }),
      }),
      annual_table: Object.freeze({
        version: 1,
        sourceLabel: "Receita Federal - Tributacao de 2025",
        sourceUrl: RECEITA_TRIBUTACAO_2025_SOURCE_URL,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        rules: Object.freeze({
          brackets: Object.freeze([
            Object.freeze({
              upTo: 28467.2,
              rate: 0,
              deduction: 0,
            }),
            Object.freeze({
              upTo: 33919.8,
              rate: 0.075,
              deduction: 2135.04,
            }),
            Object.freeze({
              upTo: 45012.6,
              rate: 0.15,
              deduction: 4679.03,
            }),
            Object.freeze({
              upTo: 55976.16,
              rate: 0.225,
              deduction: 8054.97,
            }),
            Object.freeze({
              upTo: null,
              rate: 0.275,
              deduction: 10853.78,
            }),
          ]),
        }),
      }),
      deduction_limits: Object.freeze({
        version: 1,
        sourceLabel: "Receita Federal - Tributacao de 2025",
        sourceUrl: RECEITA_TRIBUTACAO_2025_SOURCE_URL,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        rules: Object.freeze({
          dependentDeduction: 2275.08,
          educationDeductionPerPerson: 3561.5,
          simplifiedDiscountCap: 16754.34,
        }),
      }),
      comparison_logic: Object.freeze({
        version: 1,
        sourceLabel: "Receita Federal - Tributacao de 2025",
        sourceUrl: RECEITA_TRIBUTACAO_2025_SOURCE_URL,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        rules: Object.freeze({
          simplifiedDiscountRate: 0.2,
          reviewedStatuses: Object.freeze(["approved", "corrected"]),
        }),
      }),
    }),
  }),
});

const normalizeMoney = (value) => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return 0;
  }

  return Number(parsedValue.toFixed(2));
};

export const resolveCalendarYearFromExerciseYear = (exerciseYear) => exerciseYear - 1;

export const getTaxRuleSeedDefinitionsForYear = (taxYear) => {
  const ruleBundle = TAX_RULE_SEED_BY_YEAR[taxYear];

  if (!ruleBundle) {
    return [];
  }

  return Object.entries(ruleBundle.ruleSets).map(([ruleFamily, definition]) => ({
    taxYear,
    exerciseYear: taxYear,
    calendarYear: ruleBundle.calendarYear,
    ruleFamily,
    version: definition.version,
    sourceLabel: definition.sourceLabel,
    sourceUrl: definition.sourceUrl,
    effectiveFrom: definition.effectiveFrom,
    effectiveTo: definition.effectiveTo,
    rules: definition.rules,
  }));
};

export const calculateSimplifiedDiscount = ({
  annualTaxableIncome,
  comparisonRules = {},
  deductionLimitRules = {},
}) => {
  const simplifiedDiscountRate = Number(comparisonRules.simplifiedDiscountRate || 0);
  const simplifiedDiscountCap = Number(deductionLimitRules.simplifiedDiscountCap || 0);
  const grossDiscount = normalizeMoney(annualTaxableIncome * simplifiedDiscountRate);

  return normalizeMoney(Math.min(grossDiscount, simplifiedDiscountCap));
};

export const calculateAnnualProgressiveTax = ({
  baseAmount,
  annualTableRules = {},
}) => {
  const normalizedBaseAmount = Math.max(normalizeMoney(baseAmount), 0);
  const brackets = Array.isArray(annualTableRules.brackets) ? annualTableRules.brackets : [];
  const matchedBracket =
    brackets.find((bracket) => bracket.upTo === null || normalizedBaseAmount <= Number(bracket.upTo)) ||
    null;

  if (!matchedBracket) {
    return 0;
  }

  const calculatedTax =
    normalizedBaseAmount * Number(matchedBracket.rate || 0) - Number(matchedBracket.deduction || 0);

  return normalizeMoney(Math.max(calculatedTax, 0));
};
