import { INSS_BRACKETS, INSS_CEILING } from "./inss.tables.js";
import {
  IRRF_BRACKETS,
  IRRF_DEPENDENT_DEDUCTION,
} from "./irrf.tables.js";

/**
 * Calculate progressive INSS contribution.
 * @param {number} gross
 * @param {number} year
 * @returns {number}
 */
function calcInss(gross, year) {
  const brackets = INSS_BRACKETS[year];
  if (!brackets) throw new Error(`INSS table not found for year ${year}`);

  const ceiling = INSS_CEILING[year];

  let contribution = 0;
  let prev = 0;

  for (const { upTo, rate } of brackets) {
    const top = Math.min(gross, upTo === Infinity ? gross : upTo);
    if (top <= prev) break;
    contribution += (top - prev) * rate;
    prev = top;
    if (gross <= upTo) break;
  }

  return Math.min(contribution, ceiling);
}

/**
 * Calculate monthly IRRF withholding using tabela prática progressiva.
 * @param {number} irrfBase  gross minus INSS, minus dependent deductions
 * @param {number} year
 * @returns {number}
 */
function calcIrrf(irrfBase, year) {
  const brackets = IRRF_BRACKETS[year];
  if (!brackets) throw new Error(`IRRF table not found for year ${year}`);

  for (const { upTo, rate, deduction } of brackets) {
    if (irrfBase <= upTo) {
      return Math.max(0, irrfBase * rate - deduction);
    }
  }
  return 0;
}

/**
 * Calculate net salary after INSS and IRRF (simplified modelo padrão).
 *
 * @param {object} params
 * @param {number} params.grossSalary     Bruto mensal em R$
 * @param {number} [params.dependents]    Número de dependentes (default 0)
 * @param {number} [params.effectiveYear] Ano de referência para as tabelas (default 2025)
 * @returns {{
 *   grossMonthly: number,
 *   inssMonthly: number,
 *   irrfMonthly: number,
 *   netMonthly: number,
 *   netAnnual: number,
 *   taxAnnual: number,
 * }}
 */
export function calculateNetSalary({
  grossSalary,
  dependents = 0,
  effectiveYear = 2026,
}) {
  if (typeof grossSalary !== "number" || grossSalary <= 0) {
    throw new Error("grossSalary must be a positive number");
  }
  if (!Number.isInteger(dependents) || dependents < 0) {
    throw new Error("dependents must be a non-negative integer");
  }

  // Round monthly values before deriving annual totals to keep
  // netAnnual == netMonthly * 12 and taxAnnual == (inss + irrf) * 12.
  const inssMonthly = round2(calcInss(grossSalary, effectiveYear));

  const dependentDeduction =
    (IRRF_DEPENDENT_DEDUCTION[effectiveYear] ?? 0) * dependents;
  const irrfBase = Math.max(0, grossSalary - inssMonthly - dependentDeduction);
  const irrfMonthly = round2(calcIrrf(irrfBase, effectiveYear));

  const netMonthly  = round2(grossSalary - inssMonthly - irrfMonthly);
  const netAnnual   = round2(netMonthly * 12);
  const taxAnnual   = round2((inssMonthly + irrfMonthly) * 12);

  return {
    grossMonthly: round2(grossSalary),
    inssMonthly,
    irrfMonthly,
    netMonthly,
    netAnnual,
    taxAnnual,
  };
}

/** Round to 2 decimal places (centavos). */
function round2(v) {
  return Math.round(v * 100) / 100;
}
