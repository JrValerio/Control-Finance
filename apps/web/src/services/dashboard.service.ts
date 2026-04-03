import { api, withApiRequestContext, type ApiRequestContext } from "./api";
import type {
  BalanceSnapshot,
  DashboardSnapshotResponse,
  IncomeEntry,
  Obligation,
} from "@control/contracts";

export type DashboardSnapshot = DashboardSnapshotResponse;

export interface DashboardFinancialContractView {
  balanceSnapshot: BalanceSnapshot;
  incomes: IncomeEntry[];
  obligations: Obligation[];
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const createObligations = (
  totalAmount: number,
  count: number,
  status: Obligation["status"],
  dueDate: Date,
): Obligation[] => {
  if (count <= 0 || totalAmount <= 0) {
    return [];
  }

  const itemAmount = totalAmount / count;
  return Array.from({ length: count }, () => ({
    amount: itemAmount,
    obligationType: "bill",
    dueDate: dueDate.toISOString(),
    status,
  }));
};

export const buildDashboardContractView = (
  snapshot: DashboardSnapshot,
  now: Date = new Date(),
): DashboardFinancialContractView => {
  const incomes: IncomeEntry[] = [];
  if (snapshot.income.receivedThisMonth > 0) {
    incomes.push({
      grossAmount: snapshot.income.receivedThisMonth,
      netAmount: snapshot.income.receivedThisMonth,
      status: "confirmed",
      incomeType: "salary",
      isInferred: true,
      sourceId: snapshot.income.referenceMonth,
    });
  }
  if (snapshot.income.pendingThisMonth > 0) {
    incomes.push({
      grossAmount: snapshot.income.pendingThisMonth,
      netAmount: snapshot.income.pendingThisMonth,
      status: "pending",
      incomeType: "salary",
      isInferred: true,
      sourceId: snapshot.income.referenceMonth,
    });
  }

  const obligations: Obligation[] = [
    ...createObligations(
      snapshot.bills.overdueTotal,
      snapshot.bills.overdueCount,
      "due",
      new Date(now.getTime() - DAY_IN_MS),
    ),
    ...createObligations(
      snapshot.bills.dueSoonTotal,
      snapshot.bills.dueSoonCount,
      "open",
      new Date(now.getTime() + 7 * DAY_IN_MS),
    ),
    ...createObligations(
      snapshot.bills.upcomingTotal,
      snapshot.bills.upcomingCount,
      "open",
      new Date(now.getTime() + 30 * DAY_IN_MS),
    ),
  ];

  const balanceSnapshot: BalanceSnapshot = {
    bankBalance: snapshot.bankBalance,
    technicalBalance: snapshot.bankBalance - snapshot.bills.overdueTotal,
    source: "bank_account",
    asOf: now.toISOString(),
  };

  return {
    balanceSnapshot,
    incomes,
    obligations,
  };
};

let snapshotInFlightRequest: Promise<DashboardSnapshot> | null = null;

export const dashboardService = {
  getSnapshot: async (context?: ApiRequestContext): Promise<DashboardSnapshot> => {
    if (snapshotInFlightRequest) {
      return snapshotInFlightRequest;
    }

    const requestPromise = api
      .get<DashboardSnapshot>("/dashboard/snapshot", withApiRequestContext(context))
      .then(({ data }) => data)
      .finally(() => {
        if (snapshotInFlightRequest === requestPromise) {
          snapshotInFlightRequest = null;
        }
      });

    snapshotInFlightRequest = requestPromise;
    return requestPromise;
  },
};
