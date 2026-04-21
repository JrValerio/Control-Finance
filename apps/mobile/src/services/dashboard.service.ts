import { apiClient } from "./api";

export interface DashboardSnapshot {
  bankBalance: number;
  semanticCore: {
    realized: {
      confirmedInflowTotal: number;
      settledOutflowTotal: number;
      netAmount: number;
      referenceMonth: string;
    };
    projection: {
      projectedBalance: number;
      adjustedProjectedBalance: number;
    };
  };
}

export interface Transaction {
  id: string;
  description: string;
  value: number;
  type: "Entrada" | "Saída";
  date: string;
  category?: { name: string } | null;
}

export interface TransactionListResponse {
  data: Transaction[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
  };
}

export async function fetchSnapshot(): Promise<DashboardSnapshot> {
  const { data } = await apiClient.get<DashboardSnapshot>("/dashboard/snapshot");
  return data;
}

export async function fetchRecentTransactions(limit = 10): Promise<Transaction[]> {
  const { data } = await apiClient.get<TransactionListResponse>("/transactions", {
    params: { limit, sort: "date", page: 1 },
  });
  return Array.isArray(data) ? data : (data.data ?? []);
}
