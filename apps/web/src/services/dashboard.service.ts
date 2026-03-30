import { api } from "./api";

export interface DashboardBills {
  overdueCount: number;
  overdueTotal: number;
  dueSoonCount: number;
  dueSoonTotal: number;
}

export interface DashboardCards {
  openPurchasesTotal: number;
  pendingInvoicesTotal: number;
}

export interface DashboardIncome {
  receivedThisMonth: number;
  pendingThisMonth: number;
  referenceMonth: string;
}

export interface DashboardForecast {
  projectedBalance: number;
  month: string;
}

export interface DashboardConsignado {
  monthlyTotal: number;
  contractsCount: number;
  comprometimentoPct: number | null;
}

export interface DashboardSnapshot {
  bankBalance: number;
  bills: DashboardBills;
  cards: DashboardCards;
  income: DashboardIncome;
  forecast: DashboardForecast | null;
  consignado: DashboardConsignado;
}

const normalizeBills = (raw: Record<string, unknown>): DashboardBills => ({
  overdueCount: Number(raw.overdueCount) || 0,
  overdueTotal: Number(raw.overdueTotal) || 0,
  dueSoonCount: Number(raw.dueSoonCount) || 0,
  dueSoonTotal: Number(raw.dueSoonTotal) || 0,
});

const normalizeCards = (raw: Record<string, unknown>): DashboardCards => ({
  openPurchasesTotal: Number(raw.openPurchasesTotal) || 0,
  pendingInvoicesTotal: Number(raw.pendingInvoicesTotal) || 0,
});

const normalizeIncome = (raw: Record<string, unknown>): DashboardIncome => ({
  receivedThisMonth: Number(raw.receivedThisMonth) || 0,
  pendingThisMonth: Number(raw.pendingThisMonth) || 0,
  referenceMonth: String(raw.referenceMonth ?? ""),
});

const normalizeForecast = (raw: Record<string, unknown> | null): DashboardForecast | null => {
  if (!raw) return null;
  return {
    projectedBalance: Number(raw.projectedBalance) || 0,
    month: String(raw.month ?? ""),
  };
};

const normalizeConsignado = (raw: Record<string, unknown>): DashboardConsignado => ({
  monthlyTotal:       Number(raw.monthlyTotal) || 0,
  contractsCount:     Number(raw.contractsCount) || 0,
  comprometimentoPct: raw.comprometimentoPct != null ? Number(raw.comprometimentoPct) : null,
});

const normalizeSnapshot = (raw: Record<string, unknown>): DashboardSnapshot => ({
  bankBalance: Number(raw.bankBalance) || 0,
  bills: normalizeBills((raw.bills as Record<string, unknown>) ?? {}),
  cards: normalizeCards((raw.cards as Record<string, unknown>) ?? {}),
  income: normalizeIncome((raw.income as Record<string, unknown>) ?? {}),
  forecast: normalizeForecast(
    raw.forecast != null ? (raw.forecast as Record<string, unknown>) : null,
  ),
  consignado: normalizeConsignado((raw.consignado as Record<string, unknown>) ?? {}),
});

export const dashboardService = {
  getSnapshot: async (): Promise<DashboardSnapshot> => {
    const { data } = await api.get("/dashboard/snapshot");
    return normalizeSnapshot(data as Record<string, unknown>);
  },
};
