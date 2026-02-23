import { dbQuery } from "../db/index.js";
import { getPendingBillsDueByDate } from "./bills.service.js";

const ENGINE_VERSION = "v1";

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
  const daysRemaining = calcDaysRemaining(now);

  // 1. Profile (salary + payday)
  const profileResult = await dbQuery(
    `SELECT salary_monthly, payday FROM user_profiles WHERE user_id = $1 LIMIT 1`,
    [uid],
  );
  const profile = profileResult.rows[0] ?? null;
  const salaryMonthly =
    profile?.salary_monthly != null ? Number(profile.salary_monthly) : null;
  const payday = profile?.payday != null ? Number(profile.payday) : null;

  // 2. This-month totals
  const monthlyResult = await dbQuery(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'Saida'  THEN value ELSE 0 END), 0) AS spending_to_date,
       COALESCE(SUM(CASE WHEN type = 'Entrada' THEN value ELSE 0 END), 0) AS income_to_date
     FROM transactions
     WHERE user_id   = $1
       AND deleted_at IS NULL
       AND date >= $2
       AND date <= $3`,
    [uid, mStart, mEnd],
  );
  const spendingToDate = Number(monthlyResult.rows[0].spending_to_date);
  const incomeToDate = Number(monthlyResult.rows[0].income_to_date);

  // 3. Daily average spending over last 60 days
  const sixtyDaysAgo = daysAgoStr(now, 60);
  const dailyResult = await dbQuery(
    `SELECT COALESCE(SUM(value), 0) AS total_60d
     FROM transactions
     WHERE user_id   = $1
       AND deleted_at IS NULL
       AND type      = 'Saida'
       AND date >= $2
       AND date <= $3`,
    [uid, sixtyDaysAgo, mEnd],
  );
  const total60d = Number(dailyResult.rows[0].total_60d);
  const dailyAvgSpending = total60d / 60;

  // 4. Expected income for rest of month:
  //    Add salary only if payday is still upcoming this month
  const incomeAdjustment =
    salaryMonthly != null && payday != null && payday > todayDay
      ? salaryMonthly
      : 0;

  // 5. Projected balance
  const netToDate = incomeToDate - spendingToDate;
  const projectedBalance = netToDate + incomeAdjustment - dailyAvgSpending * daysRemaining;

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
    [uid, mStart, ENGINE_VERSION, pb, salaryMonthly, spendingToDate.toFixed(2), da, daysRemaining, flipDetected, flipDirection],
  );

  const monthEnd = monthEndStr(now);
  const { billsTotal, billsCount } = await getPendingBillsDueByDate(uid, monthEnd);
  const adjustedProjectedBalance = Number((pb - billsTotal).toFixed(2));

  return {
    month: mStart.slice(0, 7),
    engineVersion: ENGINE_VERSION,
    projectedBalance: pb,
    incomeExpected: salaryMonthly,
    spendingToDate: Number(spendingToDate.toFixed(2)),
    dailyAvgSpending: da,
    daysRemaining,
    flipDetected,
    flipDirection,
    generatedAt: new Date().toISOString(),
    billsPendingTotal: Number(billsTotal.toFixed(2)),
    billsPendingCount: billsCount,
    adjustedProjectedBalance,
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
  const { billsTotal, billsCount } = await getPendingBillsDueByDate(uid, monthEnd);
  forecast.billsPendingTotal = Number(billsTotal.toFixed(2));
  forecast.billsPendingCount = billsCount;
  forecast.adjustedProjectedBalance = Number((forecast.projectedBalance - billsTotal).toFixed(2));
  return forecast;
};
