import { dbQuery } from "../db/index.js";
import {
  DASHBOARD_SEMANTIC_SOURCE_MAP,
  type DashboardSemanticSourceMap,
} from "../domain/contracts/dashboard-response.schema.ts";

type NumericLike = number | string | null | undefined;

interface BillsRow {
  overdue_count?: NumericLike;
  overdue_total?: NumericLike;
  due_soon_count?: NumericLike;
  due_soon_total?: NumericLike;
  upcoming_count?: NumericLike;
  upcoming_total?: NumericLike;
}

interface IncomeRow {
  received?: NumericLike;
  pending?: NumericLike;
}

interface ForecastRow {
  projected_balance?: NumericLike;
  month?: string | Date | null;
}

interface ConsignadoRow {
  monthly_total?: NumericLike;
  contracts_count?: NumericLike;
  gross_salary?: NumericLike;
}

interface DashboardSnapshot {
  bankBalance: number;
  bills: {
    overdueCount: number;
    overdueTotal: number;
    dueSoonCount: number;
    dueSoonTotal: number;
    upcomingCount: number;
    upcomingTotal: number;
  };
  cards: {
    openPurchasesTotal: number;
    pendingInvoicesTotal: number;
  };
  income: {
    receivedThisMonth: number;
    pendingThisMonth: number;
    referenceMonth: string;
  };
  forecast: {
    projectedBalance: number;
    month: string;
  } | null;
  semanticCore: {
    semanticsVersion: "v1";
    realized: {
      confirmedInflowTotal: number;
      settledOutflowTotal: number;
      netAmount: number;
      referenceMonth: string;
    };
    currentPosition: {
      bankBalance: number;
      technicalBalance: number;
      asOf: string;
    };
    projection: {
      referenceMonth: string;
      projectedBalance: number;
      adjustedProjectedBalance: number;
      expectedInflow: number | null;
    };
  };
  semanticSourceMap: DashboardSemanticSourceMap;
  consignado: {
    monthlyTotal: number;
    contractsCount: number;
    comprometimentoPct: number | null;
  };
}

type DashboardSnapshotBase = Omit<DashboardSnapshot, "semanticCore">;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toNum = (value: NumericLike): number => Number(value) || 0;
const toInt = (value: NumericLike): number => Math.round(toNum(value));

// Returns YYYY-MM-DD from a Date
const toISODate = (dateValue: Date): string => dateValue.toISOString().slice(0, 10);

// Returns YYYY-MM from a Date
const toYearMonth = (dateValue: Date): string => dateValue.toISOString().slice(0, 7);

const normalizeYearMonth = (value: string | Date | null | undefined): string | null => {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return toYearMonth(value);
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const fromDate = new Date(raw);
  if (!Number.isNaN(fromDate.getTime())) {
    return toYearMonth(fromDate);
  }

  if (/^\d{4}-\d{2}/.test(raw)) {
    return raw.slice(0, 7);
  }

  return null;
};

const buildDashboardSemanticCore = (
  snapshot: DashboardSnapshotBase,
  asOf: Date,
): DashboardSnapshot["semanticCore"] => {
  const confirmedInflowTotal = Number(snapshot.income.receivedThisMonth.toFixed(2));
  const settledOutflowTotal = 0;
  const netAmount = Number((confirmedInflowTotal - settledOutflowTotal).toFixed(2));

  const projectionReferenceMonth = snapshot.forecast?.month ?? snapshot.income.referenceMonth;
  const projectedBalanceBase = snapshot.forecast?.projectedBalance ?? snapshot.bankBalance;
  const pendingObligationsTotal =
    snapshot.bills.overdueTotal +
    snapshot.bills.dueSoonTotal +
    snapshot.bills.upcomingTotal +
    snapshot.cards.openPurchasesTotal;
  const expectedInflow =
    snapshot.income.pendingThisMonth > 0 ? snapshot.income.pendingThisMonth : null;
  const adjustedProjectedBalance = Number(
    (projectedBalanceBase + (expectedInflow ?? 0) - pendingObligationsTotal).toFixed(2),
  );

  return {
    semanticsVersion: "v1",
    realized: {
      confirmedInflowTotal,
      settledOutflowTotal,
      netAmount,
      referenceMonth: snapshot.income.referenceMonth,
    },
    currentPosition: {
      bankBalance: snapshot.bankBalance,
      technicalBalance: Number(
        (snapshot.bankBalance - snapshot.bills.overdueTotal).toFixed(2),
      ),
      asOf: asOf.toISOString(),
    },
    projection: {
      referenceMonth: projectionReferenceMonth,
      projectedBalance: Number(projectedBalanceBase.toFixed(2)),
      adjustedProjectedBalance,
      expectedInflow,
    },
  };
};

// ─── Snapshot ─────────────────────────────────────────────────────────────────

export const getDashboardSnapshot = async (
  userId: number | string,
): Promise<DashboardSnapshot> => {
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

    // 2. Bills: overdue + due in the next 7 days (status filter in WHERE to leverage index)
    dbQuery(
      `SELECT
         COUNT(CASE WHEN due_date < $2 THEN 1 END) AS overdue_count,
         COALESCE(SUM(CASE WHEN due_date < $2 THEN amount ELSE 0 END), 0) AS overdue_total,
         COUNT(CASE WHEN due_date >= $2 AND due_date <= $3 THEN 1 END) AS due_soon_count,
         COALESCE(SUM(CASE WHEN due_date >= $2 AND due_date <= $3 THEN amount ELSE 0 END), 0) AS due_soon_total,
         COUNT(CASE WHEN due_date > $3 THEN 1 END) AS upcoming_count,
         COALESCE(SUM(CASE WHEN due_date > $3 THEN amount ELSE 0 END), 0) AS upcoming_total
       FROM bills
       WHERE user_id = $1 AND status = 'pending'`,
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

    // 6. Consignado: monthly total, contract count, gross salary for margin %
    dbQuery(
      `SELECT
         COALESCE(SUM(sc.amount), 0) AS monthly_total,
         COUNT(sc.id) AS contracts_count,
         sp.gross_salary
       FROM salary_profiles sp
       LEFT JOIN salary_consignacoes sc ON sc.salary_profile_id = sp.id
       WHERE sp.user_id = $1
       GROUP BY sp.gross_salary`,
      [uid],
    ),
  ]);

  const bills = (billsRes.rows[0] ?? {}) as BillsRow;
  const income = (incomeRes.rows[0] ?? {}) as IncomeRow;
  const forecastRow = (forecastRes.rows[0] ?? null) as ForecastRow | null;
  const forecastMonth = normalizeYearMonth(forecastRow?.month);

  const baseSnapshot: DashboardSnapshotBase = {
    bankBalance: toNum(bankRes.rows[0]?.total as NumericLike),
    semanticSourceMap: DASHBOARD_SEMANTIC_SOURCE_MAP,
    bills: {
      overdueCount: toInt(bills.overdue_count),
      overdueTotal: toNum(bills.overdue_total),
      dueSoonCount: toInt(bills.due_soon_count),
      dueSoonTotal: toNum(bills.due_soon_total),
      upcomingCount: toInt(bills.upcoming_count),
      upcomingTotal: toNum(bills.upcoming_total),
    },
    cards: {
      openPurchasesTotal: toNum(cardPurchasesRes.rows[0]?.total as NumericLike),
      pendingInvoicesTotal: toNum(cardInvoicesRes.rows[0]?.total as NumericLike),
    },
    income: {
      receivedThisMonth: toNum(income.received),
      pendingThisMonth: toNum(income.pending),
      referenceMonth: currentMonth,
    },
    forecast: forecastRow
      ? {
          projectedBalance: toNum(forecastRow.projected_balance),
          month: forecastMonth ?? currentMonth,
        }
      : null,
    consignado: (() => {
      const row = (consignadoRes.rows[0] ?? null) as ConsignadoRow | null;
      const monthlyTotal = toNum(row?.monthly_total);
      const contractsCount = toInt(row?.contracts_count);
      const grossSalary = toNum(row?.gross_salary);
      const comprometimentoPct =
        grossSalary > 0 && monthlyTotal > 0
          ? Number(((monthlyTotal / grossSalary) * 100).toFixed(1))
          : null;
      return { monthlyTotal, contractsCount, comprometimentoPct };
    })(),
  };

  return {
    ...baseSnapshot,
    semanticCore: buildDashboardSemanticCore(baseSnapshot, now),
    semanticSourceMap: DASHBOARD_SEMANTIC_SOURCE_MAP,
  };
};
