import { dbQuery } from "../db/index.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toNum = (v) => Number(v) || 0;
const toInt = (v) => Math.round(toNum(v));

// Returns YYYY-MM-DD from a Date
const toISODate = (d) => d.toISOString().slice(0, 10);

// Returns YYYY-MM from a Date
const toYearMonth = (d) => d.toISOString().slice(0, 7);

// ─── Snapshot ─────────────────────────────────────────────────────────────────

export const getDashboardSnapshot = async (userId) => {
  const uid = Number(userId);

  const now = new Date();
  const today = toISODate(now);
  const in7Days = toISODate(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
  const currentMonth = toYearMonth(now);

  const [
    bankRes,
    billsRes,
    cardPurchasesRes,
    cardInvoicesRes,
    incomeRes,
    forecastRes,
    consignadoRes,
  ] = await Promise.all([
    // 1. Total bank balance across active accounts
    dbQuery(
      `SELECT COALESCE(SUM(balance), 0) AS total
       FROM bank_accounts
       WHERE user_id = $1 AND is_active = true`,
      [uid],
    ),

    // 2. Bills: overdue + due in the next 7 days
    dbQuery(
      `SELECT
         COUNT(CASE WHEN status = 'pending' AND due_date < $2 THEN 1 END) AS overdue_count,
         COALESCE(SUM(CASE WHEN status = 'pending' AND due_date < $2 THEN amount ELSE 0 END), 0) AS overdue_total,
         COUNT(CASE WHEN status = 'pending' AND due_date >= $2 AND due_date < $3 THEN 1 END) AS due_soon_count,
         COALESCE(SUM(CASE WHEN status = 'pending' AND due_date >= $2 AND due_date < $3 THEN amount ELSE 0 END), 0) AS due_soon_total
       FROM bills
       WHERE user_id = $1`,
      [uid, today, in7Days],
    ),

    // 3a. Credit card open purchases (not yet billed)
    dbQuery(
      `SELECT COALESCE(SUM(p.amount), 0) AS total
       FROM credit_card_purchases p
       JOIN credit_cards cc ON cc.id = p.credit_card_id
       WHERE cc.user_id = $1 AND p.status = 'open'`,
      [uid],
    ),

    // 3b. Pending credit card invoice bills
    dbQuery(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM bills
       WHERE user_id = $1 AND status = 'pending' AND bill_type = 'credit_card_invoice'`,
      [uid],
    ),

    // 4. Income statements this month: received (posted) + pending (draft)
    dbQuery(
      `SELECT
         COALESCE(SUM(CASE WHEN st.status = 'posted' THEN st.net_amount ELSE 0 END), 0) AS received,
         COALESCE(SUM(CASE WHEN st.status = 'draft'  THEN st.net_amount ELSE 0 END), 0) AS pending
       FROM income_statements st
       JOIN income_sources src ON src.id = st.income_source_id
       WHERE src.user_id = $1 AND st.reference_month = $2`,
      [uid, currentMonth],
    ),

    // 5. Latest forecast
    dbQuery(
      `SELECT projected_balance, month
       FROM user_forecasts
       WHERE user_id = $1
       ORDER BY generated_at DESC
       LIMIT 1`,
      [uid],
    ),

    // 6. Consignado: sum of all monthly consignação amounts for this user
    dbQuery(
      `SELECT COALESCE(SUM(sc.amount), 0) AS total
       FROM salary_consignacoes sc
       JOIN salary_profiles sp ON sp.id = sc.salary_profile_id
       WHERE sp.user_id = $1`,
      [uid],
    ),
  ]);

  const bills = billsRes.rows[0] ?? {};
  const income = incomeRes.rows[0] ?? {};
  const forecastRow = forecastRes.rows[0] ?? null;

  return {
    bankBalance: toNum(bankRes.rows[0]?.total),
    bills: {
      overdueCount: toInt(bills.overdue_count),
      overdueTotal: toNum(bills.overdue_total),
      dueSoonCount: toInt(bills.due_soon_count),
      dueSoonTotal: toNum(bills.due_soon_total),
    },
    cards: {
      openPurchasesTotal: toNum(cardPurchasesRes.rows[0]?.total),
      pendingInvoicesTotal: toNum(cardInvoicesRes.rows[0]?.total),
    },
    income: {
      receivedThisMonth: toNum(income.received),
      pendingThisMonth: toNum(income.pending),
      referenceMonth: currentMonth,
    },
    forecast: forecastRow
      ? {
          projectedBalance: toNum(forecastRow.projected_balance),
          month: String(forecastRow.month),
        }
      : null,
    consignado: {
      monthlyTotal: toNum(consignadoRes.rows[0]?.total),
    },
  };
};
