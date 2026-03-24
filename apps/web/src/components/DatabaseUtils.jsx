export const CATEGORY_ALL = "Todos";
export const CATEGORY_ENTRY = "Entrada";
export const CATEGORY_EXIT = "Saida";

export const PERIOD_ALL = "Todo período";
export const PERIOD_TODAY = "Hoje";
export const PERIOD_LAST_7_DAYS = "Últimos 7 dias";
export const PERIOD_LAST_30_DAYS = "Últimos 30 dias";
export const PERIOD_CUSTOM = "Personalizado";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const formatPart = (value) => String(value).padStart(2, "0");

export const getTodayISODate = (referenceDate = new Date()) => {
  const date = new Date(referenceDate);
  return `${date.getFullYear()}-${formatPart(date.getMonth() + 1)}-${formatPart(
    date.getDate(),
  )}`;
};

const getDateWithOffsetISO = (referenceDate, offsetDays) => {
  const date = new Date(referenceDate);
  date.setDate(date.getDate() + offsetDays);
  return getTodayISODate(date);
};

export const resolvePeriodRange = (
  period,
  customRange = {},
  referenceDate = new Date(),
) => {
  if (period === PERIOD_ALL) {
    return {
      startDate: null,
      endDate: null,
    };
  }

  const today = getTodayISODate(referenceDate);
  let startDate = null;
  let endDate = null;

  if (period === PERIOD_TODAY) {
    startDate = today;
    endDate = today;
  }

  if (period === PERIOD_LAST_7_DAYS) {
    startDate = getDateWithOffsetISO(referenceDate, -6);
    endDate = today;
  }

  if (period === PERIOD_LAST_30_DAYS) {
    startDate = getDateWithOffsetISO(referenceDate, -29);
    endDate = today;
  }

  if (period === PERIOD_CUSTOM) {
    startDate = isValidISODate(customRange.startDate)
      ? customRange.startDate
      : null;
    endDate = isValidISODate(customRange.endDate) ? customRange.endDate : null;

    if (!startDate && !endDate) {
      return {
        startDate: null,
        endDate: null,
      };
    }
  }

  if (startDate && endDate && startDate > endDate) {
    [startDate, endDate] = [endDate, startDate];
  }

  return {
    startDate,
    endDate,
  };
};

export const isValidISODate = (value) => {
  if (typeof value !== "string" || !ISO_DATE_REGEX.test(value)) {
    return false;
  }

  const parsedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  return getTodayISODate(parsedDate) === value;
};

export const normalizeTransactionDate = (
  date,
  fallbackDate = getTodayISODate(),
) => {
  return isValidISODate(date) ? date : fallbackDate;
};

export const filterByCategory = (transactions, category) => {
  if (category === CATEGORY_ALL) {
    return transactions;
  }

  return transactions.filter((transaction) => transaction.type === category);
};

export const filterByPeriod = (
  transactions,
  period,
  customRange = {},
  referenceDate = new Date(),
) => {
  const { startDate, endDate } = resolvePeriodRange(period, customRange, referenceDate);

  if (!startDate && !endDate) {
    return transactions;
  }

  const today = getTodayISODate(referenceDate);

  return transactions.filter((transaction) => {
    const transactionDate = normalizeTransactionDate(transaction.date, today);

    if (startDate && transactionDate < startDate) {
      return false;
    }

    if (endDate && transactionDate > endDate) {
      return false;
    }

    return true;
  });
};

export const calculateBalance = (transactions) => {
  return transactions.reduce((total, transaction) => {
    if (transaction.type === CATEGORY_EXIT) {
      return total - transaction.value;
    }

    return total + transaction.value;
  }, 0);
};

export const parseCurrencyInput = (rawValue) => {
  if (typeof rawValue !== "string") {
    return Number.NaN;
  }

  const normalizedValue = rawValue
    .trim()
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  const parsedValue = Number.parseFloat(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : Number.NaN;
};
