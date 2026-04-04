const createPeriodInferenceError = (message) => {
  const error = new Error(message);
  error.status = 422;
  error.publicCode = "INVOICE_PERIOD_INFERENCE_FAILED";
  return error;
};

const toIsoDate = (dateValue) =>
  `${dateValue.getUTCFullYear()}-${String(dateValue.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dateValue.getUTCDate(),
  ).padStart(2, "0")}`;

export const inferInvoicePeriodFromDueDateAndClosingDay = (dueDate, closingDay) => {
  const due = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) {
    return null;
  }

  const endYear = due.getUTCFullYear();
  const endMonth = due.getUTCMonth() + 1;
  const daysInEndMonth = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
  const endDay = Math.min(closingDay, daysInEndMonth);

  const periodEndDate = new Date(Date.UTC(endYear, endMonth - 1, endDay));

  if (periodEndDate >= due) {
    periodEndDate.setUTCMonth(periodEndDate.getUTCMonth() - 1);
    const previousMonthDays = new Date(
      Date.UTC(periodEndDate.getUTCFullYear(), periodEndDate.getUTCMonth() + 1, 0),
    ).getUTCDate();
    periodEndDate.setUTCDate(Math.min(closingDay, previousMonthDays));
  }

  const periodStartDate = new Date(periodEndDate);
  periodStartDate.setUTCMonth(periodStartDate.getUTCMonth() - 1);
  const previousMonthDays = new Date(
    Date.UTC(periodStartDate.getUTCFullYear(), periodStartDate.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const startClosingDay = Math.min(closingDay, previousMonthDays);
  periodStartDate.setUTCDate(startClosingDay + 1);

  const start = toIsoDate(periodStartDate);
  const end = toIsoDate(periodEndDate);

  if (start >= end) {
    return null;
  }

  return { start, end };
};

export const resolveCreditCardInvoicePeriod = ({
  parsedPeriodStart,
  parsedPeriodEnd,
  dueDate,
  closingDay,
  fieldsSources,
}) => {
  const normalizedFieldsSources = { ...fieldsSources };

  if (parsedPeriodStart && parsedPeriodEnd) {
    return {
      periodStart: parsedPeriodStart,
      periodEnd: parsedPeriodEnd,
      parseConfidence: "high",
      fieldsSources: normalizedFieldsSources,
      inferenceContext: {},
      inferredByClosingDay: false,
    };
  }

  if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31) {
    throw createPeriodInferenceError(
      "Periodo da fatura nao encontrado no PDF e o cartao nao tem dia de fechamento cadastrado.",
    );
  }

  const inferredPeriod = inferInvoicePeriodFromDueDateAndClosingDay(dueDate, closingDay);

  if (!inferredPeriod) {
    throw createPeriodInferenceError(
      "Nao foi possivel inferir o periodo da fatura a partir do dia de fechamento do cartao.",
    );
  }

  normalizedFieldsSources.periodStart = "inference:closing_day";
  normalizedFieldsSources.periodEnd = "inference:closing_day";

  return {
    periodStart: inferredPeriod.start,
    periodEnd: inferredPeriod.end,
    parseConfidence: "low",
    fieldsSources: normalizedFieldsSources,
    inferenceContext: { closingDay },
    inferredByClosingDay: true,
  };
};
