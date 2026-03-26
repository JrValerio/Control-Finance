const normalizeMoney = (value) => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return 0;
  }

  return Number(parsedValue.toFixed(2));
};

export const summarizeReviewedTaxFacts = (facts = []) => {
  const totals = {
    annualTaxableIncome: 0,
    annualExemptIncome: 0,
    annualExclusiveIncome: 0,
    annualWithheldTax: 0,
    totalMedicalDeductions: 0,
    totalEducationDeductions: 0,
    totalLegalDeductions: 0,
    totalAssetBalance: 0,
    approvedFactsCount: Array.isArray(facts) ? facts.length : 0,
  };

  for (const fact of Array.isArray(facts) ? facts : []) {
    const amount = normalizeMoney(fact.amount);

    switch (fact.fact_type) {
      case "taxable_income":
        totals.annualTaxableIncome += amount;
        break;
      case "exempt_income":
        totals.annualExemptIncome += amount;
        break;
      case "exclusive_tax_income":
        totals.annualExclusiveIncome += amount;
        break;
      case "withheld_tax":
        totals.annualWithheldTax += amount;
        break;
      case "medical_deduction":
        totals.totalMedicalDeductions += amount;
        break;
      case "education_deduction":
        totals.totalEducationDeductions += amount;
        break;
      case "asset_balance":
        totals.totalAssetBalance += amount;
        break;
      default:
        break;
    }
  }

  totals.annualTaxableIncome = normalizeMoney(totals.annualTaxableIncome);
  totals.annualExemptIncome = normalizeMoney(totals.annualExemptIncome);
  totals.annualExclusiveIncome = normalizeMoney(totals.annualExclusiveIncome);
  totals.annualWithheldTax = normalizeMoney(totals.annualWithheldTax);
  totals.totalMedicalDeductions = normalizeMoney(totals.totalMedicalDeductions);
  totals.totalEducationDeductions = normalizeMoney(totals.totalEducationDeductions);
  totals.totalAssetBalance = normalizeMoney(totals.totalAssetBalance);
  totals.totalLegalDeductions = normalizeMoney(
    totals.totalMedicalDeductions + totals.totalEducationDeductions,
  );

  return totals;
};

export const calculateTaxObligation = ({
  totals = {},
  obligationRules = {},
}) => {
  const annualTaxableIncome = normalizeMoney(totals.annualTaxableIncome);
  const annualExemptIncome = normalizeMoney(totals.annualExemptIncome);
  const annualExclusiveIncome = normalizeMoney(totals.annualExclusiveIncome);
  const annualWithheldTax = normalizeMoney(totals.annualWithheldTax);
  const totalLegalDeductions = normalizeMoney(totals.totalLegalDeductions);
  const annualCombinedExemptAndExclusiveIncome = normalizeMoney(
    annualExemptIncome + annualExclusiveIncome,
  );
  const totalAssetBalance = normalizeMoney(totals.totalAssetBalance);
  const reasons = [];

  if (annualTaxableIncome > Number(obligationRules.taxableIncomeThreshold || 0)) {
    reasons.push({
      code: "TAXABLE_INCOME_LIMIT",
      message: "Rendimentos tributaveis acima do limite do exercicio.",
    });
  }

  if (
    annualCombinedExemptAndExclusiveIncome >
    Number(obligationRules.exemptAndExclusiveIncomeThreshold || 0)
  ) {
    reasons.push({
      code: "EXEMPT_AND_EXCLUSIVE_INCOME_LIMIT",
      message: "Rendimentos isentos ou tributados exclusivamente na fonte acima do limite.",
    });
  }

  if (totalAssetBalance > Number(obligationRules.assetBalanceThreshold || 0)) {
    reasons.push({
      code: "ASSET_BALANCE_LIMIT",
      message: "Bens e direitos acima do limite patrimonial do exercicio.",
    });
  }

  return {
    mustDeclare: reasons.length > 0,
    reasons,
    thresholds: {
      taxableIncome: normalizeMoney(obligationRules.taxableIncomeThreshold),
      exemptAndExclusiveIncome: normalizeMoney(
        obligationRules.exemptAndExclusiveIncomeThreshold,
      ),
      assets: normalizeMoney(obligationRules.assetBalanceThreshold),
      ruralRevenue: normalizeMoney(obligationRules.ruralRevenueThreshold),
    },
    totals: {
      annualTaxableIncome,
      annualExemptIncome,
      annualExclusiveIncome,
      annualWithheldTax,
      totalLegalDeductions,
      annualCombinedExemptAndExclusiveIncome,
      totalAssetBalance,
    },
  };
};
