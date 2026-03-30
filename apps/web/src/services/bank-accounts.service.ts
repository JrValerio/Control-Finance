import { api } from "./api";

export interface BankAccountItem {
  id: number;
  userId: number;
  name: string;
  bankName: string | null;
  balance: number;
  limitTotal: number;
  limitUsed: number;
  limitAvailable: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BankAccountsSummary {
  totalBalance: number;
  totalLimitTotal: number;
  totalLimitUsed: number;
  totalLimitAvailable: number;
  accountsCount: number;
}

export interface BankAccountsListResult {
  accounts: BankAccountItem[];
  summary: BankAccountsSummary;
}

export interface CreateBankAccountPayload {
  name: string;
  bankName?: string | null;
  balance: number;
  limitTotal?: number;
}

export interface UpdateBankAccountPayload {
  name?: string;
  bankName?: string | null;
  balance?: number;
  limitTotal?: number;
}

export const bankAccountsService = {
  list: async (): Promise<BankAccountsListResult> => {
    const { data } = await api.get<BankAccountsListResult>("/bank-accounts");
    return data;
  },

  create: async (payload: CreateBankAccountPayload): Promise<BankAccountItem> => {
    const { data } = await api.post<BankAccountItem>("/bank-accounts", payload);
    return data;
  },

  update: async (id: number, payload: UpdateBankAccountPayload): Promise<BankAccountItem> => {
    const { data } = await api.patch<BankAccountItem>(`/bank-accounts/${id}`, payload);
    return data;
  },

  delete: async (id: number): Promise<{ deleted: boolean }> => {
    const { data } = await api.delete<{ deleted: boolean }>(`/bank-accounts/${id}`);
    return data;
  },
};
