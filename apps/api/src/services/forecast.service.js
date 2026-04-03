import { dbQuery } from "../db/index.js";
import { getPendingBillsDueByDate } from "./bills.service.js";

const ENGINE_VERSION = "v2";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeUserId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(401, "Usuario nao autenticado.");
  }
  return parsed;
};

// Returns "YYYY-MM-DD" for the first day of the month containing `now`
const monthStartStr = (now) => {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
};

// Returns "YYYY-MM-DD" for the last day of the month containing `now`
const monthEndStr = (now) => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return d.toISOString().slice(0, 10);
};

// Days remaining in the month (inclusive of today)
const calcDaysRemaining = (now) => {
  const lastDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return Math.max(1, lastDay - now.getUTCDate() + 1);
};

// "YYYY-MM-DD" for N days before `now`
const daysAgoStr = (now, days) => {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days),
  );
  return d.toISOString().slice(0, 10);
};

const rowToForecast = (row) => ({
  month: typeof row.month === "string" ? row.month.slice(0, 7) : row.month.toISOString().slice(0, 7),
  engineVersion: row.engine_version,
  projectedBalance: Number(row.projected_balance),
  incomeExpected: row.income_expected != null ? Number(row.income_expected) : null,
  spendingToDate: Number(row.spending_to_date),
  dailyAvgSpending: Number(row.daily_avg_spending),
  daysRemaining: Number(row.days_remaining),
  flipDetected: row.flip_detected,
  flipDirection: row.flip_direction ?? null,
  generatedAt: row.generated_at,
});

const buildBankLimitProjection = (bankLimitTotal, adjustedProjectedBalance) => {
  if (bankLimitTotal == null) return null;

  const total = Number(bankLimitTotal);
  if (!Number.isFinite(total) || total <= 0) return null;

  const projectedDeficit = adjustedProjectedBalance < 0
    ? Math.abs(Number(adjustedProjectedBalance))
    : 0;
  const used = Number(Math.min(projectedDeficit, total).toFixed(2));
  const remaining = Number(Math.max(total - used, 0).toFixed(2));
  const exceededBy = Number(Math.max(projectedDeficit - total, 0).toFixed(2));
  const usagePct = total > 0 ? Number(((used / total) * 100).toFixed(2)) : 0;

  let status = "unused";
  if (exceededBy > 0) {
    status = "exceeded";
  } else if (used > 0) {
    status = "using";
  }

  return {
    total: Number(total.toFixed(2)),
    used,
    remaining,
    exceededBy,
    usagePct,
    status,
    alertTriggered: status === "exceeded" || usagePct >= 80,
  };
};

const resolveBalanceBasis = (activeAccountsCount) =>
  activeAccountsCount > 0 ? "bank_account" : "net_month_transactions";

const resolveIncomeBasis = (hasStatementsThisMonth) =>
  hasStatementsThisMonth ? "confirmed_statement" : "salary_profile_fallback";

const getForecastPendingItems = async (userId, monthEnd, currentMonth) => {
  const billsResult = await dbQuery(
    `SELECT
       COUNT(*)::int AS bills_count,
       COUNT(*) FILTER (WHERE bill_type = 'credit_card_invoice')::int AS invoices_count
     FROM bills
     WHERE user_id  = $1
       AND status   = 'pending'
       AND due_date <= $2`,
    [userId, monthEnd],
  );

  const cyclesResult = await dbQuery(
    `SELECT COUNT(DISTINCT statement_month)::int AS cycles_count
     FROM credit_card_purchases
     WHERE user_id = $1
       AND status = 'open'
       AND statement_month IS NOT NULL
       AND statement_month <= $2`,
    [userId, currentMonth],
  );

  return {
    bills: Number(billsResult.rows[0]?.bills_count || 0),
    invoices: Number(billsResult.rows[0]?.invoices_count || 0),
    creditCardCycles: Number(cyclesResult.rows[0]?.cycles_count || 0),
  };
};

const buildForecastMeta = async ({
  userId,
  monthEnd,
  currentMonth,
  balanceBasis,
  incomeBasis,
}) => {
  const pendingItems = await getForecastPendingItems(userId, monthEnd, currentMonth);
  const fallbacksUsed = [];

  if (balanceBasis === "net_month_transactions") {
    fallbacksUsed.push("balanceBasis:net_month_transactions");
  }
  if (incomeBasis === "salary_profile_fallback") {
    fallbacksUsed.push("incomeBasis:salary_profile_fallback");
  }

  return {
    balanceBasis,
    incomeBasis,
    pendingItems,
    fallbacksUsed,
  };
};

/**
 * Computes (or recomputes) the forecast for the given user and month,
 * persists it, and returns the result.
 *
 * @param {number|string} userId
 * @param {{ now?: Date }} options  - injectable `now` for deterministic tests
 */
export const computeForecast = async (userId, { now = new Date() } = {}) => {
  const uid = normalizeUserId(userId);
  const mStart = monthStartStr(now);
  const mEnd = monthEndStr(now);
  const todayDay = now.getUTCDate();
  const todayStr = now.toISOString().slice(0, 10);
  const currentMonth = mStart.slice(0, 7); // 'YYYY-MM'
  const daysRemaining = calcDaysRemaining(now);

  // 1. Profile (salary + payday)
  const profileResult = await dbQuery(
    `SELECT salary_monthly, payday, bank_limit_total FROM user_profiles WHERE user_id = $1 LIMIT 1`,
    [uid],
  );
  const profile = profileResult.rows[0] ?? null;
  const salaryMonthly =
    profile?.salary_monthly != null ? Number(profile.salary_monthly) : null;
  const payday = profile?.payday != null ? Number(profile.payday) : null;
  const profileBankLimitTotal =
    profile?.bank_limit_total != null ? Number(profile.bank_limit_total) : null;

  // 2. Realized month totals (up to today only)
  const monthlyResult = await dbQuery(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'Saida'  THEN value ELSE 0 END), 0) AS spending_to_date,
       COALESCE(SUM(CASE WHEN type = 'Entrada' THEN value ELSE 0 END), 0) AS income_to_date
     FROM transactions
     WHERE user_id   = $1
       AND deleted_at IS NULL
       AND date >= $2
       AND date <= $3`,
    [uid, mStart, todayStr],
  );
  const spendingToDate = Number(monthlyResult.rows[0].spending_to_date);
  const incomeToDate = Number(monthlyResult.rows[0].income_to_date);

  // 2b. Real current balance base from active bank accounts.
  // If there are no active accounts yet, keep legacy fallback to realized net this month.
  const bankBalanceResult = await dbQuery(
    `SELECT
       COALESCE(SUM(balance), 0)::numeric AS total_balance,
       COALESCE(SUM(limit_total), 0)::numeric AS total_limit_total,
       COUNT(*)::int AS active_accounts_count
     FROM bank_accounts
     WHERE user_id = $1
       AND is_active = true`,
    [uid],
  );
  const totalBankBalance = Number(bankBalanceResult.rows[0]?.total_balance || 0);
  const totalBankLimitTotal = Number(bankBalanceResult.rows[0]?.total_limit_total || 0);
  const activeAccountsCount = Number(bankBalanceResult.rows[0]?.active_accounts_count || 0);
  const effectiveBankLimitTotal =
    activeAccountsCount > 0 ? totalBankLimitTotal : profileBankLimitTotal;

  // 3. Daily average spending over last 60 realized days (up to today)
  const sixtyDaysAgo = daysAgoStr(now, 60);
  const dailyResult = await dbQuery(
    `SELECT COALESCE(SUM(value), 0) AS total_60d
     FROM transactions
     WHERE user_id   = $1
       AND deleted_at IS NULL
       AND type      = 'Saida'
       AND date >= $2
       AND date <= $3`,
    [uid, sixtyDaysAgo, todayStr],
  );
  const total60d = Number(dailyResult.rows[0].total_60d);
  const dailyAvgSpending = total60d / 60;

  // 4a. income_expected — confirmed statements for current month.
  // Unconfirmed/draft statements are excluded from projection semantics.
  const stmtExpectedResult = await dbQuery(
    `SELECT COALESCE(SUM(st.net_amount), 0) AS total
     FROM income_statements st
     JOIN income_sources s ON s.id = st.income_source_id
     WHERE s.user_id = $1
       AND st.reference_month = $2
       AND st.status = 'posted'`,
    [uid, currentMonth],
  );
  const statementsExpected = Number(stmtExpectedResult.rows[0].total);

  // 4b. incomeAdjustment — confirmed inflows still in the future within the month.
  const stmtCashResult = await dbQuery(
    `SELECT COALESCE(SUM(st.net_amount), 0) AS total
     FROM income_statements st
     JOIN income_sources s ON s.id = st.income_source_id
     WHERE s.user_id = $1
       AND st.status = 'posted'
       AND st.payment_date > $2
       AND st.payment_date <= $3`,
    [uid, todayStr, mEnd],
  );
  const statementsCashPending = Number(stmtCashResult.rows[0].total);

  // 4c. Resolve incomeExpected and incomeAdjustment.
  // Confirmed statements win over salary; salary remains fallback only.
  const hasStatementsThisMonth = statementsExpected > 0;
  const incomeExpected = hasStatementsThisMonth
    ? statementsExpected
    : salaryMonthly;
  const incomeAdjustment = hasStatementsThisMonth
    ? statementsCashPending
    : salaryMonthly != null && payday != null && payday > todayDay
      ? salaryMonthly
      : 0;
  const balanceBasis = resolveBalanceBasis(activeAccountsCount);
  const incomeBasis = resolveIncomeBasis(hasStatementsThisMonth);

  // 5. Projected balance
  const netToDate = incomeToDate - spendingToDate;
  const realBalanceBase = activeAccountsCount > 0 ? totalBankBalance : netToDate;
  const projectedBalance = realBalanceBase + incomeAdjustment - dailyAvgSpending * daysRemaining;

  // 6. Flip detection against previous stored value
  const prevResult = await dbQuery(
    `SELECT projected_balance FROM user_forecasts
     WHERE user_id = $1 AND month = $2 LIMIT 1`,
    [uid, mStart],
  );
  let flipDetected = false;
  let flipDirection = null;
  if (prevResult.rows.length > 0) {
    const prev = Number(prevResult.rows[0].projected_balance);
    if (prev >= 0 && projectedBalance < 0) {
      flipDetected = true;
      flipDirection = "pos_to_neg";
    } else if (prev < 0 && projectedBalance >= 0) {
      flipDetected = true;
      flipDirection = "neg_to_pos";
    }
  }

  // 7. Upsert
  const pb = Number(projectedBalance.toFixed(2));
  const da = Number(dailyAvgSpending.toFixed(4));

  await dbQuery(
    `INSERT INTO user_forecasts
       (user_id, month, engine_version, projected_balance, income_expected,
        spending_to_date, daily_avg_spending, days_remaining,
        flip_detected, flip_direction, generated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     ON CONFLICT (user_id, month)
     DO UPDATE SET
       engine_version     = EXCLUDED.engine_version,
       projected_balance  = EXCLUDED.projected_balance,
       income_expected    = EXCLUDED.income_expected,
       spending_to_date   = EXCLUDED.spending_to_date,
       daily_avg_spending = EXCLUDED.daily_avg_spending,
       days_remaining     = EXCLUDED.days_remaining,
       flip_detected      = EXCLUDED.flip_detected,
       flip_direction     = EXCLUDED.flip_direction,
       generated_at       = EXCLUDED.generated_at`,
    [uid, mStart, ENGINE_VERSION, pb, incomeExpected, spendingToDate.toFixed(2), da, daysRemaining, flipDetected, flipDirection],
  );

  const monthEnd = monthEndStr(now);
  const { billsTotal, billsCount } = await getPendingBillsDueByDate(uid, monthEnd);
  const adjustedProjectedBalance = Number((pb - billsTotal).toFixed(2));
  const meta = await buildForecastMeta({
    userId: uid,
    monthEnd,
    currentMonth,
    balanceBasis,
    incomeBasis,
  });

  return {
    month: mStart.slice(0, 7),
    engineVersion: ENGINE_VERSION,
    projectedBalance: pb,
    incomeExpected,
    spendingToDate: Number(spendingToDate.toFixed(2)),
    dailyAvgSpending: da,
    daysRemaining,
    flipDetected,
    flipDirection,
    generatedAt: new Date().toISOString(),
    billsPendingTotal: Number(billsTotal.toFixed(2)),
    billsPendingCount: billsCount,
    adjustedProjectedBalance,
    bankLimit: buildBankLimitProjection(effectiveBankLimitTotal, adjustedProjectedBalance),
    _meta: meta,
  };
};

/**
 * Returns the stored forecast for the current month, or null if none exists.
 */
export const getLatestForecast = async (userId, { now = new Date() } = {}) => {
  const uid = normalizeUserId(userId);
  const mStart = monthStartStr(now);

  const result = await dbQuery(
    `SELECT * FROM user_forecasts WHERE user_id = $1 AND month = $2 LIMIT 1`,
    [uid, mStart],
  );

  if (result.rows.length === 0) return null;

  const forecast = rowToForecast(result.rows[0]);
  const monthEnd = monthEndStr(now);
  const currentMonth = mStart.slice(0, 7);
  const { billsTotal, billsCount } = await getPendingBillsDueByDate(uid, monthEnd);
  forecast.billsPendingTotal = Number(billsTotal.toFixed(2));
  forecast.billsPendingCount = billsCount;
  forecast.adjustedProjectedBalance = Number((forecast.projectedBalance - billsTotal).toFixed(2));
  const profileResult = await dbQuery(
    `SELECT bank_limit_total FROM user_profiles WHERE user_id = $1 LIMIT 1`,
    [uid],
  );
  const profileBankLimitTotal =
    profileResult.rows[0]?.bank_limit_total != null
      ? Number(profileResult.rows[0].bank_limit_total)
      : null;

  const bankLimitResult = await dbQuery(
    `SELECT
       COALESCE(SUM(limit_total), 0)::numeric AS total_limit_total,
       COUNT(*)::int AS active_accounts_count
     FROM bank_accounts
     WHERE user_id = $1
       AND is_active = true`,
    [uid],
  );
  const totalBankLimitTotal = Number(bankLimitResult.rows[0]?.total_limit_total || 0);
  const activeAccountsCount = Number(bankLimitResult.rows[0]?.active_accounts_count || 0);
  const effectiveBankLimitTotal =
    activeAccountsCount > 0 ? totalBankLimitTotal : profileBankLimitTotal;

  const stmtExpectedResult = await dbQuery(
    `SELECT COALESCE(SUM(st.net_amount), 0) AS total
     FROM income_statements st
     JOIN income_sources s ON s.id = st.income_source_id
     WHERE s.user_id = $1
       AND st.reference_month = $2
       AND st.status = 'posted'`,
    [uid, currentMonth],
  );
  const hasStatementsThisMonth = Number(stmtExpectedResult.rows[0]?.total || 0) > 0;
  const balanceBasis = resolveBalanceBasis(activeAccountsCount);
  const incomeBasis = resolveIncomeBasis(hasStatementsThisMonth);

  forecast.bankLimit = buildBankLimitProjection(
    effectiveBankLimitTotal,
    forecast.adjustedProjectedBalance,
  );
  forecast._meta = await buildForecastMeta({
    userId: uid,
    monthEnd,
    currentMonth,
    balanceBasis,
    incomeBasis,
  });
  return forecast;
};
