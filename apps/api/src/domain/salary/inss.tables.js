/**
 * INSS contribution tables — progressive brackets per year.
 * Source: RFB / MPS portarias. Add a new key when rates change.
 *
 * Each bracket: { upTo, rate }
 *   upTo  = upper limit of the range (Infinity for the last band)
 *   rate  = decimal (e.g. 0.075 = 7.5 %)
 *
 * Calculation is progressive (each layer is taxed at its own rate),
 * matching the regra progressiva vigente from Jan 2023 onward.
 */

/** @type {Record<number, Array<{upTo: number, rate: number}>>} */
export const INSS_BRACKETS = {
  2026: [
    { upTo: 1621.0,   rate: 0.075 },
    { upTo: 2902.84,  rate: 0.09  },
    { upTo: 4354.27,  rate: 0.12  },
    { upTo: 8475.55,  rate: 0.14  },
    { upTo: Infinity, rate: 0.14  }, // teto — capped at max contribution
  ],
};

/** Maximum INSS monthly contribution ceiling per year (teto). */
export const INSS_CEILING = {
  2026: 988.09, // derived: progressive calc on teto salarial R$8.475,55
};
