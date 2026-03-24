import { IRRF_BRACKETS, IRRF_DEPENDENT_DEDUCTION } from "./irrf.tables.js";

const LOAN_LIMIT_RATE = 0.35; // Margem consignável — empréstimos
const CARD_LIMIT_RATE = 0.05; // Margem consignável — cartão consignado

/**
 * Calculate monthly IRRF using tabela prática progressiva.
 * @param {number} irrfBase
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

/** Round to 2 decimal places (centavos). */
function round2(v) {
  return Math.round(v * 100) / 100;
}

/**
 * Calculate net benefit for INSS aposentados and pensionistas.
 *
 * Key rules:
 *  - No INSS contribution (beneficiários não contribuem ao INSS)
 *  - Partial IRRF exemption for age >= 65: the first IRRF bracket upper
 *    limit (R$2.428,80 for 2026) is deducted from the base before lookup
 *  - Consignações tracked with legal limits:
 *      35% of gross for loans (rubrica 216/217)
 *       5% of gross for card  (rubrica 268)
 *
 * @param {object} params
 * @param {number}   params.grossBenefit    Benefício bruto mensal (R$)
 * @param {number}   [params.birthYear]     Ano de nascimento (para isenção 65+)
 * @param {number}   [params.dependents]    Número de dependentes (default 0)
 * @param {Array}    [params.consignacoes]  Lista de consignações cadastradas
 * @param {number}   [params.effectiveYear] Ano-base para as tabelas (default 2026)
 * @returns {{
 *   grossMonthly: number,
 *   inssMonthly: number,
 *   irrfMonthly: number,
 *   consignacoesMonthly: number,
 *   loanTotal: number,
 *   cardTotal: number,
 *   netMonthly: number,
 *   netAnnual: number,
 *   taxAnnual: number,
 *   loanLimitAmount: number,
 *   cardLimitAmount: number,
 *   isOverLoanLimit: boolean,
 *   isOverCardLimit: boolean,
 * }}
 */
export function calculateNetBenefit({
  grossBenefit,
  birthYear,
  dependents = 0,
  consignacoes = [],
  effectiveYear = 2026,
}) {
  if (typeof grossBenefit !== "number" || grossBenefit <= 0) {
    throw new Error("grossBenefit must be a positive number");
  }
  if (!Number.isInteger(dependents) || dependents < 0) {
    throw new Error("dependents must be a non-negative integer");
  }

  const inssMonthly = 0;

  // 65+ partial exemption: deduct first bracket upper limit from IRRF base
  const brackets = IRRF_BRACKETS[effectiveYear];
  if (!brackets) throw new Error(`IRRF table not found for year ${effectiveYear}`);
  const exemptionAmount =
    typeof birthYear === "number" && effectiveYear - birthYear >= 65
      ? brackets[0].upTo
      : 0;

  const dependentDeduction = (IRRF_DEPENDENT_DEDUCTION[effectiveYear] ?? 0) * dependents;
  const irrfBase = Math.max(0, grossBenefit - exemptionAmount - dependentDeduction);
  const irrfMonthly = round2(calcIrrf(irrfBase, effectiveYear));

  // Consignações breakdown — support both snake_case (API rows) and camelCase
  let loanTotal = 0;
  let cardTotal = 0;
  let otherTotal = 0;

  for (const c of consignacoes) {
    const amount = Number(c.amount) || 0;
    const type = c.consignacao_type ?? c.consignacaoType ?? "other";
    if (type === "loan") loanTotal += amount;
    else if (type === "card") cardTotal += amount;
    else otherTotal += amount;
  }

  loanTotal = round2(loanTotal);
  cardTotal = round2(cardTotal);
  otherTotal = round2(otherTotal);
  const consignacoesMonthly = round2(loanTotal + cardTotal + otherTotal);

  const loanLimitAmount = round2(grossBenefit * LOAN_LIMIT_RATE);
  const cardLimitAmount = round2(grossBenefit * CARD_LIMIT_RATE);

  const netMonthly = round2(grossBenefit - irrfMonthly - consignacoesMonthly);
  const netAnnual  = round2(netMonthly * 12);
  const taxAnnual  = round2(irrfMonthly * 12);

  return {
    grossMonthly:        round2(grossBenefit),
    inssMonthly,
    irrfMonthly,
    consignacoesMonthly,
    loanTotal,
    cardTotal,
    netMonthly,
    netAnnual,
    taxAnnual,
    loanLimitAmount,
    cardLimitAmount,
    isOverLoanLimit: loanTotal > loanLimitAmount,
    isOverCardLimit: cardTotal > cardLimitAmount,
  };
}
