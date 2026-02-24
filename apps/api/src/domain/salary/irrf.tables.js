/**
 * IRRF withholding tables — progressive brackets per year.
 * Source: RFB Instrução Normativa. Add a new key when rates change.
 *
 * Each bracket: { upTo, rate, deduction }
 *   upTo      = upper limit of the range (Infinity for the last band)
 *   rate      = decimal
 *   deduction = fixed deduction amount applied to the bracket (tabela prática)
 *
 * Dependent deduction: fixed monthly value subtracted from the IRRF base
 * before looking up the bracket.
 */

/** @type {Record<number, Array<{upTo: number, rate: number, deduction: number}>>} */
export const IRRF_BRACKETS = {
  2026: [
    { upTo: 2428.80,  rate: 0,     deduction: 0      },
    { upTo: 2826.65,  rate: 0.075, deduction: 182.16 },
    { upTo: 3751.05,  rate: 0.15,  deduction: 394.16 },
    { upTo: 4664.68,  rate: 0.225, deduction: 675.49 },
    { upTo: Infinity, rate: 0.275, deduction: 908.73 },
  ],
};

/** Monthly IRRF deduction per dependent (R$). */
export const IRRF_DEPENDENT_DEDUCTION = {
  2026: 189.59,
};
