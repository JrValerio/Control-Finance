import { dbQuery } from "../db/index.js";
import { normalizeTaxUserId, normalizeTaxYear } from "../domain/tax/tax.validation.js";

const REVIEWABLE_STATUSES = ["approved", "corrected"];

const normalizeRoundedAmount = (value) => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return 0;
  }

  return Number(parsedValue.toFixed(2));
};

const normalizeMetadataObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
};

const ensureMonthAggregate = (monthsByReference, referenceMonth) => {
  if (!monthsByReference.has(referenceMonth)) {
    monthsByReference.set(referenceMonth, {
      referenceMonth,
      payrollTypes: new Set(),
      employerName: "",
      employerDocument: "",
      grossIncome: 0,
      netIncome: 0,
      totalDiscounts: 0,
      inssDiscount: 0,
      irrfWithheld: 0,
      fgtsBase: 0,
      rubrics: [],
      rubricsCount: 0,
    });
  }

  return monthsByReference.get(referenceMonth);
};

const applyFactToMonthAggregate = (monthAggregate, factRow) => {
  const metadata = normalizeMetadataObject(factRow.metadata_json);
  const payrollType = String(metadata.payrollType || "").trim();

  if (payrollType) {
    monthAggregate.payrollTypes.add(payrollType);
  }

  const payerName = String(factRow.payer_name || "").trim();
  const payerDocument = String(factRow.payer_document || "").trim();

  if (!monthAggregate.employerName && payerName) {
    monthAggregate.employerName = payerName;
  }

  if (!monthAggregate.employerDocument && payerDocument) {
    monthAggregate.employerDocument = payerDocument;
  }

  if (Array.isArray(metadata.rubrics) && metadata.rubrics.length > 0 && monthAggregate.rubrics.length === 0) {
    monthAggregate.rubrics = metadata.rubrics;
    monthAggregate.rubricsCount = metadata.rubrics.length;
  }

  const amount = normalizeRoundedAmount(factRow.amount);

  switch (String(factRow.subcategory || "").trim()) {
    case "clt_monthly_gross_income":
      monthAggregate.grossIncome = normalizeRoundedAmount(monthAggregate.grossIncome + amount);
      break;
    case "clt_monthly_net_income":
      monthAggregate.netIncome = normalizeRoundedAmount(monthAggregate.netIncome + amount);
      break;
    case "clt_monthly_total_discounts":
      monthAggregate.totalDiscounts = normalizeRoundedAmount(monthAggregate.totalDiscounts + amount);
      break;
    case "clt_monthly_inss_discount":
      monthAggregate.inssDiscount = normalizeRoundedAmount(monthAggregate.inssDiscount + amount);
      break;
    case "clt_monthly_irrf_withheld":
      monthAggregate.irrfWithheld = normalizeRoundedAmount(monthAggregate.irrfWithheld + amount);
      break;
    case "clt_monthly_fgts_base":
      monthAggregate.fgtsBase = normalizeRoundedAmount(monthAggregate.fgtsBase + amount);
      break;
    default:
      break;
  }
};

const mapFinalMonthAggregate = (entry) => ({
  referenceMonth: entry.referenceMonth,
  payrollTypes: [...entry.payrollTypes].sort(),
  employerName: entry.employerName,
  employerDocument: entry.employerDocument,
  grossIncome: normalizeRoundedAmount(entry.grossIncome),
  netIncome: normalizeRoundedAmount(entry.netIncome),
  totalDiscounts: normalizeRoundedAmount(entry.totalDiscounts),
  inssDiscount: normalizeRoundedAmount(entry.inssDiscount),
  irrfWithheld: normalizeRoundedAmount(entry.irrfWithheld),
  fgtsBase: normalizeRoundedAmount(entry.fgtsBase),
  rubricsCount: Number(entry.rubricsCount || 0),
  rubrics: Array.isArray(entry.rubrics) ? entry.rubrics : [],
});

const buildTotals = (months) => {
  const totals = months.reduce(
    (accumulator, month) => ({
      annualGrossIncome: normalizeRoundedAmount(accumulator.annualGrossIncome + month.grossIncome),
      annualNetIncome: normalizeRoundedAmount(accumulator.annualNetIncome + month.netIncome),
      annualTotalDiscounts: normalizeRoundedAmount(
        accumulator.annualTotalDiscounts + month.totalDiscounts,
      ),
      annualInssDiscount: normalizeRoundedAmount(
        accumulator.annualInssDiscount + month.inssDiscount,
      ),
      annualIrrfWithheld: normalizeRoundedAmount(
        accumulator.annualIrrfWithheld + month.irrfWithheld,
      ),
      annualFgtsBase: normalizeRoundedAmount(accumulator.annualFgtsBase + month.fgtsBase),
    }),
    {
      annualGrossIncome: 0,
      annualNetIncome: 0,
      annualTotalDiscounts: 0,
      annualInssDiscount: 0,
      annualIrrfWithheld: 0,
      annualFgtsBase: 0,
    },
  );

  return {
    ...totals,
    monthsWithData: months.length,
  };
};

export const getCltIncomeStatementByYear = async (userId, taxYear) => {
  const normalizedUserId = normalizeTaxUserId(userId);
  const normalizedTaxYear = normalizeTaxYear(taxYear, "taxYear");

  const factsResult = await dbQuery(
    `SELECT
       id,
       subcategory,
       reference_period,
       amount,
       payer_name,
       payer_document,
       metadata_json
     FROM tax_facts
     WHERE user_id = $1
       AND tax_year = $2
       AND category = 'clt_payslip'
       AND review_status = ANY($3::text[])
     ORDER BY reference_period ASC, id ASC`,
    [normalizedUserId, normalizedTaxYear, REVIEWABLE_STATUSES],
  );

  const monthsByReference = new Map();

  for (const factRow of factsResult.rows) {
    const referenceMonth = String(factRow.reference_period || "").trim();

    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(referenceMonth)) {
      continue;
    }

    const monthAggregate = ensureMonthAggregate(monthsByReference, referenceMonth);
    applyFactToMonthAggregate(monthAggregate, factRow);
  }

  const months = [...monthsByReference.values()]
    .map(mapFinalMonthAggregate)
    .sort((left, right) => left.referenceMonth.localeCompare(right.referenceMonth));
  const totals = buildTotals(months);

  return {
    taxYear: normalizedTaxYear,
    exerciseYear: normalizedTaxYear,
    calendarYear: normalizedTaxYear - 1,
    status: months.length > 0 ? "generated" : "not_generated",
    generatedAt: new Date().toISOString(),
    totals,
    sourceCounts: {
      approvedFacts: Number(factsResult.rows.length),
      months: months.length,
    },
    months,
  };
};
