const normalizeMoney = (value) => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return 0;
  }

  return Number(parsedValue.toFixed(2));
};

const normalizeFactSubcategory = (value) => String(value || "").trim().toLowerCase();

const isTriggeredOtherFact = (fact, expectedSubcategory) =>
  fact.fact_type === "other" && normalizeFactSubcategory(fact.subcategory) === expectedSubcategory;

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
    annualRuralRevenue: 0,
    totalStockOperations: 0,
    hasRuralLossCompensation: false,
    hasCapitalGain: false,
    hasPropertySaleExemption: false,
    hasStockTaxableGain: false,
    hasResidentStart: false,
    hasControlledEntityAbroadOption: false,
    hasForeignTrust: false,
    hasForeignFinancialIncome: false,
    hasForeignFinancialLossCompensation: false,
    hasForeignDividends: false,
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
      case "other":
        if (isTriggeredOtherFact(fact, "rural_revenue")) {
          totals.annualRuralRevenue += amount;
        } else if (isTriggeredOtherFact(fact, "stock_operation_total")) {
          totals.totalStockOperations += amount;
        } else if (isTriggeredOtherFact(fact, "rural_loss_compensation")) {
          totals.hasRuralLossCompensation = true;
        } else if (isTriggeredOtherFact(fact, "capital_gain")) {
          totals.hasCapitalGain = true;
        } else if (isTriggeredOtherFact(fact, "property_sale_exemption")) {
          totals.hasPropertySaleExemption = true;
        } else if (isTriggeredOtherFact(fact, "stock_operation_taxable_gain")) {
          totals.hasStockTaxableGain = true;
        } else if (isTriggeredOtherFact(fact, "resident_start")) {
          totals.hasResidentStart = true;
        } else if (isTriggeredOtherFact(fact, "controlled_entity_abroad_option")) {
          totals.hasControlledEntityAbroadOption = true;
        } else if (isTriggeredOtherFact(fact, "foreign_trust")) {
          totals.hasForeignTrust = true;
        } else if (isTriggeredOtherFact(fact, "foreign_financial_income")) {
          totals.hasForeignFinancialIncome = true;
        } else if (isTriggeredOtherFact(fact, "foreign_financial_loss_compensation")) {
          totals.hasForeignFinancialLossCompensation = true;
        } else if (isTriggeredOtherFact(fact, "foreign_dividends")) {
          totals.hasForeignDividends = true;
        }
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
  totals.annualRuralRevenue = normalizeMoney(totals.annualRuralRevenue);
  totals.totalStockOperations = normalizeMoney(totals.totalStockOperations);
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
  const annualRuralRevenue = normalizeMoney(totals.annualRuralRevenue);
  const totalStockOperations = normalizeMoney(totals.totalStockOperations);
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

  if (annualRuralRevenue > Number(obligationRules.ruralRevenueThreshold || 0)) {
    reasons.push({
      code: "RURAL_REVENUE_LIMIT",
      message: "Receita bruta da atividade rural acima do limite do exercicio.",
    });
  }

  if (totals.hasRuralLossCompensation) {
    reasons.push({
      code: "RURAL_LOSS_COMPENSATION",
      message: "Compensacao de prejuizo da atividade rural informada para o exercicio.",
    });
  }

  if (totals.hasCapitalGain) {
    reasons.push({
      code: "CAPITAL_GAIN_EVENT",
      message: "Ganho de capital sujeito ao imposto informado no exercicio.",
    });
  }

  if (totals.hasPropertySaleExemption) {
    reasons.push({
      code: "PROPERTY_SALE_EXEMPTION_EVENT",
      message: "Isencao por venda de imovel com reinvestimento informada no exercicio.",
    });
  }

  if (
    totalStockOperations > Number(obligationRules.stockOperationsThreshold || 0) ||
    totals.hasStockTaxableGain
  ) {
    reasons.push({
      code: "STOCK_OPERATION_EVENT",
      message: "Operacoes em bolsa acima do limite ou com ganho liquido sujeito ao imposto.",
    });
  }

  if (totals.hasResidentStart) {
    reasons.push({
      code: "RESIDENT_START_EVENT",
      message: "Passou a condicao de residente no Brasil no exercicio.",
    });
  }

  if (totals.hasControlledEntityAbroadOption) {
    reasons.push({
      code: "CONTROLLED_ENTITY_ABROAD_EVENT",
      message: "Opcao por declarar entidade controlada no exterior no exercicio.",
    });
  }

  if (totals.hasForeignTrust) {
    reasons.push({
      code: "FOREIGN_TRUST_EVENT",
      message: "Titularidade de trust ou contrato similar no exterior informada no exercicio.",
    });
  }

  if (totals.hasForeignFinancialIncome || totals.hasForeignFinancialLossCompensation) {
    reasons.push({
      code: "FOREIGN_FINANCIAL_EVENT",
      message: "Rendimentos ou compensacao de prejuizos de aplicacoes financeiras no exterior informados no exercicio.",
    });
  }

  if (totals.hasForeignDividends) {
    reasons.push({
      code: "FOREIGN_DIVIDENDS_EVENT",
      message: "Lucros ou dividendos de entidades no exterior informados no exercicio.",
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
      stockOperations: normalizeMoney(obligationRules.stockOperationsThreshold),
    },
    totals: {
      annualTaxableIncome,
      annualExemptIncome,
      annualExclusiveIncome,
      annualWithheldTax,
      totalLegalDeductions,
      annualCombinedExemptAndExclusiveIncome,
      totalAssetBalance,
      annualRuralRevenue,
      totalStockOperations,
      hasRuralLossCompensation: Boolean(totals.hasRuralLossCompensation),
      hasCapitalGain: Boolean(totals.hasCapitalGain),
      hasPropertySaleExemption: Boolean(totals.hasPropertySaleExemption),
      hasStockTaxableGain: Boolean(totals.hasStockTaxableGain),
      hasResidentStart: Boolean(totals.hasResidentStart),
      hasControlledEntityAbroadOption: Boolean(totals.hasControlledEntityAbroadOption),
      hasForeignTrust: Boolean(totals.hasForeignTrust),
      hasForeignFinancialIncome: Boolean(totals.hasForeignFinancialIncome),
      hasForeignFinancialLossCompensation: Boolean(totals.hasForeignFinancialLossCompensation),
      hasForeignDividends: Boolean(totals.hasForeignDividends),
    },
  };
};
