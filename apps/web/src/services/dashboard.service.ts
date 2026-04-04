import { api, withApiRequestContext, type ApiRequestContext } from "./api";
import { DASHBOARD_SEMANTIC_SOURCE_MAP } from "@control/contracts";
import type {
  BalanceSnapshot,
  CoreFinancialSemanticContract,
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
const DRIFT_EPSILON = 0.005;

const isCloseEnough = (a: number, b: number): boolean => Math.abs(a - b) <= DRIFT_EPSILON;

const assertDashboardSemanticContract = (snapshot: DashboardSnapshot): void => {
  const semanticCore = snapshot.semanticCore;

  if (semanticCore.semanticsVersion !== "v1") {
    throw new Error("DASHBOARD_SEMANTIC_DRIFT: unsupported semanticsVersion for dashboard slice");
  }

  if (
    JSON.stringify(snapshot.semanticSourceMap) !==
    JSON.stringify(DASHBOARD_SEMANTIC_SOURCE_MAP)
  ) {
    throw new Error("DASHBOARD_SEMANTIC_DRIFT: semanticSourceMap does not match canonical dashboard mapping");
  }

  if (!isCloseEnough(snapshot.bankBalance, semanticCore.currentPosition.bankBalance)) {
    throw new Error("DASHBOARD_SEMANTIC_DRIFT: dashboard.bankBalance diverges from semanticCore.currentPosition.bankBalance");
  }

  if (!isCloseEnough(snapshot.income.receivedThisMonth, semanticCore.realized.confirmedInflowTotal)) {
    throw new Error("DASHBOARD_SEMANTIC_DRIFT: dashboard.income.receivedThisMonth diverges from semanticCore.realized.confirmedInflowTotal");
  }

  const expectedProjectionInflow =
    snapshot.income.pendingThisMonth > 0 ? snapshot.income.pendingThisMonth : null;

  if (expectedProjectionInflow !== semanticCore.projection.expectedInflow) {
    throw new Error("DASHBOARD_SEMANTIC_DRIFT: dashboard.income.pendingThisMonth diverges from semanticCore.projection.expectedInflow");
  }

  const expectedProjectedBalance = snapshot.forecast
    ? snapshot.forecast.projectedBalance
    : snapshot.bankBalance;

  if (!isCloseEnough(expectedProjectedBalance, semanticCore.projection.projectedBalance)) {
    throw new Error("DASHBOARD_SEMANTIC_DRIFT: dashboard.forecast.projectedBalance diverges from semanticCore.projection.projectedBalance");
  }
};

const toAsOfISOString = (
  asOf: CoreFinancialSemanticContract["currentPosition"]["asOf"],
): string => (typeof asOf === "string" ? asOf : asOf.toISOString());

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

const createCardObligation = (
  amount: number,
  obligationType: "credit_card_cycle" | "open_invoice",
  dueDate: Date,
): Obligation[] => {
  if (amount <= 0) {
    return [];
  }

  return [{
    amount,
    obligationType,
    dueDate: dueDate.toISOString(),
    status: "open",
  }];
};

export const buildDashboardContractView = (
  snapshot: DashboardSnapshot,
  now: Date = new Date(),
): DashboardFinancialContractView => {
  assertDashboardSemanticContract(snapshot);

  const semanticCore = snapshot.semanticCore;
  const confirmedInflow = semanticCore.realized.confirmedInflowTotal;
  const expectedInflow = semanticCore.projection.expectedInflow ?? 0;

  const incomes: IncomeEntry[] = [];
  if (confirmedInflow > 0) {
    incomes.push({
      grossAmount: confirmedInflow,
      netAmount: confirmedInflow,
      status: "confirmed",
      incomeType: "salary",
      isInferred: true,
      sourceId: semanticCore.realized.referenceMonth,
    });
  }
  if (expectedInflow > 0) {
    incomes.push({
      grossAmount: expectedInflow,
      netAmount: expectedInflow,
      status: "pending",
      incomeType: "salary",
      isInferred: true,
      sourceId: semanticCore.projection.referenceMonth,
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
    ...createCardObligation(
      snapshot.cards.openPurchasesTotal,
      "credit_card_cycle",
      new Date(now.getTime() + 30 * DAY_IN_MS),
    ),
    ...createCardObligation(
      snapshot.cards.pendingInvoicesTotal,
      "open_invoice",
      new Date(now.getTime() + 10 * DAY_IN_MS),
    ),
  ];

  const balanceSnapshot: BalanceSnapshot = {
    bankBalance: semanticCore.currentPosition.bankBalance,
    technicalBalance: semanticCore.currentPosition.technicalBalance,
    source: "bank_account",
    asOf: toAsOfISOString(semanticCore.currentPosition.asOf),
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
      .then(({ data }) => {
        assertDashboardSemanticContract(data);
        return data;
      })
      .finally(() => {
        if (snapshotInFlightRequest === requestPromise) {
          snapshotInFlightRequest = null;
        }
      });

    snapshotInFlightRequest = requestPromise;
    return requestPromise;
  },
};
